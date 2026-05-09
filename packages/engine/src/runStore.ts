import { existsSync } from "node:fs";
import { mkdir, appendFile, writeFile, readFile, readdir, open, stat } from "node:fs/promises";
import { join } from "node:path";
import type { State } from "@flow-build/flowbuilder";
import type { Envelope, RunEvent, RunManifest } from "./types.js";

function runDir(baseDir: string, sessionId: string, runId: string): string {
  return join(baseDir, "sessions", sessionId, "runs", runId);
}

export async function initRunDir(opts: {
  baseDir: string;
  sessionId: string;
  runId: string;
  startedAt: string;
  state: State;
}): Promise<void> {
  const dir = runDir(opts.baseDir, opts.sessionId, opts.runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "snapshot.json"), `${JSON.stringify(opts.state, null, 2)}\n`);
  const manifest: RunManifest = {
    runId: opts.runId,
    sessionId: opts.sessionId,
    startedAt: opts.startedAt,
    status: "running",
  };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dir, "events.jsonl"), "");
}

export async function appendEvent(
  baseDir: string,
  sessionId: string,
  runId: string,
  event: RunEvent,
): Promise<void> {
  const path = join(runDir(baseDir, sessionId, runId), "events.jsonl");
  await appendFile(path, `${JSON.stringify(event)}\n`);
}

export async function writeOutputs(
  baseDir: string,
  sessionId: string,
  runId: string,
  outputs: Record<string, Envelope>,
): Promise<void> {
  const path = join(runDir(baseDir, sessionId, runId), "outputs.json");
  await writeFile(path, `${JSON.stringify(outputs, null, 2)}\n`);
}

export async function writeManifest(
  baseDir: string,
  sessionId: string,
  runId: string,
  manifest: RunManifest,
): Promise<void> {
  const path = join(runDir(baseDir, sessionId, runId), "manifest.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export type RunResult = {
  manifest: RunManifest;
  events: RunEvent[];
  outputs: Record<string, Envelope>;
};

export async function readRunResult(
  baseDir: string,
  sessionId: string,
  runId: string,
): Promise<RunResult> {
  const dir = runDir(baseDir, sessionId, runId);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as RunManifest;
  const eventsRaw = await readFile(join(dir, "events.jsonl"), "utf8");
  const events: RunEvent[] = eventsRaw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RunEvent);
  const outputsPath = join(dir, "outputs.json");
  const outputs: Record<string, Envelope> = existsSync(outputsPath)
    ? (JSON.parse(await readFile(outputsPath, "utf8")) as Record<string, Envelope>)
    : {};
  return { manifest, events, outputs };
}

export type RunEventTail = {
  events: RunEvent[];
  nextCursor: number;
};

export async function readEventsFrom(
  baseDir: string,
  sessionId: string,
  runId: string,
  sinceCursor: number,
): Promise<RunEventTail> {
  const path = join(runDir(baseDir, sessionId, runId), "events.jsonl");
  if (!existsSync(path)) return { events: [], nextCursor: sinceCursor };
  const size = (await stat(path)).size;
  // File truncated (or unexpected shrink): reset to current size.
  if (sinceCursor > size) return { events: [], nextCursor: size };
  if (sinceCursor === size) return { events: [], nextCursor: size };
  const length = size - sinceCursor;
  const buf = Buffer.alloc(length);
  const fh = await open(path, "r");
  try {
    await fh.read(buf, 0, length, sinceCursor);
  } finally {
    await fh.close();
  }
  // Only consume bytes up to the last newline; keep partial trailing line for next call.
  const lastNl = buf.lastIndexOf(0x0a /* \n */);
  if (lastNl === -1) {
    // No complete line available yet; do not advance cursor.
    return { events: [], nextCursor: sinceCursor };
  }
  const consumed = buf.subarray(0, lastNl + 1).toString("utf8");
  const events: RunEvent[] = consumed
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RunEvent);
  return { events, nextCursor: sinceCursor + lastNl + 1 };
}

export async function listRuns(baseDir: string, sessionId: string): Promise<RunManifest[]> {
  const root = join(baseDir, "sessions", sessionId, "runs");
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: RunManifest[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const mp = join(root, e.name, "manifest.json");
    if (!existsSync(mp)) continue;
    try {
      out.push(JSON.parse(await readFile(mp, "utf8")) as RunManifest);
    } catch {
      // ignore malformed run dirs
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out;
}
