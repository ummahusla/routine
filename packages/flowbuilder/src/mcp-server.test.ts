import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startFlowbuilderMcpServer } from "./mcp-server.js";
import { SessionManager } from "./session.js";
import type { Manifest, State } from "./schema.js";

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
    const handle = await startFlowbuilderMcpServer({ session: mgr });
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
    const handle = await startFlowbuilderMcpServer({ session: mgr });
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
    const handle = await startFlowbuilderMcpServer({ session: mgr });
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
    const handle = await startFlowbuilderMcpServer({ session: mgr });
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
    const handle = await startFlowbuilderMcpServer({ session: mgr });
    try {
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const port = Number(new URL(handle.url).port);
      expect(port).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });
});
