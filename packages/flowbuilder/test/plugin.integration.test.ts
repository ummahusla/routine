import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createFlowbuilderPlugin } from "../src/plugin.js";
import { FLOWBUILDER_RULES_PATH } from "../src/rules.js";
import type { Logger, RuntimeContext } from "@flow-build/core";

let baseDir: string;
let cwd: string;
const sessionId = "s_abc123def456";

const validManifest = {
  schemaVersion: 1 as const,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const emptyState = {
  schemaVersion: 1 as const,
  nodes: [],
  edges: [],
};

function makeCtx(): RuntimeContext {
  const logger: Logger = { warn: vi.fn() };
  return {
    cwd,
    model: "test-model",
    runId: "run-1",
    signal: new AbortController().signal,
    logger,
    state: new Map(),
  };
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-plugin-base-"));
  cwd = mkdtempSync(join(tmpdir(), "flowbuilder-plugin-cwd-"));
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("flowbuilder plugin lifecycle", () => {
  it("preRun -> systemPrompt -> promptPrefix -> provideMcpServers -> tool call -> cleanup", async () => {
    const plugin = createFlowbuilderPlugin({ baseDir, sessionId });
    const ctx = makeCtx();

    expect(plugin.name).toBe("flowbuilder");

    await plugin.preRun!(ctx);
    expect(ctx.state.has("flowbuilder:internal")).toBe(true);

    const sysContrib = await plugin.systemPrompt!(ctx);
    expect(sysContrib).toBeTruthy();
    expect(sysContrib!.rulesFile.relativePath).toBe(FLOWBUILDER_RULES_PATH);
    expect(sysContrib!.rulesFile.contents).toContain("flowbuilder_set_state");

    const prefix = await plugin.promptPrefix!(ctx);
    expect(prefix).toContain(sessionId);

    const servers = await plugin.provideMcpServers!(ctx);
    expect(servers.flowbuilder).toBeDefined();
    expect(servers.flowbuilder).toMatchObject({ type: "http" });
    const url = (servers.flowbuilder as { url: string }).url;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);
    try {
      const setRes = await client.callTool({
        name: "flowbuilder_set_state",
        arguments: {
          state: {
            schemaVersion: 1,
            nodes: [{ id: "n1", type: "merge" }],
            edges: [],
          },
        },
      });
      const setText = (setRes.content as { type: string; text: string }[])[0]?.text ?? "";
      expect(JSON.parse(setText).ok).toBe(true);
    } finally {
      await client.close();
      await transport.close();
    }

    const writtenState = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "state.json"), "utf8"),
    );
    expect(writtenState.nodes).toEqual([{ id: "n1", type: "merge" }]);

    await plugin.cleanup!(ctx);

    const transport2 = new StreamableHTTPClientTransport(new URL(url));
    const client2 = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await expect(client2.connect(transport2)).rejects.toThrow();
  });

  it("preRun throws when session is missing", async () => {
    rmSync(join(baseDir, "sessions", sessionId), { recursive: true, force: true });
    const plugin = createFlowbuilderPlugin({ baseDir, sessionId });
    const ctx = makeCtx();
    await expect(plugin.preRun!(ctx)).rejects.toThrow(/session/i);
  });

  it("rules file written under cwd is reachable at FLOWBUILDER_RULES_PATH", async () => {
    const plugin = createFlowbuilderPlugin({ baseDir, sessionId });
    const ctx = makeCtx();
    await plugin.preRun!(ctx);
    const contrib = await plugin.systemPrompt!(ctx);
    expect(contrib!.rulesFile.relativePath).toBe(".cursor/rules/.flow-build-flowbuilder.mdc");
    await plugin.cleanup!(ctx);
    expect(existsSync(join(cwd, ".cursor"))).toBe(false);
  });
});
