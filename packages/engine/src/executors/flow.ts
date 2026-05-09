import { spawn } from "node:child_process";
import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";
import { substitute } from "../template.js";

export type ExecuteFlowOpts = {
  node: Extract<Node, { type: "flow" }>;
  input: Envelope;
  roteCmd: string;
  roteArgsPrefix?: string[];     // for testing — prepend args before "flow run ..."
  signal?: AbortSignal;
};

export async function executeFlow(opts: ExecuteFlowOpts): Promise<Envelope> {
  const argv: string[] = [
    ...(opts.roteArgsPrefix ?? []),
    "flow",
    "run",
    opts.node.flow,
  ];
  for (const [k, v] of Object.entries(opts.node.params)) {
    const resolved = typeof v === "string" ? substitute(v, opts.input) : JSON.stringify(v);
    argv.push(`--${k}=${resolved}`);
  }

  return new Promise<Envelope>((resolve, reject) => {
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
      resolve(env);
    });
  });
}
