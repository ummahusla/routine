import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";
import { substitute } from "../template.js";

export type ExecuteFlowOpts = {
  node: Extract<Node, { type: "flow" }>;
  input: Envelope;
  roteCmd: string;
  roteArgsPrefix?: string[];     // for testing — prepend args before "deno run ..."
  resolveFlowPath?: (flowRef: string) => string;
  signal?: AbortSignal;
};

export function defaultResolveFlowPath(flowRef: string): string {
  const home = homedir() || process.env.HOME || process.env.USERPROFILE || "~";
  const parts = flowRef.split("/", 2);
  const category = parts[0] ?? "";
  const name = parts[1] ?? "";
  const candidates = [
    join(home, ".rote", "flows", category, name, "main.ts"),
    join(home, ".rote", "flows", name, "main.ts"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `flow not found: ${flowRef} (searched: ${candidates.join(", ")})`,
  );
}

export async function executeFlow(opts: ExecuteFlowOpts): Promise<Envelope> {
  const resolve = opts.resolveFlowPath ?? defaultResolveFlowPath;
  const flowPath = resolve(opts.node.flow);

  // Pass params as positionals in node.params insertion order — matches
  // rote flow CLI convention (positional args, e.g. `[limit] [offset] ...`).
  const positionals: string[] = [];
  for (const v of Object.values(opts.node.params)) {
    const resolved = typeof v === "string" ? substitute(v, opts.input) : JSON.stringify(v);
    positionals.push(resolved);
  }

  const argv: string[] = [
    ...(opts.roteArgsPrefix ?? []),
    "deno",
    "run",
    "--allow-all",
    flowPath,
    ...positionals,
  ];

  return new Promise<Envelope>((resolveP, reject) => {
    const child = spawn(opts.roteCmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    if (opts.signal) {
      const onAbort = () => child.kill("SIGTERM");
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`rote subprocess exit ${code}: ${stderr.trim() || "<no stderr>"}`));
        return;
      }
      const env: Envelope = { text: stdout };
      try {
        env.data = JSON.parse(stdout);
      } catch {
        // best-effort — leave data undefined
      }
      resolveP(env);
    });
  });
}
