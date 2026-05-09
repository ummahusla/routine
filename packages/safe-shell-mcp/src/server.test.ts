import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./server.js";

async function pair(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = buildMcpServer({ defaultCwd: process.cwd() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
  await client.connect(b);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("safe-shell mcp server", () => {
  it("lists exactly the sh tool", async () => {
    const { client, close } = await pair();
    try {
      const list = await client.listTools();
      expect(list.tools.map((t) => t.name)).toEqual(["sh"]);
    } finally {
      await close();
    }
  });

  it("returns the spawn envelope as JSON in a text content block", async () => {
    const { client, close } = await pair();
    try {
      const r = await client.callTool({
        name: "sh",
        arguments: { command: "echo hi" },
      });
      expect(r.content).toHaveLength(1);
      const block = r.content[0] as { type: "text"; text: string };
      const env = JSON.parse(block.text);
      expect(env.ok).toBe(true);
      expect(env.stdout).toBe("hi\n");
      expect(env.exitCode).toBe(0);
    } finally {
      await close();
    }
  });

  it("rejects empty command via schema", async () => {
    const { client, close } = await pair();
    try {
      const r = await client.callTool({
        name: "sh",
        arguments: { command: "" },
      });
      const env = JSON.parse((r.content[0] as { text: string }).text);
      expect(env.ok).toBe(false);
      expect(env.error).toMatch(/validation/i);
    } finally {
      await close();
    }
  });

  it("clamps timeoutMs to max", async () => {
    const { client, close } = await pair();
    try {
      const r = await client.callTool({
        name: "sh",
        arguments: { command: "echo hi", timeoutMs: 999_999_999 },
      });
      const env = JSON.parse((r.content[0] as { text: string }).text);
      // schema validation rejects values > 600_000
      expect(env.ok).toBe(false);
      expect(env.error).toMatch(/validation/i);
    } finally {
      await close();
    }
  });
});
