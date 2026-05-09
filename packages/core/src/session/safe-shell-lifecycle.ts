import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startSafeShellMcpServer, type SafeShellMcpHandle } from "@flow-build/safe-shell-mcp";
import { installHooks } from "./hooks-file.js";

export type SafeShellMcpEntry = { type: "http"; url: string };

export type StartSafeShellOptions = {
  workspaceDir: string;
  logger: { warn(msg: string, meta?: Record<string, unknown>): void };
};

export type SafeShellSessionHandle = {
  mcpEntry: SafeShellMcpEntry;
  dispose: () => Promise<void>;
};

/**
 * Resolve the absolute path to the deny-shell-hook.sh script shipped
 * inside the @flow-build/safe-shell-mcp package. Resolved at runtime so
 * the path works in both src (workspace dev) and dist (packaged) layouts.
 *
 * Uses `require.resolve(".../package.json")` because the package's
 * `exports` only declares the ESM `import` condition, which makes
 * `require.resolve` on the bare specifier fail with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. The `package.json` subpath is
 * always exposed and gives us a stable anchor at the package root.
 */
function resolveDenyHookScript(): string {
  const req = createRequire(fileURLToPath(import.meta.url));
  const pkgJsonPath = req.resolve("@flow-build/safe-shell-mcp/package.json");
  const pkgRoot = dirname(pkgJsonPath);
  return join(pkgRoot, "scripts", "deny-shell-hook.sh");
}

export async function startSafeShellForSession(
  opts: StartSafeShellOptions,
): Promise<SafeShellSessionHandle> {
  const handle: SafeShellMcpHandle = await startSafeShellMcpServer({
    defaultCwd: opts.workspaceDir,
  });
  let installed: { restored: () => Promise<void> } | undefined;
  try {
    const scriptPath = resolveDenyHookScript();
    const hookCommand = `/bin/sh ${scriptPath}`;
    installed = await installHooks(opts.workspaceDir, hookCommand);
  } catch (e) {
    await handle.close();
    throw e;
  }

  return {
    mcpEntry: { type: "http", url: handle.url },
    dispose: async () => {
      try {
        await installed!.restored();
      } catch (e) {
        opts.logger.warn("safe-shell hooks restore failed", { cause: String(e) });
      }
      try {
        await handle.close();
      } catch (e) {
        opts.logger.warn("safe-shell mcp close failed", { cause: String(e) });
      }
    },
  };
}
