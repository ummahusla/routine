import { randomBytes } from "node:crypto";
import type { WebContents } from "electron";
import type {
  CursorClient,
  Run,
  RunEvent,
} from "@flow-build/engine";
import type { State } from "@flow-build/flowbuilder";

export type MakeRun = (opts: {
  sessionId: string;
  baseDir: string;
  state: State;
  cursorClient: CursorClient;
  inputs?: Record<string, unknown>;
}) => Run;

export type RunRegistryDeps = {
  baseDir: string;
  cursorClient: CursorClient;
  loadState: (sessionId: string) => Promise<State>;
  makeRun: MakeRun;
};

type Subscription = { id: string; runId: string; webContents: WebContents };

export class RunRegistry {
  private readonly deps: RunRegistryDeps;
  private readonly runs = new Map<string, Run>();
  private readonly subs = new Map<string, Subscription>();
  private readonly endWaiters = new Map<string, Set<() => void>>();

  constructor(deps: RunRegistryDeps) {
    this.deps = deps;
  }

  async start(sessionId: string, inputs?: Record<string, unknown>): Promise<string> {
    const state = await this.deps.loadState(sessionId);
    const run = this.deps.makeRun({
      sessionId,
      baseDir: this.deps.baseDir,
      state,
      cursorClient: this.deps.cursorClient,
      ...(inputs ? { inputs } : {}),
    });
    this.runs.set(run.runId, run);
    void this.pump(run);
    return run.runId;
  }

  has(runId: string): boolean {
    return this.runs.has(runId);
  }

  async cancel(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    await run.cancel();
  }

  subscribe(runId: string, webContents: WebContents): string {
    const id = randomBytes(8).toString("hex");
    this.subs.set(id, { id, runId, webContents });
    return id;
  }

  unsubscribe(subscriptionId: string, owner: WebContents): void {
    const sub = this.subs.get(subscriptionId);
    if (!sub) return;
    if (sub.webContents !== owner) return;
    this.subs.delete(subscriptionId);
  }

  /**
   * Resolves on the run's run_end event or after timeoutMs, whichever first.
   * If the run is no longer in the live map (already completed), resolves immediately.
   */
  async waitForRunEnd(runId: string, timeoutMs: number): Promise<void> {
    if (!this.runs.has(runId)) return;
    return new Promise<void>((resolve) => {
      let done = false;
      const onEnd = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const set = this.endWaiters.get(runId) ?? new Set();
      set.add(onEnd);
      this.endWaiters.set(runId, set);
      setTimeout(() => {
        if (done) return;
        done = true;
        set.delete(onEnd);
        resolve();
      }, timeoutMs);
    });
  }

  private fanout(runId: string, event: RunEvent): void {
    for (const sub of this.subs.values()) {
      if (sub.runId !== runId) continue;
      if (sub.webContents.isDestroyed?.()) {
        this.subs.delete(sub.id);
        continue;
      }
      sub.webContents.send("run:event", { runId, event });
    }
  }

  private async pump(run: Run): Promise<void> {
    try {
      for await (const ev of run.events) {
        this.fanout(run.runId, ev);
        if (ev.type === "run_end") {
          const set = this.endWaiters.get(run.runId);
          if (set) {
            for (const w of set) w();
            this.endWaiters.delete(run.runId);
          }
        }
      }
    } catch {
      // run errors surface as run_end{status:"failed"} from the engine
    } finally {
      this.runs.delete(run.runId);
      // wake any remaining waiters that didn't see a run_end (defensive)
      const set = this.endWaiters.get(run.runId);
      if (set) {
        for (const w of set) w();
        this.endWaiters.delete(run.runId);
      }
    }
  }
}
