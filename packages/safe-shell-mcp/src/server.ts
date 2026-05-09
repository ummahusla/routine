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

  // Outer shape passed to mcp.tool(): types are accurate (so the JSON Schema
  // the SDK advertises in tools/list is rich and useful to the model), but
  // bound checks are intentionally absent here. The strict `ShInput` defined
  // above does the real validation inside the handler so we can return a JSON
  // envelope `{ok:false, error:"validation: ..."}` instead of the SDK's
  // plain-text McpError that bypasses our envelope contract.
  //
  // Asymmetry note: the envelope contract holds for BOUND violations only
  // (empty command, oversize timeoutMs, etc.). TYPE violations (e.g. caller
  // passes `command: 42`) short-circuit at the SDK boundary and surface as
  // an `isError: true` text content with `MCP error -32602: ...`, NOT as a
  // parseable JSON envelope. Downstream callers in this monorepo build their
  // own args and never pass wrong-typed values; if a model emits a type
  // mismatch, the SDK's error response is still informative enough for the
  // model to self-correct.
  const ShInputOuter = {
    command: z.string().describe("Shell command to run via /bin/sh -c."),
    cwd: z
      .string()
      .optional()
      .describe("Working directory. Defaults to the session workspace."),
    timeoutMs: z
      .number()
      .optional()
      .describe(`Hard timeout in ms. Default ${DEFAULT_TIMEOUT_MS}. Max ${MAX_TIMEOUT_MS}.`),
    maxBytes: z
      .number()
      .optional()
      .describe(`Per-stream stdout/stderr cap in bytes. Default ${DEFAULT_MAX_BYTES}. Max ${HARD_MAX_BYTES}.`),
    env: z
      .record(z.string())
      .optional()
      .describe("Extra env vars merged onto the process env. CURSOR_* keys are dropped."),
  };

  mcp.tool(
    "sh",
    "Run a shell command via /bin/sh -c with a hard timeout and bounded output. Use this INSTEAD of the built-in Shell tool — the built-in is disabled in this harness due to a Cursor SDK regression.",
    ShInputOuter,
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
