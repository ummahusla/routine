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
import { summarizeNodes, type RunEventTail, type RunResult } from "@flow-build/engine";

export type FlowbuilderMcpHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type RunStarter = (
  sessionId: string,
  inputs?: Record<string, unknown>,
) => Promise<string>;
export type RunResultReader = (sessionId: string, runId: string) => Promise<RunResult>;
export type RunWaiter = (runId: string, timeoutMs: number) => Promise<void>;
export type RunEventTailReader = (
  sessionId: string,
  runId: string,
  sinceCursor: number,
) => Promise<RunEventTail>;

export type StartOptions = {
  session: SessionManager;
  runStarter: RunStarter;
  runResultReader: RunResultReader;
  waitForRunEnd: RunWaiter;
  tailReader?: RunEventTailReader;
};

const SetStateInput = z.object({ state: StateSchema });

function asTextResult(payload: unknown): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

function buildMcpServer(
  session: SessionManager,
  runStarter: RunStarter,
  runResultReader: RunResultReader,
  waitForRunEnd: RunWaiter,
  tailReader: RunEventTailReader | undefined,
): McpServer {
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

  const ExecuteFlowInput = z.object({
    inputs: z.record(z.unknown()).optional(),
  });

  mcp.tool(
    "flowbuilder_execute_flow",
    "Execute the current flowbuilder graph. Returns a runId immediately; the run executes asynchronously. Call flowbuilder_get_run_result({ runId, waitMs }) to await the final outcome. Pass `inputs` ({ [nodeId]: value }) to populate input nodes flagged `required: true` (or to override any input node's static value); inspect the graph via flowbuilder_get_state to discover required input node ids.",
    ExecuteFlowInput.shape,
    async (raw) => {
      const parsed = ExecuteFlowInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({ ok: false, error: `validation: ${parsed.error.message}` });
      }
      try {
        const runId = await runStarter(session.sessionId, parsed.data.inputs);
        return asTextResult({ ok: true, runId, sessionId: session.sessionId });
      } catch (e) {
        return asTextResult({ ok: false, error: errorToToolMessage(e) });
      }
    },
  );

  const GetRunResultInput = z.object({
    runId: z.string().min(1),
    waitMs: z.number().int().min(0).max(60_000).optional(),
  });

  mcp.tool(
    "flowbuilder_get_run_result",
    "Fetch the snapshot of a previously started run. Works mid-run too — returns whatever has been recorded so far, including a per-node `nodes` summary (status, timings, errors). If waitMs (max 60000) is set, blocks server-side up to that long for run completion before reading; otherwise returns current on-disk state.",
    GetRunResultInput.shape,
    async (raw) => {
      const parsed = GetRunResultInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({ ok: false, error: `validation: ${parsed.error.message}` });
      }
      try {
        if (parsed.data.waitMs && parsed.data.waitMs > 0) {
          await waitForRunEnd(parsed.data.runId, parsed.data.waitMs);
        }
        const result = await runResultReader(session.sessionId, parsed.data.runId);
        return asTextResult({
          ok: true,
          status: result.manifest.status,
          startedAt: result.manifest.startedAt,
          endedAt: result.manifest.endedAt,
          nodes: summarizeNodes(result.events),
          finalOutput: result.events.find((e) => e.type === "run_end")?.finalOutput,
          outputs: result.outputs,
          error: result.manifest.error,
        });
      } catch (e) {
        return asTextResult({ ok: false, error: errorToToolMessage(e) });
      }
    },
  );

  const TailRunEventsInput = z.object({
    runId: z.string().min(1),
    sinceCursor: z.number().int().min(0).optional(),
    waitMs: z.number().int().min(0).max(60_000).optional(),
  });

  mcp.tool(
    "flowbuilder_tail_run_events",
    "Stream fine-grained run events (run_start, node_start, node_text, node_end, run_end) since a byte-offset cursor. Pass `sinceCursor: 0` on first call; on every subsequent call pass the `nextCursor` returned by the previous response. With `waitMs` (max 60000) the server blocks until new events arrive, the run ends, or the timeout elapses — long-poll for live progress without busy-spinning. Returns `{ events, nextCursor, status, nodes, done }` where `done=true` means the run reached a terminal state and no more events will appear.",
    TailRunEventsInput.shape,
    async (raw) => {
      const parsed = TailRunEventsInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({ ok: false, error: `validation: ${parsed.error.message}` });
      }
      if (!tailReader) {
        return asTextResult({ ok: false, error: "io: tail_run_events not available in this context" });
      }
      const { runId } = parsed.data;
      const cursor = parsed.data.sinceCursor ?? 0;
      const waitMs = parsed.data.waitMs ?? 0;
      try {
        const deadline = waitMs > 0 ? Date.now() + waitMs : 0;
        // First read — may immediately return new events (or nothing).
        let tail = await tailReader(session.sessionId, runId, cursor);
        // Long-poll loop: while no events and still within budget, sleep + retry.
        // Exit early if the run has reached a terminal state.
        while (tail.events.length === 0 && deadline > Date.now()) {
          const result = await runResultReader(session.sessionId, runId);
          if (result.manifest.status !== "running") {
            // Run ended; final pass to drain any tail bytes flushed after the
            // status flip.
            tail = await tailReader(session.sessionId, runId, tail.nextCursor);
            return asTextResult(buildTailResponse(tail, result));
          }
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          await new Promise((r) => setTimeout(r, Math.min(200, remaining)));
          tail = await tailReader(session.sessionId, runId, tail.nextCursor);
        }
        const result = await runResultReader(session.sessionId, runId);
        return asTextResult(buildTailResponse(tail, result));
      } catch (e) {
        return asTextResult({ ok: false, error: errorToToolMessage(e) });
      }
    },
  );

  return mcp;
}

function buildTailResponse(tail: RunEventTail, result: RunResult) {
  const done = result.manifest.status !== "running";
  return {
    ok: true,
    events: tail.events,
    nextCursor: tail.nextCursor,
    status: result.manifest.status,
    nodes: summarizeNodes(result.events),
    done,
    ...(result.manifest.error ? { error: result.manifest.error } : {}),
  };
}

export async function startFlowbuilderMcpServer(
  opts: StartOptions,
): Promise<FlowbuilderMcpHandle> {
  const { session, runStarter, runResultReader, waitForRunEnd, tailReader } = opts;

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
    const mcp = buildMcpServer(session, runStarter, runResultReader, waitForRunEnd, tailReader);
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
