import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { PluginHostError } from "../errors.js";

export type WrittenFile = {
  pluginName: string;
  absPath: string;
  backupPath?: string;
  createdDirs: string[];
};

const RULES_DIR = ".cursor" + sep + "rules";

export function writeRulesFile(args: {
  cwd: string;
  pluginName: string;
  relativePath: string;
  contents: string;
  runId: string;
}): WrittenFile | null {
  const { cwd, pluginName, relativePath, contents, runId } = args;

  if (isAbsolute(relativePath)) {
    throw new PluginHostError(
      `plugin "${pluginName}" rulesFile path must be relative: ${relativePath}`,
    );
  }

  const normalizedRel = normalize(relativePath);
  const absPath = resolve(cwd, normalizedRel);
  const cwdAbs = resolve(cwd);
  const rel = relative(cwdAbs, absPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PluginHostError(
      `plugin "${pluginName}" rulesFile path escapes cwd: ${relativePath}`,
    );
  }

  const parent = dirname(rel);
  if (parent !== RULES_DIR && !parent.startsWith(RULES_DIR + sep)) {
    throw new PluginHostError(
      `plugin "${pluginName}" rulesFile must live under .cursor/rules/: ${relativePath}`,
    );
  }

  if (existsSync(absPath)) {
    const existing = readFileSync(absPath);
    if (existing.equals(Buffer.from(contents))) {
      return null;
    }
  }

  const createdDirs: string[] = [];
  const dirAbs = dirname(absPath);
  const segments = relative(cwdAbs, dirAbs).split(sep).filter(Boolean);
  let walk = cwdAbs;
  for (const seg of segments) {
    walk = join(walk, seg);
    if (!existsSync(walk)) {
      mkdirSync(walk);
      createdDirs.push(walk);
    }
  }

  let backupPath: string | undefined;
  if (existsSync(absPath)) {
    backupPath = `${absPath}.flow-build-bak.${runId}`;
    renameSync(absPath, backupPath);
  }

  const tmp = `${absPath}.tmp.${runId}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, absPath);

  return { pluginName, absPath, ...(backupPath ? { backupPath } : {}), createdDirs };
}

export function restoreRulesFile(w: WrittenFile): void {
  if (existsSync(w.absPath)) {
    unlinkSync(w.absPath);
  }
  if (w.backupPath && existsSync(w.backupPath)) {
    renameSync(w.backupPath, w.absPath);
  }
  for (const d of [...w.createdDirs].reverse()) {
    try {
      rmdirSync(d);
    } catch {
      // dir not empty or already gone — leave alone
    }
  }
}
