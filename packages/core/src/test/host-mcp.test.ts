import { describe, it, expect, vi } from "vitest";
import { PluginHost } from "../plugin/host.js";
import type { Plugin, RuntimeContext, Logger } from "../types.js";

function makeCtx(): RuntimeContext {
  const logger: Logger = { warn: vi.fn() };
  return {
    cwd: "/tmp",
    model: "test-model",
    runId: "run-1",
    signal: new AbortController().signal,
    logger,
    state: new Map(),
  };
}

describe("PluginHost.runProvideMcpServers", () => {
  it("returns empty object when no plugins contribute", async () => {
    const host = new PluginHost([]);
    const out = await host.runProvideMcpServers(makeCtx());
    expect(out).toEqual({});
  });

  it("merges contributions across plugins", async () => {
    const a: Plugin = {
      name: "a",
      provideMcpServers: async () => ({
        alpha: { type: "http", url: "http://127.0.0.1:1/mcp" },
      }),
    };
    const b: Plugin = {
      name: "b",
      provideMcpServers: async () => ({
        beta: { type: "http", url: "http://127.0.0.1:2/mcp" },
      }),
    };
    const host = new PluginHost([a, b]);
    const out = await host.runProvideMcpServers(makeCtx());
    expect(out).toEqual({
      alpha: { type: "http", url: "http://127.0.0.1:1/mcp" },
      beta: { type: "http", url: "http://127.0.0.1:2/mcp" },
    });
  });

  it("warns and last-write-wins on key collision", async () => {
    const ctx = makeCtx();
    const warn = ctx.logger.warn as ReturnType<typeof vi.fn>;
    const a: Plugin = {
      name: "a",
      provideMcpServers: async () => ({
        same: { type: "http", url: "http://127.0.0.1:1/mcp" },
      }),
    };
    const b: Plugin = {
      name: "b",
      provideMcpServers: async () => ({
        same: { type: "http", url: "http://127.0.0.1:2/mcp" },
      }),
    };
    const host = new PluginHost([a, b]);
    const out = await host.runProvideMcpServers(ctx);
    expect(out.same).toEqual({ type: "http", url: "http://127.0.0.1:2/mcp" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("mcp server name collision"),
      expect.objectContaining({ name: "same" }),
    );
  });

  it("wraps plugin throws as PluginHostError", async () => {
    const a: Plugin = {
      name: "a",
      provideMcpServers: async () => {
        throw new Error("boom");
      },
    };
    const host = new PluginHost([a]);
    await expect(host.runProvideMcpServers(makeCtx())).rejects.toThrow(
      /plugin "a" provideMcpServers failed/,
    );
  });
});
