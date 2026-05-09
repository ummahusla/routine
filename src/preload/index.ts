import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

type CursorChatEvent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "done";
      status: string;
    }
  | {
      type: "error";
      error: string;
    };

type CursorChatResult =
  | {
      ok: true;
      status: string;
    }
  | {
      ok: false;
      error: string;
    };

type FlowbuilderNode =
  | {
      id: string;
      type: "input";
      value: unknown;
    }
  | {
      id: string;
      type: "output";
      value: unknown;
    }
  | {
      id: string;
      type: "flow";
      flow: string;
      params: Record<string, unknown>;
    }
  | {
      id: string;
      type: "branch";
      cond: string;
    }
  | {
      id: string;
      type: "merge";
    };

type FlowbuilderEdge = {
  from: string;
  to: string;
};

type FlowbuilderManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type FlowbuilderState = {
  schemaVersion: 1;
  nodes: FlowbuilderNode[];
  edges: FlowbuilderEdge[];
};

type FlowbuilderSessionSummary = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
};

type FlowbuilderListSessionsResult =
  | {
      ok: true;
      baseDir: string;
      sessions: FlowbuilderSessionSummary[];
    }
  | {
      ok: false;
      baseDir: string;
      error: string;
    };

type FlowbuilderReadSessionResult =
  | {
      ok: true;
      baseDir: string;
      manifest: FlowbuilderManifest;
      state: FlowbuilderState;
    }
  | {
      ok: false;
      baseDir: string;
      sessionId: string;
      error: string;
    };

const api = {
  cursorChat: {
    send(prompt: string, onEvent: (event: CursorChatEvent) => void): Promise<CursorChatResult> {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: CursorChatEvent & {
          requestId: string;
        },
      ): void => {
        if (payload.requestId !== requestId) return;
        onEvent(payload);
        if (payload.type === "done" || payload.type === "error") {
          ipcRenderer.removeListener("cursor-chat:event", listener);
        }
      };

      ipcRenderer.on("cursor-chat:event", listener);
      return (ipcRenderer.invoke("cursor-chat:send", { requestId, prompt }) as Promise<CursorChatResult>).finally(() => {
        ipcRenderer.removeListener("cursor-chat:event", listener);
      });
    },
  },
  flowbuilder: {
    listSessions(): Promise<FlowbuilderListSessionsResult> {
      return ipcRenderer.invoke("flowbuilder:list-sessions") as Promise<FlowbuilderListSessionsResult>;
    },
    readSession(sessionId: string): Promise<FlowbuilderReadSessionResult> {
      return ipcRenderer.invoke("flowbuilder:read-session", { sessionId }) as Promise<FlowbuilderReadSessionResult>;
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
  window.electron = electronAPI;
  window.api = api;
}
