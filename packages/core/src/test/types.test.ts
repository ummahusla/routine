import { describe, it, expectTypeOf } from "vitest";
import type { Plugin, RuntimeContext, McpServerConfig } from "../types.js";

describe("Plugin type", () => {
  it("supports provideMcpServers returning McpServerConfig record", () => {
    const p: Plugin = {
      name: "x",
      provideMcpServers: async (_ctx: RuntimeContext) => ({
        x: { type: "http", url: "http://127.0.0.1:1234/mcp" },
      }),
    };
    expectTypeOf(p.provideMcpServers).toMatchTypeOf<
      ((ctx: RuntimeContext) => Promise<Record<string, McpServerConfig>>) | undefined
    >();
  });
});
