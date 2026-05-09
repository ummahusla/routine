import { request } from "node:http";
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./server.js";
import { startSafeShellMcpServer } from "./start.js";

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

  it("advertises typed schema for command (not unknown)", async () => {
    const { client, close } = await pair();
    try {
      const list = await client.listTools();
      const sh = list.tools.find((t) => t.name === "sh");
      expect(sh).toBeDefined();
      const props =
        (sh!.inputSchema as { properties?: Record<string, { type?: string }> }).properties ?? {};
      expect(props.command?.type).toBe("string");
      expect(props.timeoutMs?.type).toBe("number");
      expect(props.maxBytes?.type).toBe("number");
      expect(props.cwd?.type).toBe("string");
    } finally {
      await close();
    }
  });
});

describe("startSafeShellMcpServer", () => {
  it("listens on a 127.0.0.1 port and rejects non-loopback hosts", async () => {
    const handle = await startSafeShellMcpServer({ defaultCwd: process.cwd() });
    try {
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

      // Wrong Host header → 403. We use node:http directly because undici's
      // fetch (Node 22) strips/overrides the `host` header silently, which
      // would let the request slip past the loopback check.
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          {
            host: "127.0.0.1",
            port: handle.port,
            path: "/mcp",
            method: "POST",
            headers: { "content-type": "application/json", host: "evil.example" },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
      });
      expect(status).toBe(403);
    } finally {
      await handle.close();
    }
  });
});
