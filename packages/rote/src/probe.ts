import { inferActiveWorkspace } from "./workspace.js";
import type { ExecFn, ExecResult, RoteFacts } from "./types.js";

async function safeExec(
  exec: ExecFn,
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<ExecResult | null> {
  try {
    const r = await exec(bin, args, { timeoutMs });
    if (r.timedOut || r.exitCode !== 0) return null;
    return r;
  } catch {
    return null;
  }
}

function parseVersion(out: string): string | null {
  const m = /([0-9]+\.[0-9]+(?:\.[0-9]+)?)/.exec(out.trim());
  return m && m[1] ? m[1] : null;
}

function parseJson<T>(out: string): T | null {
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

export type ProbeInput = {
  bin: string;
  cwd: string;
  roteHome: string;
  timeoutMs: number;
  exec: ExecFn;
};

export async function runProbe(input: ProbeInput): Promise<RoteFacts> {
  const { bin, cwd, roteHome, timeoutMs, exec } = input;

  const [verRes, advRes, penRes, floRes] = await Promise.all([
    safeExec(exec, bin, ["--version"], timeoutMs),
    safeExec(exec, bin, ["machine", "inventory", "--json"], timeoutMs),
    safeExec(exec, bin, ["flow", "pending", "list", "--json"], timeoutMs),
    safeExec(exec, bin, ["flow", "list", "--json"], timeoutMs),
  ]);

  const version = verRes ? parseVersion(verRes.stdout) : null;

  const advParsed = advRes
    ? parseJson<{
        adapters?: Array<{ id: string; fingerprint: string; toolsetCount: number }>;
      }>(advRes.stdout)
    : null;
  const adapters =
    advParsed?.adapters && Array.isArray(advParsed.adapters)
      ? advParsed.adapters.map((a) => ({
          id: String(a.id),
          fingerprint: String(a.fingerprint),
          toolsetCount: Number(a.toolsetCount) || 0,
        }))
      : null;

  const penParsed = penRes
    ? parseJson<Array<{ workspace: string; name: string; adapter: string }>>(penRes.stdout)
    : null;
  const pendingStubs = Array.isArray(penParsed)
    ? penParsed.map((s) => ({
        workspace: String(s.workspace),
        name: String(s.name),
        adapter: String(s.adapter),
      }))
    : null;

  let flowCount: number | null = null;
  if (floRes) {
    const fl = parseJson<unknown>(floRes.stdout);
    if (Array.isArray(fl)) flowCount = fl.length;
    else if (fl && typeof fl === "object" && Array.isArray((fl as { flows?: unknown }).flows)) {
      flowCount = ((fl as { flows: unknown[] }).flows).length;
    }
  }

  const activeWorkspace = inferActiveWorkspace({ cwd, roteHome });

  return { version, adapters, pendingStubs, flowCount, activeWorkspace };
}
