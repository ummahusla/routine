/// <reference types="vite/client" />

import type { ElectronAPI } from "@electron-toolkit/preload";
import type {
  PersistedTurn,
  SessionEvent,
  SessionMetadata,
  TurnResult,
} from "@flow-build/core";

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
      flowbuilder: {
        listSessions(): Promise<FlowbuilderListSessionsResult>;
        readSession(sessionId: string): Promise<FlowbuilderReadSessionResult>;
      };
      session: {
        list(): Promise<SessionMetadata[]>;
        create(opts?: { title?: string; model?: string }): Promise<{ sessionId: string }>;
        open(sessionId: string): Promise<{ metadata: SessionMetadata; turns: PersistedTurn[] }>;
        send(sessionId: string, prompt: string): Promise<TurnResult>;
        cancel(sessionId: string): Promise<void>;
        clear(sessionId: string): Promise<void>;
        rename(sessionId: string, title: string): Promise<void>;
        delete(sessionId: string): Promise<void>;
        watch(sessionId: string, onEvent: (e: SessionEvent) => void): () => void;
      };
    };
  }
}

export {};
