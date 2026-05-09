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
