import { createServer, type Server as HttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { buildMcpServer, type SafeShellMcpOptions } from "./server.js";

export type SafeShellMcpHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type SafeShellMcpStartOptions = SafeShellMcpOptions;

export async function startSafeShellMcpServer(
  opts: SafeShellMcpStartOptions,
): Promise<SafeShellMcpHandle> {
  const http: HttpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const port = (http.address() as { port: number } | null)?.port;
    if (req.headers.host !== `127.0.0.1:${port}`) {
      res.statusCode = 403;
      res.end();
      return;
    }

    const mcp = buildMcpServer(opts);
    const transport = new StreamableHTTPServerTransport({});

    res.on("close", () => {
      transport.close().catch(() => {});
      mcp.close().catch(() => {});
    });

    try {
      await mcp.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", (e) => {
      reject(new Error(`safe-shell mcp http server failed to start: ${(e as Error).message}`));
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
