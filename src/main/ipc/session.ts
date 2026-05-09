import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import type {
  Session,
  SessionEvent,
  SessionMetadata,
  TurnResult,
} from "@flow-build/core";
import {
  CreateInputSchema,
  OpenInputSchema,
  SendInputSchema,
  CancelInputSchema,
  ClearInputSchema,
  RenameInputSchema,
  DeleteInputSchema,
  WatchInputSchema,
  UnwatchInputSchema,
} from "./schemas.js";
import type { SessionRegistry } from "../registry.js";

export type IpcDeps = {
  baseDir: string;
  registry: SessionRegistry<Session>;
  createSession: (opts: { baseDir: string; title?: string; model?: string }) => Promise<Session>;
  listSessions: (opts: { baseDir: string }) => Promise<SessionMetadata[]>;
  deleteSession: (opts: { baseDir: string; sessionId: string }) => Promise<void>;
};

type IpcResult<T> = ({ ok: true } & T) | { ok: false; code: string; error: string };

function invalid(error: string): IpcResult<never> {
  return { ok: false, code: "INVALID", error };
}

function harnessFail(e: unknown): IpcResult<never> {
  const code = (e as { code?: string }).code ?? "UNKNOWN";
  const error = (e as Error).message ?? String(e);
  return { ok: false, code, error };
}

export function registerSessionIpc(ipc: IpcMain, deps: IpcDeps): void {
  ipc.handle("session:list", async () => {
    try {
      return { ok: true, items: await deps.listSessions({ baseDir: deps.baseDir }) };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:create", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = CreateInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const args: { baseDir: string; title?: string; model?: string } = { baseDir: deps.baseDir };
      if (parsed.data.title) args.title = parsed.data.title;
      if (parsed.data.model) args.model = parsed.data.model;
      const s = await deps.createSession(args);
      return { ok: true, sessionId: s.sessionId };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:open", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = OpenInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      const [metadata, turns] = await Promise.all([session.metadata(), session.turns()]);
      return { ok: true, metadata, turns };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:send", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = SendInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      const sendOpts: { model?: string; onEvent: (ev: SessionEvent) => void } = {
        onEvent: (ev: SessionEvent) => deps.registry.fanout(parsed.data.sessionId, ev),
      };
      if (parsed.data.model) sendOpts.model = parsed.data.model;
      const result: TurnResult = await session.send(parsed.data.prompt, sendOpts);
      return { ok: true, ...result };
    } catch (err) {
      return harnessFail(err);
    }
  });

  ipc.handle("session:cancel", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = CancelInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      await session.cancel();
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:clear", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = ClearInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      await session.clearChat();
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:rename", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RenameInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      await session.rename(parsed.data.title);
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:delete", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = DeleteInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      await deps.registry.evict(parsed.data.sessionId);
      deps.registry.fanoutDeleted(parsed.data.sessionId);
      await deps.deleteSession({ baseDir: deps.baseDir, sessionId: parsed.data.sessionId });
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:watch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = WatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    const subscriptionId = deps.registry.subscribe(
      parsed.data.sessionId,
      e.sender as WebContents,
    );
    return { ok: true, subscriptionId };
  });

  ipc.handle("session:unwatch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = UnwatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    deps.registry.unsubscribe(parsed.data.subscriptionId, e.sender as WebContents);
    return { ok: true };
  });
}
