import { app, shell, BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import {
  createSession,
  defaultPlugins,
  listSessions,
  loadSession,
  deleteSession,
  type Session,
} from "@flow-build/core";
import { createRun, makeCursorClient, readRunResult } from "@flow-build/engine";
import { StateSchema, validateRefIntegrity } from "@flow-build/flowbuilder";
import icon from "../../resources/icon.png?asset";
import { SessionRegistry } from "./registry.js";
import { registerSessionIpc } from "./ipc/session.js";
import { RunRegistry } from "./runRegistry.js";
import { registerRunIpc } from "./ipc/run.js";
import { registerModelsIpc } from "./ipc/models.js";

function loadLocalEnv(): void {
  // Precedence (Vite-like): shell env > .env.local > .env. We iterate the
  // higher-priority file first and use `??=` so an earlier set wins.
  for (const file of [".env.local", ".env"]) {
    const envPath = join(process.cwd(), file);
    if (!existsSync(envPath)) continue;

    const env = readFileSync(envPath, "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      process.env[key] ??= value;
    }
  }
}

function configureCursorRipgrepPath(): void {
  if (process.env.CURSOR_RIPGREP_PATH) return;
  const platformPackage =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "@cursor/sdk-darwin-arm64"
        : "@cursor/sdk-darwin-x64"
      : process.platform === "linux"
        ? process.arch === "arm64"
          ? "@cursor/sdk-linux-arm64"
          : "@cursor/sdk-linux-x64"
        : process.platform === "win32"
          ? "@cursor/sdk-win32-x64"
          : null;
  if (!platformPackage) return;
  const binaryName = process.platform === "win32" ? "rg.exe" : "rg";
  const rgPath = join(process.cwd(), "node_modules", platformPackage, "bin", binaryName);
  if (existsSync(rgPath)) process.env.CURSOR_RIPGREP_PATH = rgPath;
}

function getBaseDir(): string {
  return app.getPath("userData");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

loadLocalEnv();
configureCursorRipgrepPath();

// The cursor SDK leaks ConnectRPC stream rejections after agent.close().
// Log + swallow them so the renderer's IPC handlers stay deterministic and
// terminal output stays readable.
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const code = (reason as { code?: string } | null | undefined)?.code;
  console.warn(`[main] swallowed unhandledRejection${code ? ` (${code})` : ""}: ${message}`);
});

const cursorClient = makeCursorClient();

const runRegistry = new RunRegistry({
  baseDir: getBaseDir(),
  cursorClient,
  loadState: async (sessionId: string) => {
    const dir = join(getBaseDir(), "sessions", sessionId);
    const state = StateSchema.parse(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")));
    validateRefIntegrity(state);
    return state;
  },
  makeRun: ({ sessionId, baseDir, state, cursorClient: cc, inputs }) =>
    createRun({ sessionId, baseDir, state, cursorClient: cc, ...(inputs ? { inputs } : {}) }),
});

const runStarter = (sessionId: string, inputs?: Record<string, unknown>) =>
  runRegistry.start(sessionId, inputs);
const runResultReader = (sessionId: string, runId: string) =>
  readRunResult(getBaseDir(), sessionId, runId);
const waitForRunEnd = (runId: string, timeoutMs: number) =>
  runRegistry.waitForRunEnd(runId, timeoutMs);

const registry = new SessionRegistry<Session>({
  openSession: (sessionId) =>
    loadSession({
      baseDir: getBaseDir(),
      sessionId,
      plugins: defaultPlugins({
        baseDir: getBaseDir(),
        sessionId,
        runStarter,
        runResultReader,
        waitForRunEnd,
      }),
    }),
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.on("second-instance", () => {
  const all = BrowserWindow.getAllWindows();
  if (all[0]) {
    if (all[0].isMinimized()) all[0].restore();
    all[0].focus();
  }
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId("build.flow");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));

  registerSessionIpc(ipcMain, {
    baseDir: getBaseDir(),
    registry,
    createSession: (opts) =>
      createSession({
        ...opts,
        pluginsFactory: (sessionId) =>
          defaultPlugins({
            baseDir: opts.baseDir,
            sessionId,
            runStarter,
            runResultReader,
            waitForRunEnd,
          }),
      }),
    listSessions: (opts) => listSessions(opts),
    deleteSession: (opts) => deleteSession(opts),
  });

  registerRunIpc(ipcMain, {
    baseDir: getBaseDir(),
    registry: runRegistry,
  });

  registerModelsIpc(ipcMain, { apiKey: process.env.CURSOR_API_KEY ?? "" });

  ipcMain.handle("flowbuilder:list-sessions", async () => {
    const baseDir = getBaseDir();
    const sessionsDir = join(baseDir, "sessions");
    if (!existsSync(sessionsDir)) return { ok: true, baseDir, sessions: [] };
    try {
      const { readdirSync } = await import("fs");
      const { ManifestSchema, StateSchema, validateRefIntegrity } = await import(
        "@flow-build/flowbuilder"
      );
      const sessions = readdirSync(sessionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const dir = join(sessionsDir, entry.name);
          const manifestPath = join(dir, "manifest.json");
          const statePath = join(dir, "state.json");
          if (!existsSync(manifestPath) || !existsSync(statePath)) return null;
          try {
            const manifest = ManifestSchema.parse(
              JSON.parse(readFileSync(manifestPath, "utf8")),
            );
            const state = StateSchema.parse(JSON.parse(readFileSync(statePath, "utf8")));
            validateRefIntegrity(state);
            return {
              id: entry.name,
              name: manifest.name,
              description: manifest.description,
              createdAt: manifest.createdAt,
              updatedAt: manifest.updatedAt,
              nodeCount: state.nodes.length,
            };
          } catch {
            return null;
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { ok: true, baseDir, sessions };
    } catch (error) {
      return {
        ok: false,
        baseDir,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "flowbuilder:read-session",
    async (_e, { sessionId }: { sessionId: string }) => {
      const baseDir = getBaseDir();
      try {
        const { ManifestSchema, StateSchema, validateRefIntegrity } = await import(
          "@flow-build/flowbuilder"
        );
        const dir = join(baseDir, "sessions", sessionId);
        const manifest = ManifestSchema.parse(
          JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
        );
        const state = StateSchema.parse(
          JSON.parse(readFileSync(join(dir, "state.json"), "utf8")),
        );
        validateRefIntegrity(state);
        return { ok: true, baseDir, manifest, state };
      } catch (error) {
        return {
          ok: false,
          baseDir,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle("flowbuilder:get-flow-info", async (_e, { flowRef }: { flowRef: string }) => {
    const roteFlowsRoot =
      process.env.ROTE_FLOWS_ROOT || join(process.env.ROTE_HOME || join(homedir(), ".rote"), "flows");
    const slug = flowRef.includes("/") ? flowRef.split("/").slice(1).join("/") : flowRef;
    const tiers = ["local", "workspace", "bootstrap"];
    for (const tier of tiers) {
      const manifestPath = join(roteFlowsRoot, tier, slug, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: string;
          description?: string;
          metadata?: {
            requires_endpoints?: string[];
            parameters?: Array<{
              name: string;
              type?: string;
              required?: boolean;
              default?: string | number | boolean | null;
              description?: string;
            }>;
            tags?: string[];
            flow_type?: string;
            kind?: string;
          };
        };
        return {
          ok: true as const,
          flowRef,
          tier,
          name: raw.name ?? slug,
          description: raw.description ?? "",
          requiresEndpoints: raw.metadata?.requires_endpoints ?? [],
          parameters: raw.metadata?.parameters ?? [],
          tags: raw.metadata?.tags ?? [],
          flowType: raw.metadata?.flow_type,
          kind: raw.metadata?.kind,
        };
      } catch (error) {
        return {
          ok: false as const,
          flowRef,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { ok: false as const, flowRef, error: `flow manifest not found for '${flowRef}'` };
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await registry.closeAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  await registry.closeAll();
  app.exit();
});
