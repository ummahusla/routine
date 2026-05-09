import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runShell } from "./spawn.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_BYTES = 1_048_576; // 1 MiB
const HARD_MAX_BYTES = 10_485_760; // 10 MiB

export type SafeShellMcpOptions = {
  defaultCwd: string;
  defaultTimeoutMs?: number;
  defaultMaxBytes?: number;
};

const ShInput = z.object({
  command: z.string().min(1).describe("Shell command to run via /bin/sh -c."),
  cwd: z
    .string()
    .optional()
    .describe("Working directory. Defaults to the session workspace."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(`Hard timeout in ms. Default ${DEFAULT_TIMEOUT_MS}. Max ${MAX_TIMEOUT_MS}.`),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(HARD_MAX_BYTES)
    .optional()
    .describe(`Per-stream stdout/stderr cap in bytes. Default ${DEFAULT_MAX_BYTES}. Max ${HARD_MAX_BYTES}.`),
  env: z
    .record(z.string())
    .optional()
    .describe("Extra env vars merged onto the process env. CURSOR_* keys are dropped."),
});

function asTextResult(payload: unknown): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function buildMcpServer(opts: SafeShellMcpOptions): McpServer {
  const mcp = new McpServer(
    { name: "safe-shell", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  const defaultTimeout = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const defaultMax = opts.defaultMaxBytes ?? DEFAULT_MAX_BYTES;

  // The MCP SDK validates inputs against the registered shape *before* the handler
  // runs, throwing McpError(InvalidParams) on failure. We want validation errors to
  // reach the client as a structured JSON envelope (so tools can branch on
  // `ok: false`), so we register a permissive outer shape (the descriptive ShInput
  // is still used inside the handler via `safeParse`).
  const permissiveShape = {
    command: z.unknown().describe("Shell command to run via /bin/sh -c."),
    cwd: z.unknown().optional(),
    timeoutMs: z.unknown().optional(),
    maxBytes: z.unknown().optional(),
    env: z.unknown().optional(),
  };

  mcp.tool(
    "sh",
    "Run a shell command via /bin/sh -c with a hard timeout and bounded output. Use this INSTEAD of the built-in Shell tool — the built-in is disabled in this harness due to a Cursor SDK regression.",
    permissiveShape,
    async (raw) => {
      const parsed = ShInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({ ok: false, error: `validation: ${parsed.error.message}` });
      }
      const { command, cwd, timeoutMs, maxBytes, env } = parsed.data;
      try {
        const r = await runShell({
          command,
          cwd: cwd ?? opts.defaultCwd,
          timeoutMs: timeoutMs ?? defaultTimeout,
          maxBytes: maxBytes ?? defaultMax,
          ...(env !== undefined ? { env } : {}),
        });
        return asTextResult(r);
      } catch (e) {
        return asTextResult({ ok: false, error: `io: ${(e as Error).message}` });
      }
    },
  );

  return mcp;
}
