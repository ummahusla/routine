import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installHooks, FLOWBUILD_MARKER } from "./hooks-file.js";

const HOOK_CMD = "/bin/sh /tmp/fake-deny.sh";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "flowbuild-hooks-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

describe("installHooks", () => {
  it("creates hooks.json in a fresh workspace and restored() removes it", async () => {
    const { restored } = await installHooks(workDir, HOOK_CMD);
    const target = join(workDir, ".cursor", "hooks.json");
    expect(await exists(target)).toBe(true);
    const parsed = JSON.parse(await readFile(target, "utf8"));
    expect(parsed.$flowbuild.marker).toBe(FLOWBUILD_MARKER);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe("Shell");
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe(HOOK_CMD);
    await restored();
    expect(await exists(target)).toBe(false);
  });

  it("backs up an existing user hooks.json and restores it on close", async () => {
    const cursorDir = join(workDir, ".cursor");
    await mkdir(cursorDir, { recursive: true });
    const target = join(cursorDir, "hooks.json");
    const userContent = '{"hooks":{"UserPromptSubmit":[{"matcher":"*","hooks":[]}]}}';
    await writeFile(target, userContent);

    const { restored } = await installHooks(workDir, HOOK_CMD);
    const installed = JSON.parse(await readFile(target, "utf8"));
    expect(installed.$flowbuild.marker).toBe(FLOWBUILD_MARKER);
    expect(await exists(join(cursorDir, "hooks.json.flowbuild-bak"))).toBe(true);

    await restored();
    expect(await readFile(target, "utf8")).toBe(userContent);
    expect(await exists(join(cursorDir, "hooks.json.flowbuild-bak"))).toBe(false);
  });

  it("no-ops when marker already matches (already-installed)", async () => {
    await installHooks(workDir, HOOK_CMD);
    const before = await readFile(join(workDir, ".cursor", "hooks.json"), "utf8");
    const second = await installHooks(workDir, HOOK_CMD);
    const after = await readFile(join(workDir, ".cursor", "hooks.json"), "utf8");
    expect(after).toBe(before);
    await second.restored();
    // first install's restored() was lost; file should still be ours since
    // the second restored() was a no-op. Acceptable: caller should track
    // the FIRST handle. We just assert the second restored() didn't break.
    expect(await exists(join(workDir, ".cursor", "hooks.json"))).toBe(true);
  });

  it("errors when a stale .flowbuild-bak exists from a previous crash with NO live marker", async () => {
    const cursorDir = join(workDir, ".cursor");
    await mkdir(cursorDir, { recursive: true });
    await writeFile(join(cursorDir, "hooks.json"), '{"hooks":{"PreToolUse":[]}}');
    await writeFile(join(cursorDir, "hooks.json.flowbuild-bak"), '{"old":true}');
    await expect(installHooks(workDir, HOOK_CMD)).rejects.toThrow(/flowbuild-bak/);
  });

  it("self-heals when marker is present AND .flowbuild-bak is present (orphaned)", async () => {
    // Simulate: prior install, process crashed, marker file + backup left over.
    await installHooks(workDir, HOOK_CMD);
    // Manually plant a stale backup with the user's prior content.
    await writeFile(join(workDir, ".cursor", "hooks.json.flowbuild-bak"), '{"user":"prior"}');

    const { restored } = await installHooks(workDir, HOOK_CMD);
    // Marker file still ours (re-installed atop the recovered backup):
    const installed = JSON.parse(await readFile(join(workDir, ".cursor", "hooks.json"), "utf8"));
    expect(installed.$flowbuild.marker).toBe(FLOWBUILD_MARKER);

    await restored();
    // Restored content is the user's prior file, not the marker file.
    expect(await readFile(join(workDir, ".cursor", "hooks.json"), "utf8")).toBe('{"user":"prior"}');
  });

  it("restored() does nothing if the marker file has been replaced by the user mid-session", async () => {
    const { restored } = await installHooks(workDir, HOOK_CMD);
    const target = join(workDir, ".cursor", "hooks.json");
    const userOverride = '{"hooks":{"PreToolUse":[]},"$user":true}';
    await writeFile(target, userOverride);
    await restored();
    expect(await readFile(target, "utf8")).toBe(userOverride);
  });
});
