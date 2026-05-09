import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";
import { deepSubstitute } from "../template.js";

export type FlowParameter = {
  name: string;
  required: boolean;
};

export type ExecuteFlowOpts = {
  node: Extract<Node, { type: "flow" }>;
  input: Envelope;
  roteCmd: string;
  roteArgsPrefix?: string[];     // for testing — prepend args before "deno run ..."
  resolveFlowPath?: (flowRef: string) => string;
  resolveManifest?: (flowPath: string) => FlowParameter[] | null;
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

// Parse the `parameters:` list out of the @rote-frontmatter YAML block in
// the flow's main.ts JSDoc. Targeted scanner — avoids pulling in a full YAML
// dep for one fixed schema. Returns null if the block / parameters list is
// not present (caller falls back to legacy positional-by-insertion behavior).
export function defaultResolveManifest(flowPath: string): FlowParameter[] | null {
  let source: string;
  try {
    source = readFileSync(flowPath, "utf8");
  } catch {
    return null;
  }
  const lines = source.split("\n");
  let i = 0;
  while (i < lines.length && !/@rote-frontmatter/.test(lines[i]!)) i++;
  if (i >= lines.length) return null;
  while (i < lines.length && !/^\s*\*\s*---\s*$/.test(lines[i]!)) i++;
  if (i >= lines.length) return null;
  i++;
  const startBody = i;
  while (i < lines.length && !/^\s*\*\s*---\s*$/.test(lines[i]!)) i++;
  if (i >= lines.length) return null;
  const body = lines.slice(startBody, i).map((l) => l.replace(/^\s*\*\s?/, ""));

  let pi = 0;
  while (pi < body.length && !/^\s*parameters:\s*$/.test(body[pi]!)) pi++;
  if (pi >= body.length) return null;
  const headerIndent = (body[pi]!.match(/^(\s*)/)?.[1] ?? "").length;
  pi++;

  const params: FlowParameter[] = [];
  let current: { name?: string; required: boolean } | null = null;
  const flush = () => {
    if (current?.name) params.push({ name: current.name, required: current.required });
    current = null;
  };

  for (; pi < body.length; pi++) {
    const line = body[pi]!;
    if (!line.trim()) continue;
    const indent = (line.match(/^(\s*)/)?.[1] ?? "").length;
    // YAML lets sequence items align with their key. Stop only on a non-list
    // line at <= header indent (i.e. a sibling key).
    if (indent < headerIndent) break;
    if (indent === headerIndent && !/^\s*-/.test(line)) break;
    const itemMatch = line.match(/^\s*-\s*name:\s*(.+?)\s*$/);
    if (itemMatch) {
      flush();
      current = { name: stripQuotes(itemMatch[1]!), required: false };
      continue;
    }
    if (current) {
      const reqMatch = line.match(/^\s*required:\s*(true|false)\s*$/);
      if (reqMatch) current.required = reqMatch[1] === "true";
    }
  }
  flush();
  // An empty `parameters:` block is a valid declaration of "this flow takes no
  // args". Only the absence of the block (handled by the early returns above)
  // signals an undeclared/legacy flow.
  return params;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function resolveParam(value: unknown, input: Envelope): string {
  const v = deepSubstitute(value, input);
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export async function executeFlow(opts: ExecuteFlowOpts): Promise<Envelope> {
  const resolve = opts.resolveFlowPath ?? defaultResolveFlowPath;
  const flowPath = resolve(opts.node.flow);

  const manifest = (opts.resolveManifest ?? defaultResolveManifest)(flowPath);
  if (manifest === null) {
    throw new Error(
      `flow ${opts.node.flow} (${flowPath}) has no @rote-frontmatter parameters list. ` +
        `Add a 'parameters:' block under metadata declaring the flow's argv shape; ` +
        `the engine no longer accepts undeclared positional fallbacks.`,
    );
  }
  const declared = new Map(manifest.map((p) => [p.name, p]));
  for (const key of Object.keys(opts.node.params)) {
    if (!declared.has(key)) {
      throw new Error(
        `flow ${opts.node.flow}: unknown param '${key}' (declared: ${manifest.map((p) => p.name).join(", ") || "<none>"})`,
      );
    }
  }
  for (const p of manifest) {
    if (p.required && opts.node.params[p.name] === undefined) {
      throw new Error(`flow ${opts.node.flow}: missing required param '${p.name}'`);
    }
  }
  const positionals = manifest.map((p) => resolveParam(opts.node.params[p.name], opts.input));

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
