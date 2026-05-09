import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startFlowbuilderMcpServer } from "./mcp-server.js";
import { SessionManager } from "./session.js";
import type { Manifest, State } from "./schema.js";
import type { RunResult } from "@flow-build/engine";

let baseDir: string;
const sessionId = "s_abc123def456";

const validManifest: Manifest = {
  schemaVersion: 1,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const emptyState: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};

function setupSession(): SessionManager {
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
  const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
  mgr.load();
  return mgr;
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-mcp-"));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

const noopRunStubs = {
  runStarter: async (): Promise<string> => { throw new Error("execute_flow not wired in test"); },
  runResultReader: async (): Promise<never> => { throw new Error("get_run_result not wired in test"); },
  waitForRunEnd: async (): Promise<void> => {},
};

async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await transport.close();
  }
}

describe("flowbuilder MCP server", () => {
  it("flowbuilder_get_state returns empty state on a fresh session", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr, ...noopRunStubs });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_get_state", arguments: {} }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(true);
      expect(parsed.state.nodes).toEqual([]);
    } finally {
      await handle.close();
    }
  });

  it("flowbuilder_set_state accepts valid state and persists it", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr, ...noopRunStubs });
    try {
      const newState: State = {
        schemaVersion: 1,
        nodes: [{ id: "n1", type: "merge" }],
        edges: [],
      };
      const result = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_set_state",
          arguments: { state: newState },
        }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(true);
      expect(parsed.bytes).toBeGreaterThan(0);

      const reread = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_get_state", arguments: {} }),
      );
      const text2 = (reread.content as { type: string; text: string }[])[0]?.text ?? "";
      expect(JSON.parse(text2).state.nodes).toEqual([{ id: "n1", type: "merge" }]);
    } finally {
      await handle.close();
    }
  });

  it("flowbuilder_set_state returns ok:false on schema violation", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr, ...noopRunStubs });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_set_state",
          arguments: {
            state: { schemaVersion: 1, nodes: [{ id: "n1", type: "alien" }], edges: [] },
          },
        }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/^validation:/);
    } finally {
      await handle.close();
    }
  });

  it("flowbuilder_set_state returns ok:false on ref integrity violation", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr, ...noopRunStubs });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_set_state",
          arguments: {
            state: {
              schemaVersion: 1,
              nodes: [{ id: "n1", type: "merge" }],
              edges: [{ from: "n1", to: "ghost" }],
            },
          },
        }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/^ref_integrity:/);
    } finally {
      await handle.close();
    }
  });

  it("binds only to 127.0.0.1 with a non-zero port", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr, ...noopRunStubs });
    try {
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const port = Number(new URL(handle.url).port);
      expect(port).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });
});

describe("flowbuilder_execute_flow tool", () => {
  it("calls runStarter with sessionId and returns { ok, runId, sessionId }", async () => {
    const calls: string[] = [];
    const session = setupSession();
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async (sid) => { calls.push(sid); return "RUN_ABC"; },
      runResultReader: async () => ({ manifest: { runId: "x", sessionId: "y", startedAt: "t", status: "succeeded" }, events: [], outputs: {} }),
      waitForRunEnd: async () => {},
    });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_execute_flow", arguments: {} }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      expect(JSON.parse(text)).toEqual({ ok: true, runId: "RUN_ABC", sessionId: session.sessionId });
      expect(calls).toEqual([session.sessionId]);
    } finally {
      await handle.close();
    }
  });
});

describe("flowbuilder_get_run_result tool", () => {
  it("returns disk state without waitMs and includes nodes summary", async () => {
    const session = setupSession();
    const result: RunResult = {
      manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t", status: "succeeded" },
      events: [
        { type: "run_start", runId: "r1", sessionId: session.sessionId, startedAt: "t" },
        { type: "node_start", runId: "r1", nodeId: "n1", nodeType: "merge", at: "t1" },
        { type: "node_end", runId: "r1", nodeId: "n1", status: "done", at: "t2" },
      ],
      outputs: { o: { text: "hi" } },
    };
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => result,
      waitForRunEnd: async () => {},
    });
    try {
      const r = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_get_run_result", arguments: { runId: "r1" } }),
      );
      const body = JSON.parse((r.content as { type: string; text: string }[])[0]?.text ?? "");
      expect(body.ok).toBe(true);
      expect(body.status).toBe("succeeded");
      expect(body.outputs.o.text).toBe("hi");
      expect(body.nodes).toEqual([
        { nodeId: "n1", nodeType: "merge", status: "done", startedAt: "t1", endedAt: "t2" },
      ]);
    } finally {
      await handle.close();
    }
  });

  it("invokes waitForRunEnd when waitMs > 0 (and reads after wait)", async () => {
    const session = setupSession();
    let waitCalledWith: { runId?: string; ms?: number } = {};
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => ({
        manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t", status: "succeeded" },
        events: [],
        outputs: {},
      }),
      waitForRunEnd: async (runId, ms) => { waitCalledWith = { runId, ms }; },
    });
    try {
      await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_get_run_result", arguments: { runId: "r1", waitMs: 5000 } }),
      );
      expect(waitCalledWith).toEqual({ runId: "r1", ms: 5000 });
    } finally {
      await handle.close();
    }
  });
});

describe("flowbuilder_tail_run_events tool", () => {
  it("returns events + nextCursor + done=true for a finished run on first call", async () => {
    const session = setupSession();
    const events = [
      { type: "run_start" as const, runId: "r1", sessionId: session.sessionId, startedAt: "t0" },
      { type: "node_start" as const, runId: "r1", nodeId: "n1", nodeType: "merge", at: "t1" },
      { type: "node_end" as const, runId: "r1", nodeId: "n1", status: "done" as const, at: "t2" },
      { type: "run_end" as const, runId: "r1", status: "succeeded" as const, at: "t3" },
    ];
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => ({
        manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t0", endedAt: "t3", status: "succeeded" },
        events,
        outputs: {},
      }),
      waitForRunEnd: async () => {},
      tailReader: async (_sid, _rid, sinceCursor) => {
        if (sinceCursor === 0) return { events, nextCursor: 100 };
        return { events: [], nextCursor: sinceCursor };
      },
    });
    try {
      const r = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_tail_run_events",
          arguments: { runId: "r1", sinceCursor: 0 },
        }),
      );
      const body = JSON.parse((r.content as { type: string; text: string }[])[0]?.text ?? "");
      expect(body.ok).toBe(true);
      expect(body.events).toHaveLength(4);
      expect(body.nextCursor).toBe(100);
      expect(body.status).toBe("succeeded");
      expect(body.done).toBe(true);
      expect(body.nodes[0]).toMatchObject({ nodeId: "n1", status: "done" });
    } finally {
      await handle.close();
    }
  });

  it("advances cursor across calls; returns done=false while running", async () => {
    const session = setupSession();
    const ev1 = { type: "run_start" as const, runId: "r1", sessionId: session.sessionId, startedAt: "t0" };
    const ev2 = { type: "node_start" as const, runId: "r1", nodeId: "n1", nodeType: "merge", at: "t1" };
    let allEvents: typeof ev1[] | typeof ev2[] = [ev1];
    const tailCalls: number[] = [];
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => ({
        manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t0", status: "running" },
        events: allEvents as never,
        outputs: {},
      }),
      waitForRunEnd: async () => {},
      tailReader: async (_sid, _rid, sinceCursor) => {
        tailCalls.push(sinceCursor);
        if (sinceCursor === 0) return { events: [ev1], nextCursor: 50 };
        if (sinceCursor === 50) return { events: [ev2] as never, nextCursor: 110 };
        return { events: [], nextCursor: sinceCursor };
      },
    });
    try {
      const r1 = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_tail_run_events", arguments: { runId: "r1", sinceCursor: 0 } }),
      );
      const b1 = JSON.parse((r1.content as { type: string; text: string }[])[0]?.text ?? "");
      expect(b1.events).toHaveLength(1);
      expect(b1.nextCursor).toBe(50);
      expect(b1.done).toBe(false);

      allEvents = [ev1, ev2] as never;
      const r2 = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_tail_run_events", arguments: { runId: "r1", sinceCursor: b1.nextCursor } }),
      );
      const b2 = JSON.parse((r2.content as { type: string; text: string }[])[0]?.text ?? "");
      expect(b2.events).toHaveLength(1);
      expect(b2.nextCursor).toBe(110);
      expect(b2.done).toBe(false);
      expect(tailCalls).toContain(0);
      expect(tailCalls).toContain(50);
    } finally {
      await handle.close();
    }
  });

  it("with waitMs blocks until run ends, then returns done=true", async () => {
    const session = setupSession();
    let runStatus: "running" | "succeeded" = "running";
    const ev1 = { type: "run_start" as const, runId: "r1", sessionId: session.sessionId, startedAt: "t0" };
    const evEnd = { type: "run_end" as const, runId: "r1", status: "succeeded" as const, at: "t9" };
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => ({
        manifest: {
          runId: "r1", sessionId: session.sessionId, startedAt: "t0",
          status: runStatus,
          ...(runStatus === "succeeded" ? { endedAt: "t9" } : {}),
        },
        events: runStatus === "running" ? [ev1] : [ev1, evEnd],
        outputs: {},
      }),
      waitForRunEnd: async () => {},
      tailReader: async (_sid, _rid, sinceCursor) => {
        if (sinceCursor === 100 && runStatus === "succeeded") {
          return { events: [evEnd] as never, nextCursor: 200 };
        }
        return { events: [], nextCursor: sinceCursor };
      },
    });
    try {
      // Flip status mid-poll.
      setTimeout(() => { runStatus = "succeeded"; }, 80);
      const r = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_tail_run_events",
          arguments: { runId: "r1", sinceCursor: 100, waitMs: 2000 },
        }),
      );
      const body = JSON.parse((r.content as { type: string; text: string }[])[0]?.text ?? "");
      expect(body.ok).toBe(true);
      expect(body.done).toBe(true);
      expect(body.status).toBe("succeeded");
      expect(body.events).toEqual([evEnd]);
    } finally {
      await handle.close();
    }
  });

  it("returns ok:false when tailReader is not wired", async () => {
    const session = setupSession();
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => ({
        manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t0", status: "running" },
        events: [],
        outputs: {},
      }),
      waitForRunEnd: async () => {},
    });
    try {
      const r = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_tail_run_events", arguments: { runId: "r1" } }),
      );
      const body = JSON.parse((r.content as { type: string; text: string }[])[0]?.text ?? "");
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/tail_run_events/);
    } finally {
      await handle.close();
    }
  });
});
