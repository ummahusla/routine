import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type {
  ModelInfo,
  PersistedTurn,
  SessionEvent,
  SessionMetadata,
  TurnResult,
} from "@flow-build/core";

type IpcOk<T> = { ok: true } & T;
type IpcErr = { ok: false; code: string; error: string };
type IpcResult<T> = IpcOk<T> | IpcErr;

function unwrap<T>(r: IpcResult<T>): T {
  if (!r || (r as IpcErr).ok === false) {
    const e = r as IpcErr;
    const err = new Error(e?.error ?? "ipc error");
    (err as { code?: string }).code = e?.code;
    throw err;
  }
  return r as unknown as T;
}

const api = {
  flowbuilder: {
    async listSessions() {
      return ipcRenderer.invoke("flowbuilder:list-sessions");
    },
    async readSession(sessionId: string) {
      return ipcRenderer.invoke("flowbuilder:read-session", { sessionId });
    },
    async getFlowInfo(flowRef: string) {
      return ipcRenderer.invoke("flowbuilder:get-flow-info", { flowRef });
    },
  },
  session: {
    async list(): Promise<SessionMetadata[]> {
      const r = await ipcRenderer.invoke("session:list");
      return unwrap<{ items: SessionMetadata[] }>(r).items;
    },
    async create(opts: { title?: string; model?: string } = {}): Promise<{ sessionId: string }> {
      const r = await ipcRenderer.invoke("session:create", opts);
      return unwrap<{ sessionId: string }>(r);
    },
    async open(sessionId: string): Promise<{ metadata: SessionMetadata; turns: PersistedTurn[] }> {
      const r = await ipcRenderer.invoke("session:open", { sessionId });
      return unwrap<{ metadata: SessionMetadata; turns: PersistedTurn[] }>(r);
    },
    async send(sessionId: string, prompt: string, model?: string): Promise<TurnResult> {
      const r = await ipcRenderer.invoke("session:send", {
        sessionId,
        prompt,
        ...(model ? { model } : {}),
      });
      return unwrap<TurnResult>(r);
    },
    async cancel(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:cancel", { sessionId }));
    },
    async clear(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:clear", { sessionId }));
    },
    async rename(sessionId: string, title: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:rename", { sessionId, title }));
    },
    async delete(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:delete", { sessionId }));
    },
    watch(sessionId: string, onEvent: (e: SessionEvent) => void): () => void {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { sessionId: string; event: SessionEvent },
      ) => {
        if (payload.sessionId !== sessionId) return;
        onEvent(payload.event);
      };
      const deletedListener = (
        _e: Electron.IpcRendererEvent,
        payload: { sessionId: string },
      ) => {
        if (payload.sessionId !== sessionId) return;
        // best effort — surface a deletion event upstream via a synthetic wrapper
        onEvent({ type: "error", turnId: "", message: "session deleted", code: "DELETED" });
      };
      ipcRenderer.on("session:event", listener);
      ipcRenderer.on("session:deleted", deletedListener);
      const watchPromise: Promise<string | undefined> = ipcRenderer
        .invoke("session:watch", { sessionId })
        .then((r) => unwrap<{ subscriptionId: string }>(r).subscriptionId)
        .catch((err) => {
          console.error("session:watch failed", err);
          return undefined;
        });
      return () => {
        ipcRenderer.removeListener("session:event", listener);
        ipcRenderer.removeListener("session:deleted", deletedListener);
        void watchPromise.then((subscriptionId) => {
          if (subscriptionId) {
            ipcRenderer.invoke("session:unwatch", { subscriptionId }).catch(() => {});
          }
        });
      };
    },
  },
  models: {
    async list(opts: { refresh?: boolean } = {}): Promise<ModelInfo[]> {
      const r = await ipcRenderer.invoke("models:list", opts);
      return unwrap<{ models: ModelInfo[] }>(r).models;
    },
  },
  app: {
    async getDefaultModel(): Promise<string> {
      const r = await ipcRenderer.invoke("app:get-default-model");
      return unwrap<{ model: string }>(r).model;
    },
    async setDefaultModel(model: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("app:set-default-model", { model }));
    },
  },
  run: {
    execute: (input: { sessionId: string; inputs?: Record<string, unknown> }) =>
      ipcRenderer.invoke("run:execute", input) as Promise<
        { ok: true; runId: string } | { ok: false; code: string; error: string }
      >,
    cancel: (input: { sessionId: string; runId: string }) =>
      ipcRenderer.invoke("run:cancel", input) as Promise<
        { ok: true } | { ok: false; code: string; error: string }
      >,
    list: (input: { sessionId: string }) =>
      ipcRenderer.invoke("run:list", input) as Promise<
        | {
            ok: true;
            runs: Array<{
              runId: string;
              sessionId: string;
              startedAt: string;
              endedAt?: string;
              status: string;
              error?: string;
            }>;
          }
        | { ok: false; code: string; error: string }
      >,
    read: (input: { sessionId: string; runId: string }) =>
      ipcRenderer.invoke("run:read", input) as Promise<unknown>,
    watch: (input: { sessionId: string; runId: string }) =>
      ipcRenderer.invoke("run:watch", input) as Promise<
        { ok: true; subscriptionId: string } | { ok: false; code: string; error: string }
      >,
    unwatch: (input: { subscriptionId: string }) =>
      ipcRenderer.invoke("run:unwatch", input) as Promise<
        { ok: true } | { ok: false; code: string; error: string }
      >,
    onEvent: (cb: (msg: { runId: string; event: unknown }) => void) => {
      const listener = (_e: unknown, msg: { runId: string; event: unknown }) => cb(msg);
      ipcRenderer.on("run:event", listener);
      return () => ipcRenderer.removeListener("run:event", listener);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // sandbox: true normally implies contextIsolated, but keep parity
  (window as unknown as { electron: typeof electronAPI }).electron = electronAPI;
  (window as unknown as { api: typeof api }).api = api;
}
