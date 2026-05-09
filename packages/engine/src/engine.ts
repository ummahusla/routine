import { randomBytes } from "node:crypto";
import type { Node } from "@flow-build/flowbuilder";
import type {
  CreateRunOptions,
  Envelope,
  Run,
  RunEvent,
  RunManifest,
  RunStatus,
} from "./types.js";
import { topoOrder } from "./topo.js";
import { EngineError } from "./errors.js";
import {
  initRunDir,
  appendEvent,
  writeOutputs,
  writeManifest,
} from "./runStore.js";
import { executeInput } from "./executors/input.js";
import { executeOutput } from "./executors/output.js";
import { executeFlow } from "./executors/flow.js";
import { executeLlm } from "./executors/llm.js";

function ulid(): string {
  // Sufficient for run IDs — 16 random hex chars, monotonic-ish via timestamp prefix.
  return Date.now().toString(36) + randomBytes(8).toString("hex");
}

export function createRun(opts: CreateRunOptions): Run {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  const outputs = new Map<string, Envelope>();
  const queue: RunEvent[] = [];
  let waker: (() => void) | null = null;
  let finished = false;
  let status: RunStatus = "running";

  const internalAbort = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) internalAbort.abort();
    else opts.signal.addEventListener("abort", () => internalAbort.abort(), { once: true });
  }

  function push(ev: RunEvent): void {
    queue.push(ev);
    waker?.();
    void appendEvent(opts.baseDir, opts.sessionId, runId, ev).catch(() => {});
  }

  const events: AsyncIterable<RunEvent> = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queue.length) yield queue.shift()!;
        if (finished) return;
        await new Promise<void>((r) => (waker = r));
        waker = null;
      }
    },
  };

  let resolveDone!: (v: { status: RunStatus; finalOutput?: Envelope; error?: string }) => void;
  const done = new Promise<{ status: RunStatus; finalOutput?: Envelope; error?: string }>(
    (res) => (resolveDone = res),
  );

  function inputsFor(nodeId: string): Envelope {
    const incoming = opts.state.edges
      .filter((e) => e.to === nodeId)
      .map((e) => e.from);
    if (incoming.length === 0) return { text: "", data: undefined };
    if (incoming.length === 1) return outputs.get(incoming[0] as string)!;
    const text = incoming.map((id) => outputs.get(id)?.text ?? "").join("");
    const data = incoming.map((id) => outputs.get(id)?.data);
    return { text, data };
  }

  // node is typed as Node (current union without llm); cast to any for the switch
  // so the llm case compiles — Task 13 will add LlmNode to the union.
  async function runOneNode(node: Node): Promise<void> {
    const n = node as any;
    const at = () => new Date().toISOString();
    push({ type: "node_start", runId, nodeId: n.id, nodeType: n.type, at: at() });
    try {
      const input = inputsFor(n.id);
      let env: Envelope;
      switch (n.type) {
        case "input": {
          const overlay = opts.inputs;
          const has = !!overlay && Object.prototype.hasOwnProperty.call(overlay, n.id);
          env = executeInput(n, has ? { hasOverride: true, value: overlay![n.id] } : undefined);
          break;
        }
        case "output":
          env = executeOutput(input);
          break;
        case "flow":
          env = await executeFlow({
            node: n,
            input,
            roteCmd: opts.roteCmd ?? "rote",
            signal: internalAbort.signal,
          });
          break;
        case "llm":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          env = await (executeLlm as any)({
            node: n,
            input,
            cursorClient: opts.cursorClient,
            onChunk: (chunk: string) => push({ type: "node_text", runId, nodeId: n.id, chunk }),
            signal: internalAbort.signal,
            ...(opts.cwd ? { cwd: opts.cwd } : {}),
          });
          break;
        default:
          // branch/merge already rejected by topoOrder
          throw new EngineError("UNSUPPORTED_NODE_TYPE", `unreachable: ${n.type}`);
      }
      outputs.set(n.id, env);
      push({ type: "node_end", runId, nodeId: n.id, status: "done", output: env, at: at() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ type: "node_end", runId, nodeId: n.id, status: "error", error: msg, at: at() });
      throw err;
    }
  }

  (async () => {
    try {
      await initRunDir({
        baseDir: opts.baseDir,
        sessionId: opts.sessionId,
        runId,
        startedAt,
        state: opts.state,
      });
      push({ type: "run_start", runId, sessionId: opts.sessionId, startedAt });

      const order = topoOrder(opts.state);
      const nodesById = new Map(opts.state.nodes.map((n) => [n.id, n]));

      let failedAt = -1;
      let cancelledAt = -1;
      let runError: string | undefined;

      for (let i = 0; i < order.length; i++) {
        if (internalAbort.signal.aborted) {
          cancelledAt = i;
          break;
        }
        const node = nodesById.get(order[i] as string)!;
        try {
          await runOneNode(node);
        } catch (err) {
          failedAt = i;
          runError = err instanceof Error ? err.message : String(err);
          break;
        }
      }

      const haltAt = failedAt >= 0 ? failedAt : cancelledAt >= 0 ? cancelledAt : -1;
      const skipStatus: "skipped" = "skipped";
      if (haltAt >= 0) {
        for (let i = haltAt + 1; i < order.length; i++) {
          push({
            type: "node_end",
            runId, nodeId: order[i] as string,
            status: skipStatus,
            at: new Date().toISOString(),
          });
        }
      }

      let finalOutput: Envelope | undefined;
      const outputNode = opts.state.nodes.find((n) => n.type === "output");
      if (outputNode && outputs.has(outputNode.id)) {
        finalOutput = outputs.get(outputNode.id);
      }

      status = failedAt >= 0 ? "failed" : cancelledAt >= 0 ? "cancelled" : "succeeded";
      const endedAt = new Date().toISOString();

      const outputsObj: Record<string, Envelope> = {};
      for (const [k, v] of outputs) outputsObj[k] = v;
      await writeOutputs(opts.baseDir, opts.sessionId, runId, outputsObj);

      const manifest: RunManifest = {
        runId, sessionId: opts.sessionId, startedAt, endedAt, status,
        ...(runError ? { error: runError } : {}),
      };
      await writeManifest(opts.baseDir, opts.sessionId, runId, manifest);

      const endEvent: RunEvent = {
        type: "run_end", runId, status,
        ...(finalOutput ? { finalOutput } : {}),
        ...(runError ? { error: runError } : {}),
        at: endedAt,
      };
      push(endEvent);

      finished = true;
      (waker as (() => void) | null)?.(); waker = null;
      resolveDone({
        status,
        ...(finalOutput ? { finalOutput } : {}),
        ...(runError ? { error: runError } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // graph-level failure (e.g. branch/merge unsupported)
      status = "failed";
      const endedAt = new Date().toISOString();
      try {
        await writeManifest(opts.baseDir, opts.sessionId, runId, {
          runId, sessionId: opts.sessionId, startedAt, endedAt,
          status, error: msg,
        });
      } catch { /* ignore — best effort */ }
      push({ type: "run_end", runId, status, error: msg, at: endedAt });
      finished = true;
      (waker as (() => void) | null)?.(); waker = null;
      resolveDone({ status, error: msg });
    }
  })();

  return {
    runId,
    sessionId: opts.sessionId,
    get status() { return status; },
    events,
    cancel: async () => {
      internalAbort.abort();
    },
    done,
  };
}
