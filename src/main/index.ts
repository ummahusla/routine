import { app, shell, BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

type CursorChatRequest = {
  requestId: string;
  prompt: string;
};

type CursorChatResult =
  | {
      ok: true;
      status: string;
    }
  | {
      ok: false;
      error: string;
    };

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
  if (existsSync(rgPath)) {
    process.env.CURSOR_RIPGREP_PATH = rgPath;
  }
}

function extractAssistantText(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const maybeEvent = event as {
    type?: string;
    message?: {
      content?: Array<{ type?: string; text?: string }>;
    };
  };

  if (maybeEvent.type !== "assistant") return "";
  return (
    maybeEvent.message?.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("") ?? ""
  );
}

ipcMain.handle("cursor-chat:send", async (event, { requestId, prompt }: CursorChatRequest): Promise<CursorChatResult> => {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "CURSOR_API_KEY is missing. Add it to .env.local or the app environment." };
  }

  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: "composer-2" },
      local: { cwd: process.cwd() },
    });

    const run = await agent.send(prompt);

    if (run.supports("stream")) {
      for await (const streamEvent of run.stream()) {
        const text = extractAssistantText(streamEvent);
        if (text) {
          event.sender.send("cursor-chat:event", { requestId, type: "text", text });
        }
      }
    }

    const result = await run.wait();
    event.sender.send("cursor-chat:event", { requestId, type: "done", status: result.status });
    return { ok: true, status: result.status };
  } catch (error) {
    const message =
      error instanceof CursorAgentError
        ? `${error.message}${error.isRetryable ? " (retryable)" : ""}`
        : error instanceof Error
          ? error.message
          : "Unknown Cursor SDK error";
    event.sender.send("cursor-chat:event", { requestId, type: "error", error: message });
    return { ok: false, error: message };
  } finally {
    await agent?.[Symbol.asyncDispose]();
  }
});

loadLocalEnv();
configureCursorRipgrepPath();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.flowbuild");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
