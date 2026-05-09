import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type {
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
    async send(sessionId: string, prompt: string): Promise<TurnResult> {
      const r = await ipcRenderer.invoke("session:send", { sessionId, prompt });
      return unwrap<TurnResult>(r);
    },
    async cancel(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:cancel", { sessionId }));
    },
    async rename(sessionId: string, title: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:rename", { sessionId, title }));
    },
    async delete(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:delete", { sessionId }));
    },
    watch(sessionId: string, onEvent: (e: SessionEvent) => void): () => void {
      let subscriptionId: string | undefined;
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
        onEvent({ type: "error", turnId: "", message: "session deleted", code: "DELETED" } as SessionEvent);
      };
      ipcRenderer.on("session:event", listener);
      ipcRenderer.on("session:deleted", deletedListener);
      ipcRenderer
        .invoke("session:watch", { sessionId })
        .then((r) => {
          subscriptionId = unwrap<{ subscriptionId: string }>(r).subscriptionId;
        })
        .catch(() => {});
      return () => {
        ipcRenderer.removeListener("session:event", listener);
        ipcRenderer.removeListener("session:deleted", deletedListener);
        if (subscriptionId) {
          ipcRenderer.invoke("session:unwatch", { subscriptionId }).catch(() => {});
        }
      };
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
