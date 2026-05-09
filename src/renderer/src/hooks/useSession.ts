import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PersistedTurn, SessionEvent, SessionMetadata } from "@flow-build/core";

type State = {
  metadata?: SessionMetadata;
  turns: PersistedTurn[];
  loading: boolean;
  error?: string;
};

type Action =
  | { type: "loaded"; metadata: SessionMetadata; turns: PersistedTurn[] }
  | { type: "event"; ev: SessionEvent }
  | { type: "error"; message: string }
  | { type: "reset" };

function applyEvent(turns: PersistedTurn[], ev: SessionEvent): PersistedTurn[] {
  if (ev.type === "user") {
    return [
      ...turns,
      {
        turnId: ev.turnId,
        user: { text: ev.text, ts: new Date().toISOString() },
        assistant: { textBlocks: [], toolCalls: [] },
        status: "running",
      },
    ];
  }
  const idx = turns.findIndex((t) => t.turnId === ev.turnId);
  if (idx < 0) return turns;
  const next = turns.slice();
  const t = { ...next[idx]!, assistant: { ...next[idx]!.assistant } };
  next[idx] = t;
  switch (ev.type) {
    case "turn_open":
    case "turn_start":
      t.status = "running";
      break;
    case "text":
      t.assistant.textBlocks = [...t.assistant.textBlocks, ev.delta];
      break;
    case "thinking":
      t.assistant.thinking = [...(t.assistant.thinking ?? []), ev.delta];
      break;
    case "tool_start":
      t.assistant.toolCalls = [
        ...t.assistant.toolCalls,
        { callId: ev.callId, name: ev.name, ...(ev.args !== undefined ? { args: ev.args } : {}) },
      ];
      break;
    case "tool_end": {
      const tcIdx = t.assistant.toolCalls.findIndex((c) => c.callId === ev.callId);
      if (tcIdx >= 0) {
        const tcs = t.assistant.toolCalls.slice();
        const tc = { ...tcs[tcIdx]! };
        tc.ok = ev.ok;
        if (ev.args !== undefined) tc.args = ev.args;
        if (ev.result !== undefined) tc.result = ev.result;
        tcs[tcIdx] = tc;
        t.assistant.toolCalls = tcs;
      }
      break;
    }
    case "turn_end":
      t.status = ev.status;
      if (ev.usage) t.usage = ev.usage;
      break;
    case "error":
    case "status":
    default:
      break;
  }
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { metadata: action.metadata, turns: action.turns, loading: false };
    case "event": {
      if (action.ev.type === "error" && action.ev.code === "DELETED") {
        return { ...state, error: "session deleted" };
      }
      return { ...state, turns: applyEvent(state.turns, action.ev) };
    }
    case "error":
      return { ...state, loading: false, error: action.message };
    case "reset":
      return { turns: [], loading: true };
  }
}

export function useSession(sessionId: string | undefined): {
  metadata?: SessionMetadata;
  turns: PersistedTurn[];
  loading: boolean;
  error?: string;
  send: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
} {
  const [state, dispatch] = useReducer(reducer, { turns: [], loading: !!sessionId });
  const unsubRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    dispatch({ type: "reset" });
    window.api.session
      .open(sessionId)
      .then(({ metadata, turns }) => {
        if (cancelled) return;
        dispatch({ type: "loaded", metadata, turns });
      })
      .catch((e) => dispatch({ type: "error", message: (e as Error).message }));
    unsubRef.current = window.api.session.watch(sessionId, (ev) =>
      dispatch({ type: "event", ev }),
    );
    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = undefined;
    };
  }, [sessionId]);

  const send = useCallback(
    async (prompt: string) => {
      if (!sessionId) return;
      await window.api.session.send(sessionId, prompt);
    },
    [sessionId],
  );

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    await window.api.session.cancel(sessionId);
  }, [sessionId]);

  return { ...state, send, cancel };
}
