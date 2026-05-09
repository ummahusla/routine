import { app, type IpcMain } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listModels, type ModelInfo } from "@flow-build/core";

const DEFAULT_FALLBACK_ID = "composer-2";

type AppConfig = { defaultModel?: string };

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function readConfig(): AppConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AppConfig;
    return {};
  } catch {
    return {};
  }
}

function writeConfig(cfg: AppConfig): void {
  try {
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
  } catch (err) {
    console.warn("[models-ipc] failed to write config:", (err as Error).message);
  }
}

export type ModelsIpcDeps = {
  apiKey: string;
};

export function registerModelsIpc(ipc: IpcMain, deps: ModelsIpcDeps): void {
  let cache: ModelInfo[] | undefined;

  ipc.handle("models:list", async (_e, raw: unknown) => {
    const refresh = !!(raw && typeof raw === "object" && (raw as { refresh?: boolean }).refresh);
    if (cache && !refresh) return { ok: true, models: cache };
    try {
      const models = await listModels({ apiKey: deps.apiKey });
      cache = models;
      return { ok: true, models };
    } catch (err) {
      return { ok: false, code: "UNKNOWN", error: (err as Error).message };
    }
  });

  ipc.handle("app:get-default-model", async () => {
    const cfg = readConfig();
    return { ok: true, model: cfg.defaultModel ?? DEFAULT_FALLBACK_ID };
  });

  ipc.handle("app:set-default-model", async (_e, raw: unknown) => {
    if (!raw || typeof raw !== "object") return { ok: false, code: "INVALID", error: "expected object" };
    const id = (raw as { model?: unknown }).model;
    if (typeof id !== "string" || id.length === 0 || id.length > 80) {
      return { ok: false, code: "INVALID", error: "invalid model id" };
    }
    const cfg = readConfig();
    cfg.defaultModel = id;
    writeConfig(cfg);
    return { ok: true };
  });
}
