import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";

export type ActiveWorkspace = { name: string; path: string };

export function inferActiveWorkspace(opts: {
  cwd: string;
  roteHome: string;
}): ActiveWorkspace | null {
  const cwdAbs = resolve(opts.cwd);
  const homeAbs = resolve(opts.roteHome);
  const wsRoot = resolve(homeAbs, "workspaces") + sep;

  if ((cwdAbs + sep).startsWith(wsRoot)) {
    const tail = cwdAbs.slice(wsRoot.length);
    const name = tail.split(sep)[0];
    if (name) {
      return { name, path: resolve(wsRoot, name) };
    }
  }

  let walk = cwdAbs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const marker = resolve(walk, ".rote", "state.json");
    if (existsSync(marker)) {
      try {
        if (statSync(marker).isFile()) {
          return { name: basename(walk), path: walk };
        }
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(walk);
    if (parent === walk) break;
    walk = parent;
  }
  return null;
}
