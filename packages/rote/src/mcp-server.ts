import { spawn } from "node:child_process";
import { createServer, type Server as HttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

export type RoteMcpHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type RoteMcpStartOptions = {
  bin: string;
  defaultCwd: string;
  defaultTimeoutMs?: number;
  maxStdoutBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_STDOUT_BYTES = 1_000_000; // 1 MB cap on stdout/stderr capture
const ALLOWED_CMD = /^rote(\s+|$)/;

type ExecResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
};

function asTextResult(payload: unknown): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

async function execRote(args: {
  bin: string;
  command: string;
  cwd: string;
  timeoutMs: number;
  maxStdoutBytes: number;
}): Promise<ExecResult> {
  const started = Date.now();
  return new Promise<ExecResult>((resolve) => {
    // shell=true so the agent can pass shell-style flags/quoting in `command`,
    // matching the ergonomics of the SDK's bash tool. We pin the leading token
    // to `rote` (validated at the call site) so this is not a generic shell.
    const child = spawn(args.command, {
      cwd: args.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // SIGTERM grace period; SIGKILL if it hangs.
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, args.timeoutMs);
    timer.unref();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length + chunk.length > args.maxStdoutBytes) {
        stdout += chunk.slice(0, args.maxStdoutBytes - stdout.length);
        truncated = true;
      } else {
        stdout += chunk;
      }
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length + chunk.length > args.maxStdoutBytes) {
        stderr += chunk.slice(0, args.maxStdoutBytes - stderr.length);
        truncated = true;
      } else {
        stderr += chunk;
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`,
        exitCode: null,
        signal: null,
        durationMs: Date.now() - started,
        timedOut,
        truncated,
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr,
        exitCode: code,
        signal,
        durationMs: Date.now() - started,
        timedOut,
        truncated,
      });
    });
  });
}

const ExecInput = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      "Full rote shell command, e.g. 'rote flow search \"polymarket\"'. Must start with 'rote '.",
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(600_000)
    .optional()
    .describe("Hard timeout in ms. Default 60000. Max 600000."),
  cwd: z
    .string()
    .optional()
    .describe("Working directory. Defaults to the session workspace."),
});

function buildMcpServer(opts: RoteMcpStartOptions): McpServer {
  const mcp = new McpServer(
    { name: "rote-exec", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  const defaultTimeout = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxStdoutBytes ?? MAX_STDOUT_BYTES;

  mcp.tool(
    "rote_exec",
    "Run a rote CLI command and return its captured stdout/stderr/exitCode. Use this INSTEAD of the bash shell tool for all rote commands — the harness's bash tool hangs on rote invocations. Command must start with 'rote '.",
    ExecInput.shape,
    async (raw) => {
      const parsed = ExecInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({
          ok: false,
          error: `validation: ${parsed.error.message}`,
        });
      }
      const { command, timeoutMs, cwd } = parsed.data;
      if (!ALLOWED_CMD.test(command)) {
        return asTextResult({
          ok: false,
          error: "command must start with 'rote ' (only rote invocations allowed)",
        });
      }
      try {
        const result = await execRote({
          bin: opts.bin,
          command,
          cwd: cwd ?? opts.defaultCwd,
          timeoutMs: timeoutMs ?? defaultTimeout,
          maxStdoutBytes: maxBytes,
        });
        return asTextResult(result);
      } catch (e) {
        return asTextResult({
          ok: false,
          error: `io: ${(e as Error).message}`,
        });
      }
    },
  );

  return mcp;
}

export async function startRoteMcpServer(
  opts: RoteMcpStartOptions,
): Promise<RoteMcpHandle> {
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
      reject(new Error(`rote mcp http server failed to start: ${(e as Error).message}`));
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
