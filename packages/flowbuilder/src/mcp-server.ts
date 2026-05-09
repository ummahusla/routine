import { createServer, type Server as HttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { StateSchema } from "./schema.js";
import {
  FlowbuilderError,
  FlowbuilderMcpStartError,
} from "./errors.js";
import type { SessionManager } from "./session.js";

export type FlowbuilderMcpHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type StartOptions = {
  session: SessionManager;
};

const SetStateInput = z.object({ state: StateSchema });

function asTextResult(payload: unknown): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

function buildMcpServer(session: SessionManager): McpServer {
  const mcp = new McpServer(
    { name: "flowbuilder", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  mcp.tool(
    "flowbuilder_get_state",
    "Read the current flowbuilder state.json for this session.",
    {},
    async () => {
      try {
        const loaded = session.load();
        return asTextResult({ ok: true, state: loaded.state });
      } catch (e) {
        return asTextResult({
          ok: false,
          error: errorToToolMessage(e),
        });
      }
    },
  );

  mcp.tool(
    "flowbuilder_set_state",
    "Write the full flowbuilder state.json. Always supply the complete graph; partial updates are not supported.",
    { state: z.unknown() },
    async (raw) => {
      const parsed = SetStateInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({
          ok: false,
          error: `validation: ${parsed.error.message}`,
        });
      }
      try {
        const out = session.saveState(parsed.data.state);
        return asTextResult({ ok: true, ...out });
      } catch (e) {
        return asTextResult({
          ok: false,
          error: errorToToolMessage(e),
        });
      }
    },
  );

  return mcp;
}

export async function startFlowbuilderMcpServer(
  opts: StartOptions,
): Promise<FlowbuilderMcpHandle> {
  const { session } = opts;

  const http: HttpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const host = req.headers.host;
    const port = (http.address() as { port: number } | null)?.port;
    if (host !== `127.0.0.1:${port}`) {
      res.statusCode = 403;
      res.end();
      return;
    }

    // Stateless MCP: each request gets a fresh server + transport pair.
    // The StreamableHTTPServerTransport rejects reuse in stateless mode
    // ("cannot be reused across requests"), and stateful mode rejects
    // re-initialization across distinct clients. A per-request server
    // is the supported pattern (see SDK's simpleStatelessStreamableHttp
    // example).
    const mcp = buildMcpServer(session);
    // Omit `sessionIdGenerator` to opt into stateless mode (each request
    // gets a fresh transport+server). Passing it explicitly as `undefined`
    // trips `exactOptionalPropertyTypes`.
    const transport = new StreamableHTTPServerTransport({});

    res.on("close", () => {
      transport.close().catch(() => {});
      mcp.close().catch(() => {});
    });

    try {
      // The SDK's StreamableHTTPServerTransport types `onclose` as
      // `(() => void) | undefined` (non-optional union) while `Transport`
      // declares it as `onclose?: () => void`. Under
      // `exactOptionalPropertyTypes` the two are not assignable; cast
      // through unknown to bridge the SDK's typing gap.
      await mcp.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", (e) => {
      reject(
        new FlowbuilderMcpStartError(
          `mcp http server failed to start: ${(e as Error).message}`,
          { sessionId: session.sessionId, path: session.sessionDir, cause: e },
        ),
      );
    });
    http.listen(0, "127.0.0.1", () => resolve());
  });

  const port = (http.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/mcp`;

  let closed = false;
  return {
    url,
    port,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function errorToToolMessage(e: unknown): string {
  if (e instanceof FlowbuilderError) {
    const code = e.name.replace(/^Flowbuilder/, "").replace(/Error$/, "");
    const norm = code
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
    return `${norm}: ${e.message}`;
  }
  if (e instanceof Error) return `io: ${e.message}`;
  return `io: ${String(e)}`;
}
