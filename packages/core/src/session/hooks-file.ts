import { mkdir, readFile, writeFile, rename, unlink, stat } from "node:fs/promises";
import { join } from "node:path";

export const FLOWBUILD_MARKER = "flow-build-safe-shell@1";

const HOOK_REL_DIR = ".cursor";
const HOOK_REL_FILE = "hooks.json";
const BACKUP_REL_FILE = "hooks.json.flowbuild-bak";

type HooksJson = {
  $flowbuild?: { marker: string; installedAt: string };
  hooks?: unknown;
  [k: string]: unknown;
};

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<HooksJson | null> {
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as HooksJson;
  } catch {
    return null;
  }
}

function buildHooksContent(hookCommand: string): string {
  const body = {
    $flowbuild: {
      marker: FLOWBUILD_MARKER,
      installedAt: new Date().toISOString(),
    },
    hooks: {
      PreToolUse: [
        {
          matcher: "Shell",
          hooks: [{ type: "command", command: hookCommand, timeout: 5 }],
        },
      ],
    },
  };
  return JSON.stringify(body, null, 2);
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, target);
}

export type InstallHooksResult = {
  restored: () => Promise<void>;
};

/**
 * Install a `.cursor/hooks.json` file in `workspaceDir` that registers a
 * `PreToolUse` hook on matcher `Shell`, running `hookCommand`. The hook
 * is expected to print `{decision: "block", reason: "..."}` and exit 0.
 *
 * Behavior:
 * - If no hooks.json exists, write ours. `restored()` deletes ours.
 * - If a user's hooks.json exists, atomically rename it to
 *   `.flowbuild-bak`, write ours. `restored()` deletes ours and renames
 *   the backup back. Refuses if `.flowbuild-bak` already exists with a
 *   non-marker hooks.json present (real conflict; user must intervene).
 * - If our marker is already present, no-op. `restored()` is a no-op.
 * - Self-heals from prior-crash state: marker present + backup present
 *   means a previous install was orphaned. We restore the backup first,
 *   then re-install fresh.
 */
export async function installHooks(
  workspaceDir: string,
  hookCommand: string,
): Promise<InstallHooksResult> {
  const cursorDir = join(workspaceDir, HOOK_REL_DIR);
  const target = join(cursorDir, HOOK_REL_FILE);
  const backup = join(cursorDir, BACKUP_REL_FILE);
  await mkdir(cursorDir, { recursive: true });

  const current = await readJson(target);
  const isOurs = current?.$flowbuild?.marker === FLOWBUILD_MARKER;
  const backupExists = await exists(backup);

  // Case: marker matches AND backup exists → orphaned crash recovery.
  // Restore the backup over the marker file, then fall through to the
  // "user file exists" branch below.
  if (isOurs && backupExists) {
    await rename(backup, target);
  }

  // Re-read after potential restore.
  const after = await readJson(target);
  const afterIsOurs = after?.$flowbuild?.marker === FLOWBUILD_MARKER;

  if (afterIsOurs && !(await exists(backup))) {
    // Already installed cleanly. No-op install; no-op restore.
    return { restored: async () => {} };
  }

  // Now: target is either a user file, missing, or stale backup remains.
  if (await exists(backup) && !afterIsOurs) {
    // User file present + backup present, no marker → real conflict.
    throw new Error(
      `Cannot install flow-build hooks: ${backup} already exists from a prior session and ${target} is not ours. ` +
      `Resolve manually: review and delete ${backup} if it is stale.`,
    );
  }

  if (after) {
    // User file exists; back it up.
    await rename(target, backup);
  }

  await atomicWrite(target, buildHooksContent(hookCommand));

  let restoredCalled = false;
  return {
    restored: async () => {
      if (restoredCalled) return;
      restoredCalled = true;
      const live = await readJson(target);
      if (live?.$flowbuild?.marker === FLOWBUILD_MARKER) {
        await unlink(target).catch(() => {});
      }
      if (await exists(backup)) {
        // Only restore if target is now absent (we just removed ours) or
        // if user replaced ours with their own — leave their replacement
        // alone in that case.
        if (!(await exists(target))) {
          await rename(backup, target);
        } else {
          // User replaced our file mid-session AND we have a backup.
          // Drop the backup; user's current file wins.
          await unlink(backup).catch(() => {});
        }
      }
    },
  };
}
