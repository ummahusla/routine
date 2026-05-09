import { app, shell, BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import {
  createSession,
  listSessions,
  loadSession,
  deleteSession,
  type Session,
} from "@flow-build/core";
import icon from "../../resources/icon.png?asset";
import { SessionRegistry } from "./registry.js";
import { registerSessionIpc } from "./ipc/session.js";

function loadLocalEnv(): void {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

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
  return join(app.getPath("userData"), "flow-build");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

loadLocalEnv();
configureCursorRipgrepPath();

const registry = new SessionRegistry<Session>({
  openSession: (sessionId) => loadSession({ baseDir: getBaseDir(), sessionId }),
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
    createSession: (opts) => createSession(opts),
    listSessions: (opts) => listSessions(opts),
    deleteSession: (opts) => deleteSession(opts),
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
