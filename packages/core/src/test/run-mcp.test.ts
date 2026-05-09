import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Plugin } from "../types.js";

let captured: { mcpServers?: Record<string, unknown> } | undefined;

vi.mock("@cursor/sdk", async () => {
  const actual = await vi.importActual<typeof import("@cursor/sdk")>("@cursor/sdk");
  return {
    ...actual,
    Agent: {
      create: async (opts: { mcpServers?: Record<string, unknown> }) => {
        captured = opts;
        return {
          send: async () => ({
            stream: async function* () {
              /* no events */
            },
            wait: async () => ({ status: "completed", usage: undefined }),
            cancel: async () => {},
          }),
          close: async () => {},
        };
      },
    },
  };
});

beforeEach(() => {
  captured = undefined;
  process.env.CURSOR_API_KEY = "crsr_test";
  // Disable safe-shell wiring for these mcp-merge tests — they assert on
  // the exact shape of mcpServers passed to Agent.create and shouldn't
  // see the harness's safe-shell entry. Safe-shell merge coverage lives
  // in session.test.ts.
  process.env.FLOW_BUILD_SAFE_SHELL = "0";
});

afterEach(() => {
  delete process.env.CURSOR_API_KEY;
  delete process.env.FLOW_BUILD_SAFE_SHELL;
});

describe("runPrompt forwards plugin-contributed mcpServers", () => {
  it("passes merged mcpServers into Agent.create", async () => {
    const { runPrompt } = await import("../run.js");
    const plugin: Plugin = {
      name: "fb",
      provideMcpServers: async () => ({
        flowbuilder: { type: "http", url: "http://127.0.0.1:9999/mcp" },
      }),
    };
    await runPrompt({
      prompt: "hi",
      cwd: process.cwd(),
      onEvent: () => {},
      plugins: [plugin],
    });
    expect(captured?.mcpServers).toEqual({
      flowbuilder: { type: "http", url: "http://127.0.0.1:9999/mcp" },
    });
  });

  it("omits mcpServers when no plugin contributes", async () => {
    const { runPrompt } = await import("../run.js");
    await runPrompt({
      prompt: "hi",
      cwd: process.cwd(),
      onEvent: () => {},
      plugins: [],
    });
    expect(captured?.mcpServers).toBeUndefined();
  });
});
