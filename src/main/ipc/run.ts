import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { listRuns, readRunResult } from "@flow-build/engine";
import {
  RunExecuteInputSchema,
  RunCancelInputSchema,
  RunListInputSchema,
  RunReadInputSchema,
  RunWatchInputSchema,
  RunUnwatchInputSchema,
} from "./schemas.js";
import type { RunRegistry } from "../runRegistry.js";

export type RunIpcDeps = {
  baseDir: string;
  registry: RunRegistry;
};

type IpcResult<T> = ({ ok: true } & T) | { ok: false; code: string; error: string };

function invalid(error: string): IpcResult<never> {
  return { ok: false, code: "INVALID", error };
}

function fail(e: unknown): IpcResult<never> {
  const code = (e as { code?: string }).code ?? "UNKNOWN";
  const error = e instanceof Error ? e.message : String(e);
  return { ok: false, code, error };
}

export function registerRunIpc(ipc: IpcMain, deps: RunIpcDeps): void {
  ipc.handle("run:execute", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunExecuteInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const runId = await deps.registry.start(parsed.data.sessionId, parsed.data.inputs);
      return { ok: true, runId };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:cancel", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunCancelInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      await deps.registry.cancel(parsed.data.runId);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:list", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunListInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const runs = await listRuns(deps.baseDir, parsed.data.sessionId);
      return { ok: true, runs };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:read", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunReadInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const result = await readRunResult(deps.baseDir, parsed.data.sessionId, parsed.data.runId);
      return { ok: true, ...result };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:watch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunWatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    const subscriptionId = deps.registry.subscribe(parsed.data.runId, e.sender as WebContents);
    return { ok: true, subscriptionId };
  });

  ipc.handle("run:unwatch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunUnwatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    deps.registry.unsubscribe(parsed.data.subscriptionId, e.sender as WebContents);
    return { ok: true };
  });
}
