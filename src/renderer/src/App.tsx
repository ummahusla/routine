import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { NODE_W, NODE_H, GAP_X } from "./data/constants";
import { topoLayers, nodePos } from "./utils/flow";
import { flowbuilderStateToFlow } from "./utils/flowbuilder";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { EmptyState } from "./components/EmptyState";
import { ChatThread } from "./components/ChatThread";
import { FlowCanvas } from "./components/FlowCanvas";
import { FlowLegend } from "./components/FlowLegend";
import { NodeInspector } from "./components/NodeInspector";
import { PromptBox } from "./components/PromptBox";
import { RunSidebar } from "./components/RunSidebar";
import { useSession } from "./hooks/useSession";
import type { ModelInfo } from "@flow-build/core";
import type {
  Flow,
  FlowEdge,
  FlowNode,
  FlowbuilderManifest,
  FlowbuilderSessionSummary,
  FlowbuilderState,
  PaletteItem,
  RunState,
} from "./types";
import { RunInputDialog, type RequiredInputSpec } from "./components/RunInputDialog";

// Static design constants (replaces the previous tweakable values)
const ACCENT = "#5fc88f";
const DENSITY = "regular" as const;

// Status reported by the real engine via window.api.run events. Wider than
// the legacy simulated RunState (pending|running|done) — adds error/skipped.
type NodeRunStatus = "pending" | "running" | "done" | "error" | "skipped";

type RunEventLike =
  | { type: "run_start" }
  | { type: "node_start"; nodeId: string }
  | { type: "node_text"; nodeId: string; chunk: string }
  | { type: "node_end"; nodeId: string; status: string; error?: string }
  | { type: "run_end"; status: string; error?: string };

const SMART_ADD_ITEMS = {
  prompt: {
    type: "prompt",
    icon: "llm",
    label: "Prompt block",
    sub: "editable",
    prompt: "You are a helpful assistant. {{ input }}",
  },
  slack: { type: "output", icon: "slack", label: "Slack message", sub: "#channel" },
  email: { type: "output", icon: "mail", label: "Send email", sub: "smtp" },
  webhook: { type: "trigger", icon: "webhook", label: "Webhook", sub: "POST /event" },
  http: { type: "http", icon: "http", label: "HTTP request", sub: "GET /..." },
  llm: { type: "llm", icon: "llm", label: "LLM call", sub: "claude-sonnet", prompt: "Summarize {{input}}" },
  filter: { type: "filter", icon: "filter", label: "Filter", sub: "where ..." },
  approval: { type: "human", icon: "user", label: "Human approval", sub: "slack approval" },
  database: { type: "storage", icon: "db", label: "Database", sub: "supabase · query" },
  spreadsheet: { type: "storage", icon: "sheet", label: "Spreadsheet", sub: "google sheets" },
  schedule: { type: "trigger", icon: "schedule", label: "Schedule", sub: "every day · 09:00" },
  transform: { type: "transform", icon: "transform", label: "Transform", sub: "map · reduce" },
  code: { type: "transform", icon: "code", label: "Code", sub: "javascript" },
} satisfies Record<string, PaletteItem>;

/** Prefer the sink output node when multiple exist (matches engine final output). */
function pickPrimaryOutputNode(nodes: FlowNode[], edges: FlowEdge[]): FlowNode | undefined {
  const outs = nodes.filter((n) => n.type === "output");
  if (outs.length === 0) return undefined;
  if (outs.length === 1) return outs[0];
  const hasOutgoing = new Set(edges.map(([from]) => from));
  const sinks = outs.filter((o) => !hasOutgoing.has(o.id));
  if (sinks.length === 1) return sinks[0];
  return outs[outs.length - 1];
}

function SessionPanel({
  title,
  body,
  detail,
  action,
}: {
  title: string;
  body: string;
  detail?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}) {
  return (
    <div className="session-empty">
      <div className="empty-mark">
        <svg viewBox="0 0 40 40" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="14" width="10" height="12" rx="3" />
          <rect x="27" y="6" width="10" height="12" rx="3" />
          <rect x="27" y="22" width="10" height="12" rx="3" />
          <path d="M13 20h7M20 20v-8h7M20 20v8h7" />
        </svg>
      </div>
      <h1 className="empty-h">{title}</h1>
      <p className="empty-sub">{body}</p>
      {detail && <code className="session-path">{detail}</code>}
      {action && (
        <button className="session-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function App() {
  const [sessions, setSessions] = useState<FlowbuilderSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState("");
  const [manifest, setManifest] = useState<FlowbuilderManifest | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [fbState, setFbState] = useState<FlowbuilderState | null>(null);
  const [pendingInputs, setPendingInputs] = useState<RequiredInputSpec[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunState>({});
  // Real-engine run wiring (Task 25). The legacy simulated runner above
  // animates the canvas after a build; the states below track an actual
  // engine run driven by the Play button via window.api.run.*.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  /** True from Play until execute/watch settles or run_end; avoids double-starts before activeRunId exists */
  const [engineRunBusy, setEngineRunBusy] = useState(false);
  const [, setRunStatuses] = useState<Map<string, NodeRunStatus>>(new Map());
  const [nodeStreams, setNodeStreams] = useState<Map<string, string>>(new Map());
  const [nodeErrors, setNodeErrors] = useState<Map<string, string>>(new Map());
  const [runListTick, setRunListTick] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [refineVal, setRefineVal] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [globalDefault, setGlobalDefault] = useState<string>("composer-2");
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [chatHeight, setChatHeight] = useState(180);
  const [reloadKey, setReloadKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("flowbuild:sidebarCollapsed") === "1";
  });
  const [narrowViewport, setNarrowViewport] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < 820,
  );
  const stopRef = useRef(false);
  const engineRunLockRef = useRef(false);
  const prevSessionIdRef = useRef<string | null>(null);
  const lastFlowbuilderCallRef = useRef<string | null>(null);

  const { metadata, turns, loading: loadingTurns, send, cancel, clear } = useSession(selectedSessionId ?? undefined, reloadKey);
  const lastTurn = turns[turns.length - 1];
  const isRunning = lastTurn?.status === "running";

  const isRail = sidebarCollapsed || narrowViewport;

  useEffect(() => {
    function onResize(): void {
      setNarrowViewport(window.innerWidth < 820);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setChatError(null);
    setConfirmClearOpen(false);
    setSelectedModel(undefined);
    setSelectedRunId(null);
  }, [selectedSessionId]);

  const handleRunSidebarSelect = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      if (!flow) return;
      const outputNode = pickPrimaryOutputNode(flow.nodes, flow.edges);
      if (outputNode) setFocusId(outputNode.id);
    },
    [flow],
  );

  useEffect(() => {
    if (!confirmClearOpen) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setConfirmClearOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmClearOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, def] = await Promise.all([
        window.api.models.list(),
        window.api.app.getDefaultModel(),
      ]);
      if (cancelled) return;
      setModels(list);
      setGlobalDefault(def);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (metadata?.model) setSelectedModel(metadata.model);
  }, [metadata?.model]);

  const persistDefault = useCallback((id: string) => {
    setGlobalDefault(id);
    void window.api.app.setDefaultModel(id);
  }, []);

  function handleModelChange(id: string): void {
    setSelectedModel(id);
    persistDefault(id);
  }

  const handleToggleSidebar = useCallback((): void => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("flowbuild:sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const readOnlySession = Boolean(selectedSessionId);

  const loadSessions = useCallback(async (preferredId?: string | null): Promise<void> => {
    setLoadingSessions(true);
    setError(null);

    try {
      const result = await window.api.flowbuilder.listSessions();
      setBaseDir(result.baseDir);

      if (!result.ok) {
        setSessions([]);
        setSelectedSessionId(null);
        setFlow(null);
        setManifest(null);
        setFbState(null);
        setError(result.error);
        return;
      }

      setSessions(result.sessions);
      const nextId =
        preferredId && result.sessions.some((session) => session.id === preferredId)
          ? preferredId
          : (result.sessions[0]?.id ?? null);
      setSelectedSessionId(nextId);
      if (!nextId) {
        setFlow(null);
        setManifest(null);
        setFbState(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown flowbuilder session list error");
      setSessions([]);
      setSelectedSessionId(null);
      setFlow(null);
      setManifest(null);
      setFbState(null);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      prevSessionIdRef.current = null;
      lastFlowbuilderCallRef.current = null;
      return;
    }
    const isSwitch = prevSessionIdRef.current !== selectedSessionId;
    prevSessionIdRef.current = selectedSessionId;
    if (isSwitch) lastFlowbuilderCallRef.current = null;

    let cancelled = false;
    setLoadingSession(true);
    setError(null);
    if (isSwitch) {
      setBuilding(true);
      setFlow(null);
      setManifest(null);
      setFbState(null);
      setFocusId(null);
      setRunState({});
    }

    window.api.flowbuilder
      .readSession(selectedSessionId)
      .then((result) => {
        if (cancelled) return;
        setBaseDir(result.baseDir);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setManifest(result.manifest);
        setFbState(result.state);
        setFlow(flowbuilderStateToFlow(result.manifest, result.state));
      })
      .catch((readError: unknown) => {
        if (cancelled) return;
        setError(readError instanceof Error ? readError.message : "Unknown flowbuilder session read error");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSession(false);
        setBuilding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, reloadKey]);

  useEffect(() => {
    if (!selectedSessionId || turns.length === 0) return;
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i]!;
      const calls = turn.assistant.toolCalls;
      for (let j = calls.length - 1; j >= 0; j--) {
        const call = calls[j]!;
        if (call.ok !== true) continue;
        const args = call.args as { toolName?: unknown } | undefined;
        const isFlowbuilderWrite =
          call.name.includes("flowbuilder_set_state") ||
          (call.name === "mcp" && args?.toolName === "flowbuilder_set_state");
        if (isFlowbuilderWrite) {
          if (lastFlowbuilderCallRef.current !== call.callId) {
            lastFlowbuilderCallRef.current = call.callId;
            setReloadKey((current) => current + 1);
          }
          return;
        }
      }
    }
  }, [turns, selectedSessionId]);

  function handleSelect(id: string): void {
    if (id === selectedSessionId) return;
    setSelectedSessionId(id);
  }

  function handleRefresh(): void {
    void loadSessions(selectedSessionId);
    if (selectedSessionId) setReloadKey((current) => current + 1);
  }

  function handleNew(): void {
    setSelectedSessionId(null);
    setManifest(null);
    setFlow(null);
    setFbState(null);
    setBuilding(false);
    setRunning(false);
    setRunState({});
    setFocusId(null);
    setError(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        handleNew();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSubmit(text: string, model: string): Promise<void> {
    setManifest(null);
    setBuilding(true);
    setRunState({});
    setFlow(null);
    setFbState(null);

    try {
      const { sessionId } = await window.api.session.create({ title: text.slice(0, 80), model });
      setSelectedSessionId(sessionId);
      void loadSessions(sessionId);
      persistDefault(model);
      window.api.session
        .send(sessionId, text, model)
        .catch(() => {})
        .finally(() => setReloadKey((current) => current + 1));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create session");
      setBuilding(false);
    }
  }

  // Re-run the auto-layout: drop any user-set x/y coordinates and recompute
  // each node's column (topological layer) and row (in-layer index).
  function handleTidy(): void {
    setFlow((current) => {
      if (!current) return current;
      const layers = topoLayers(current);
      const placed = new Set<string>(layers.flat());
      const orphans = current.nodes.filter((n) => !placed.has(n.id)).map((n) => n.id);
      if (orphans.length) layers.push(orphans);
      const layerOf: Record<string, number> = {};
      const rowOf: Record<string, number> = {};
      layers.forEach((ids, ci) => ids.forEach((id, ri) => {
        layerOf[id] = ci;
        rowOf[id] = ri;
      }));
      return {
        ...current,
        nodes: current.nodes.map((node) => {
          const { x: _x, y: _y, _userPlaced: _placed, ...rest } = node;
          return { ...rest, col: layerOf[node.id] ?? 0, row: rowOf[node.id] ?? 0 };
        }),
      };
    });
  }

  async function handleRun(): Promise<void> {
    if (!flow || running || readOnlySession) return;
    stopRef.current = false;
    setRunning(true);
    const layers = topoLayers(flow);
    const seed: RunState = Object.fromEntries(flow.nodes.map((node) => [node.id, "pending"]));
    setRunState(seed);

    for (const layer of layers) {
      if (stopRef.current) break;
      setRunState((state) => {
        const next: RunState = { ...state };
        layer.forEach((id) => (next[id] = "running"));
        return next;
      });
      requestAnimationFrame(() => scrollToNodes(layer));
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      if (stopRef.current) break;
      setRunState((state) => {
        const next: RunState = { ...state };
        layer.forEach((id) => (next[id] = "done"));
        return next;
      });
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }

    setRunning(false);
  }

  function scrollToNodes(ids: string[]): void {
    const wrap = document.querySelector<HTMLElement>(".cf-canvas-wrap");
    if (!wrap || !flow) return;
    const targets = flow.nodes.filter((node) => ids.includes(node.id));
    if (!targets.length) return;

    const xs = targets.map((node) => nodePos(node).x);
    const ys = targets.map((node) => nodePos(node).y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + NODE_H;
    const padOuter = 16;
    const cx = padOuter + (minX + maxX) / 2;
    const cy = padOuter + (minY + maxY) / 2;

    wrap.scrollTo({
      left: Math.max(0, cx - wrap.clientWidth / 2),
      top: Math.max(0, cy - wrap.clientHeight / 2),
      behavior: "smooth",
    });
  }

  async function handleReplayFrom(startId: string): Promise<void> {
    if (!flow || running || readOnlySession) return;

    const adj: Record<string, string[]> = {};
    flow.edges.forEach(([from, to]) => {
      (adj[from] ||= []).push(to);
    });
    const subset = new Set<string>([startId]);
    const stack = [startId];
    while (stack.length) {
      const cur = stack.pop()!;
      (adj[cur] || []).forEach((next) => {
        if (!subset.has(next)) {
          subset.add(next);
          stack.push(next);
        }
      });
    }

    const layers = topoLayers(flow)
      .map((layer) => layer.filter((id) => subset.has(id)))
      .filter((layer) => layer.length > 0);

    if (!layers.length) return;

    stopRef.current = false;
    setRunning(true);
    setRunState((state) => {
      const next: RunState = { ...state };
      subset.forEach((id) => (next[id] = "pending"));
      return next;
    });

    for (const layer of layers) {
      if (stopRef.current) break;
      setRunState((state) => {
        const next: RunState = { ...state };
        layer.forEach((id) => (next[id] = "running"));
        return next;
      });
      requestAnimationFrame(() => scrollToNodes(layer));
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      if (stopRef.current) break;
      setRunState((state) => {
        const next: RunState = { ...state };
        layer.forEach((id) => (next[id] = "done"));
        return next;
      });
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }

    setRunning(false);
  }

  function handleStop(): void {
    stopRef.current = true;
    setRunning(false);
  }

  // Enable Play when the engine can execute: non-empty graph, no branch/merge
  // (topo rejects those). An output node is optional—the run still succeeds
  // and ends at the last step; only runs with an output node get a finalOutput.
  // Root flow/llm/input nodes get an empty upstream envelope when they have no inputs.
  const canRun = useMemo(() => {
    if (!selectedSessionId || !fbState) return false;
    if (fbState.nodes.length === 0) return false;
    if (fbState.nodes.some((n) => n.type === "branch" || n.type === "merge")) return false;
    return true;
  }, [selectedSessionId, fbState]);

  // Drive a real engine run via the preload IPC bridge. This replaces the
  // simulated handleRun for Play-button-initiated executions; the simulated
  // runner is still used by the chat-driven /run command and the build-time
  // animation, since those don't necessarily target the engine yet.
  function handlePlay(): void {
    if (!selectedSessionId || !fbState || engineRunBusy || activeRunId !== null) return;
    const missing: RequiredInputSpec[] = fbState.nodes
      .filter((n): n is Extract<typeof n, { type: "input" }> => n.type === "input")
      .filter((n) => n.required && (n.value === undefined || n.value === null || n.value === ""))
      .map((n) => ({
        id: n.id,
        label: n.label || n.id,
        description: n.description,
      }));
    if (missing.length > 0) {
      setPendingInputs(missing);
      return;
    }
    void launchRun();
  }

  function releaseEngineRunLock(): void {
    engineRunLockRef.current = false;
    setEngineRunBusy(false);
  }

  async function launchRun(inputs?: Record<string, unknown>): Promise<void> {
    if (!selectedSessionId) return;
    if (engineRunLockRef.current) return;
    engineRunLockRef.current = true;
    setEngineRunBusy(true);
    setRunStatuses(new Map());
    setNodeStreams(new Map());
    setNodeErrors(new Map());
    setRunState((current) => {
      const cleared: RunState = { ...current };
      Object.keys(cleared).forEach((id) => {
        cleared[id] = "pending";
      });
      return cleared;
    });

    try {
    const r = await window.api.run.execute(
      inputs ? { sessionId: selectedSessionId, inputs } : { sessionId: selectedSessionId },
    );
    if (!r.ok) {
      toast.error(r.error);
      releaseEngineRunLock();
      return;
    }
    setActiveRunId(r.runId);

    const watch = await window.api.run.watch({ sessionId: selectedSessionId, runId: r.runId });
    if (!watch.ok) {
      toast.error(watch.error);
      setActiveRunId(null);
      releaseEngineRunLock();
      return;
    }
    const subscriptionId = watch.subscriptionId;

    const off = window.api.run.onEvent(({ runId, event }) => {
      if (runId !== r.runId) return;
      const ev = event as RunEventLike;
      if (ev.type === "node_start") {
        setRunStatuses((m) => new Map(m).set(ev.nodeId, "running"));
        setRunState((state) => ({ ...state, [ev.nodeId]: "running" }));
      } else if (ev.type === "node_text") {
        setNodeStreams((m) => {
          const next = new Map(m);
          next.set(ev.nodeId, (next.get(ev.nodeId) ?? "") + ev.chunk);
          return next;
        });
      } else if (ev.type === "node_end") {
        const status = ev.status as NodeRunStatus;
        setRunStatuses((m) => new Map(m).set(ev.nodeId, status));
        // Map to legacy RunState: only pending|running|done are valid there.
        setRunState((state) => ({
          ...state,
          [ev.nodeId]: status === "done" ? "done" : status === "running" ? "running" : "pending",
        }));
        if (status === "error" && ev.error) {
          setNodeErrors((m) => new Map(m).set(ev.nodeId, ev.error!));
        }
      } else if (ev.type === "run_end") {
        off();
        void window.api.run.unwatch({ subscriptionId });
        setActiveRunId(null);
        releaseEngineRunLock();
        setRunListTick((t) => t + 1);
        const shortId = runId.slice(0, 8);
        if (ev.status === "failed") {
          toast.error(ev.error ?? "Run failed", { description: shortId });
        } else if (ev.status === "succeeded") {
          toast.success("Run finished", { description: `Run ${shortId}` });
        } else if (ev.status === "cancelled") {
          toast.message("Run cancelled", { description: shortId });
        }
      }
    });
    } catch (launchErr: unknown) {
      toast.error(launchErr instanceof Error ? launchErr.message : "Run failed to start");
      setActiveRunId(null);
      releaseEngineRunLock();
    }
  }

  function handleReset(): void {
    setRunState({});
  }

  async function handleClearChat(): Promise<void> {
    if (!selectedSessionId || isRunning || loadingTurns) return;
    try {
      await clear();
      setChatError(null);
      setConfirmClearOpen(false);
    } catch (clearError) {
      setChatError(clearError instanceof Error ? clearError.message : "Failed to clear chat");
      setConfirmClearOpen(false);
    }
  }

  function handleRequestClearChat(): void {
    if (!selectedSessionId || isRunning || loadingTurns) return;
    setConfirmClearOpen(true);
  }

  function handleRequestDeleteSession(id: string): void {
    setConfirmDeleteId(id);
  }

  async function handleConfirmDeleteSession(): Promise<void> {
    if (!confirmDeleteId || deletingSession) return;
    const idToDelete = confirmDeleteId;
    setDeletingSession(true);
    try {
      await window.api.session.delete(idToDelete);
      const wasSelected = selectedSessionId === idToDelete;
      if (wasSelected) {
        setSelectedSessionId(null);
        setManifest(null);
        setFlow(null);
        setFbState(null);
        setBuilding(false);
        setRunning(false);
        setRunState({});
        setFocusId(null);
      }
      setConfirmDeleteId(null);
      void loadSessions(wasSelected ? null : selectedSessionId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete session");
      setConfirmDeleteId(null);
    } finally {
      setDeletingSession(false);
    }
  }

  function handleMoveNode(id: string, x: number, y: number): void {
    if (readOnlySession) return;
    setFlow((current) =>
      current && {
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, x, y, _userPlaced: true } : node)),
      },
    );
  }

  function handleDeleteNode(id: string): void {
    if (readOnlySession) return;
    setFlow((current) => {
      if (!current) return current;

      const predecessors = current.edges.filter(([, to]) => to === id).map(([from]) => from);
      const successors = current.edges.filter(([from]) => from === id).map(([, to]) => to);
      const remaining = current.edges.filter(([from, to]) => from !== id && to !== id);
      const existing = new Set(remaining.map(([from, to]) => `${from}>${to}`));
      const bridges: FlowEdge[] = [];

      for (const from of predecessors) {
        for (const to of successors) {
          if (from !== to && !existing.has(`${from}>${to}`)) {
            bridges.push([from, to]);
            existing.add(`${from}>${to}`);
          }
        }
      }

      return {
        ...current,
        nodes: current.nodes.filter((node) => node.id !== id),
        edges: [...remaining, ...bridges],
      };
    });
    setRunState((state) => {
      const next = { ...state };
      delete next[id];
      return next;
    });
    if (focusId === id) setFocusId(null);
  }

  function handleAddNode(spec: PaletteItem): void {
    if (readOnlySession) return;
    setFlow((current) => {
      if (!current) return current;
      const rightmost = current.nodes.reduce(
        (max, node) => {
          const pos = nodePos(node);
          return pos.x > max.x ? pos : max;
        },
        { x: 0, y: 80 },
      );
      const newId = `u${Date.now().toString(36)}`;
      const newNode: FlowNode = {
        id: newId,
        type: spec.type,
        icon: spec.icon,
        label: spec.label,
        sub: spec.sub,
        x: rightmost.x + NODE_W + GAP_X,
        y: rightmost.y,
        col: 0,
        row: 0,
        _userPlaced: true,
        ...(spec.prompt != null ? { prompt: spec.prompt } : {}),
      };
      const sourceNode = current.nodes.find((node) => {
        const pos = nodePos(node);
        return pos.x === rightmost.x && pos.y === rightmost.y;
      });
      const newEdges: FlowEdge[] = sourceNode ? [...current.edges, [sourceNode.id, newId]] : current.edges;
      return { ...current, nodes: [...current.nodes, newNode], edges: newEdges };
    });
  }

  function handleDeleteEdge(from: string, to: string): void {
    if (readOnlySession) return;
    setFlow((current) =>
      current && {
        ...current,
        edges: current.edges.filter(([a, b]) => !(a === from && b === to)),
      },
    );
  }

  function handleAddEdge(from: string, to: string): void {
    if (readOnlySession || !from || !to || from === to) return;
    setFlow((current) => {
      if (!current) return current;
      if (current.edges.some(([a, b]) => a === from && b === to)) return current;
      const adj: Record<string, string[]> = {};
      current.edges.forEach(([a, b]) => {
        (adj[a] ||= []).push(b);
      });
      const seen = new Set<string>();
      const stack = [to];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === from) return current;
        if (seen.has(cur)) continue;
        seen.add(cur);
        (adj[cur] || []).forEach((next) => stack.push(next));
      }
      return { ...current, edges: [...current.edges, [from, to]] };
    });
  }

  function handlePromptChange(id: string, prompt: string): void {
    if (readOnlySession) return;
    setFlow((current) =>
      current && {
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, prompt } : node)),
      },
    );
  }

  async function handleRefine(): Promise<void> {
    const value = refineVal.trim();
    if (!value) return;

    const lower = value.toLowerCase();
    setRefineVal("");

    if (!readOnlySession) {
      if (/\b(run|execute|go|start|kick)\b/.test(lower) && !/stop/.test(lower)) {
        window.setTimeout(() => void handleRun(), 250);
        return;
      }

      if (/\b(stop|cancel|halt|abort)\b/.test(lower)) {
        handleStop();
        return;
      }

      if (/\b(reset|clear)\b/.test(lower)) {
        handleReset();
        return;
      }

      const addMatch = lower.match(
        /add (?:a |an )?(prompt|slack|email|webhook|http|llm|filter|approval|database|spreadsheet|schedule|transform|code)/,
      );
      if (addMatch) {
        const kind = addMatch[1] as keyof typeof SMART_ADD_ITEMS;
        const spec = SMART_ADD_ITEMS[kind];
        handleAddNode(spec);
        return;
      }
    }

    if (selectedSessionId) {
      await send(value, selectedModel ?? metadata?.model ?? globalDefault);
    }
  }

  return (
    <div
      className={`app density-${DENSITY} ${isRail ? "is-rail" : ""}`}
      style={{ "--accent": ACCENT } as CSSProperties}
    >
      <Sidebar
        sessions={sessions}
        selectedId={selectedSessionId}
        localActive={!selectedSessionId && !flow}
        loading={loadingSessions}
        error={error}
        baseDir={baseDir}
        collapsed={isRail}
        canToggleCollapse={!narrowViewport}
        onToggleCollapse={handleToggleSidebar}
        onSelect={handleSelect}
        onNew={handleNew}
        onRefresh={handleRefresh}
        onDelete={handleRequestDeleteSession}
        extras={
          <RunSidebar
            sessionId={selectedSessionId}
            refreshTick={runListTick}
            selectedRunId={selectedRunId}
            onSelect={handleRunSidebarSelect}
          />
        }
      />

      <main className="main">
        <TopBar
          flow={flow}
          onHome={handleNew}
          onTidy={handleTidy}
          onPlay={() => handlePlay()}
          canRun={canRun}
          running={engineRunBusy || activeRunId !== null}
        />

        {!selectedSessionId && !flow && !building && (
          <EmptyState
            onSubmit={(text, model) => void handleSubmit(text, model)}
            models={models}
            initialModel={globalDefault}
            onPickModel={persistDefault}
          />
        )}

        {selectedSessionId && loadingSessions && (
          <SessionPanel title="Loading sessions" body="Reading flowbuilder sessions from disk." detail={baseDir} />
        )}

        {selectedSessionId && !loadingSessions && error && (
          <SessionPanel
            title="Could not load flowbuilder state"
            body={error}
            detail={baseDir}
            action={{ label: "Try again", onClick: handleRefresh }}
          />
        )}

        {selectedSessionId && !loadingSessions && !error && sessions.length === 0 && (
          <SessionPanel
            title="No flowbuilder sessions yet"
            body="The Electron UI reads existing sessions from disk. For local development, point FLOW_BUILD_FLOWBUILDER_BASE at the mock fixture directory."
            detail={baseDir || "FLOW_BUILD_FLOWBUILDER_BASE=mock/flowbuilder pnpm dev"}
            action={{ label: "Refresh sessions", onClick: handleRefresh }}
          />
        )}

        {(flow || building || (selectedSessionId && loadingSession)) && !error && (
          <div className={`chatflow ${readOnlySession ? "chatflow-session" : ""}`}>
            <div className="cf-stage">
              {readOnlySession && (
                <div className="session-banner">
                  <span>Read-only graph</span>
                  <strong>{manifest?.id ?? selectedSessionId}</strong>
                  {manifest && <span>{new Date(manifest.updatedAt).toLocaleString()}</span>}
                </div>
              )}
              {readOnlySession && loadingSession && !flow ? (
                <SessionPanel title="Loading session" body="Reading manifest and state from disk." detail={selectedSessionId ?? undefined} />
              ) : flow && flow.nodes.length === 0 ? (
                <SessionPanel
                  title="Empty session"
                  body={
                    readOnlySession
                      ? "This session has a valid state file, but it does not contain any nodes yet."
                      : "Describe the automation below to generate a local editable flow."
                  }
                  detail={manifest?.id}
                />
              ) : (
                <div className="cf-canvas-wrap">
                  <FlowCanvas
                    flow={flow}
                    runState={runState}
                    building={building}
                    focusId={focusId}
                    onFocus={setFocusId}
                    onMoveNode={readOnlySession ? undefined : handleMoveNode}
                    onDeleteNode={readOnlySession ? undefined : handleDeleteNode}
                    onDeleteEdge={readOnlySession ? undefined : handleDeleteEdge}
                    onAddEdge={readOnlySession ? undefined : handleAddEdge}
                    onPromptChange={readOnlySession ? undefined : handlePromptChange}
                    nodeStreams={nodeStreams}
                    nodeErrors={nodeErrors}
                  />
                </div>
              )}
              {flow && flow.nodes.length > 0 && <FlowLegend nodes={flow.nodes} />}
            </div>

            <div className="cf-bottom">
              <ChatThread turns={turns} loading={loadingTurns} height={chatHeight} onResize={setChatHeight} />
              <div className="cf-refine">
                {chatError && <div className="cf-refine-error">{chatError}</div>}
                <PromptBox
                  value={refineVal}
                  onChange={setRefineVal}
                  onSubmit={() => void handleRefine()}
                  onClear={handleRequestClearChat}
                  canClear={Boolean(selectedSessionId && turns.length > 0)}
                  clearDisabled={isRunning || loadingTurns}
                  isRunning={isRunning}
                  onStop={() => void cancel()}
                  placeholder={
                    readOnlySession
                      ? "Chat about this read-only session..."
                      : "Refine the flow... e.g. 'add a Slack approval before sending'"
                  }
                  model={selectedModel ?? metadata?.model ?? globalDefault}
                  onModelChange={handleModelChange}
                  models={models}
                />
              </div>
            </div>
          </div>
        )}

        {focusId && flow && (
          <NodeInspector
            node={flow.nodes.find((node) => node.id === focusId)}
            status={runState[focusId]}
            readOnly={readOnlySession}
            onClose={() => setFocusId(null)}
            onReplay={
              readOnlySession || running ? undefined : () => void handleReplayFrom(focusId)
            }
            sessionId={selectedSessionId}
            activeRunId={activeRunId}
            selectedRunId={selectedRunId}
          />
        )}

        {confirmClearOpen && (
          <div className="modal-backdrop" onClick={() => setConfirmClearOpen(false)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-chat-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-title" id="clear-chat-title">
                Clear chat?
              </div>
              <div className="modal-body">
                This removes the current chat transcript only. Your graph, nodes, and edges stay unchanged.
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn-ghost" onClick={() => setConfirmClearOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="modal-btn modal-btn-danger" onClick={() => void handleClearChat()}>
                  Clear chat
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDeleteId && (
          <div className="modal-backdrop" onClick={() => !deletingSession && setConfirmDeleteId(null)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-session-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-title" id="delete-session-title">
                Delete chat?
              </div>
              <div className="modal-body">
                This permanently deletes the chat, its transcript, graph, and run history from disk. This cannot be undone.
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn modal-btn-ghost"
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deletingSession}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-btn modal-btn-danger"
                  onClick={() => void handleConfirmDeleteSession()}
                  disabled={deletingSession}
                >
                  {deletingSession ? "Deleting..." : "Delete chat"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {pendingInputs && (
        <RunInputDialog
          inputs={pendingInputs}
          onCancel={() => setPendingInputs(null)}
          onSubmit={(values) => {
            setPendingInputs(null);
            void launchRun(values);
          }}
        />
      )}
    </div>
  );
}
