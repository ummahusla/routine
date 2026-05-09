import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startSafeShellForSession } from "./safe-shell-lifecycle.js";

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "flowbuild-ssl-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("startSafeShellForSession", () => {
  it("starts an HTTP MCP server and installs hooks; dispose tears both down", async () => {
    const { mcpEntry, dispose } = await startSafeShellForSession({
      workspaceDir: workDir,
      logger: { warn: () => {} },
    });
    try {
      expect(mcpEntry.type).toBe("http");
      expect(mcpEntry.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      expect(await exists(join(workDir, ".cursor", "hooks.json"))).toBe(true);
      const parsed = JSON.parse(
        await readFile(join(workDir, ".cursor", "hooks.json"), "utf8"),
      );
      expect(parsed.hooks.PreToolUse[0].matcher).toBe("Shell");
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toMatch(/deny-shell-hook\.sh$/);
    } finally {
      await dispose();
    }
    expect(await exists(join(workDir, ".cursor", "hooks.json"))).toBe(false);
  });
});
