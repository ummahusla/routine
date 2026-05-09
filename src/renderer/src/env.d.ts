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

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      cursorChat: {
        send(prompt: string, onEvent: (event: CursorChatEvent) => void): Promise<CursorChatResult>;
      };
      flowbuilder: {
        listSessions(): Promise<FlowbuilderListSessionsResult>;
        readSession(sessionId: string): Promise<FlowbuilderReadSessionResult>;
      };
    };
  }
}

export {};
