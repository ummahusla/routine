/// <reference types="vite/client" />

import type { ElectronAPI } from "@electron-toolkit/preload";

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

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      cursorChat: {
        send(prompt: string, onEvent: (event: CursorChatEvent) => void): Promise<CursorChatResult>;
      };
    };
  }
}

export {};
