import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { customAlphabet } from "nanoid";
import { EMPTY_STATE, type Manifest, ManifestSchema } from "./schema.js";

const idGen = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export type BootstrapArgs = {
  baseDir: string;
  sessionId: string;
  name: string;
  description?: string;
};

export function bootstrapFlowbuilderSession(args: BootstrapArgs): {
  manifest: Manifest;
  manifestPath: string;
  statePath: string;
} {
  const dir = join(args.baseDir, "sessions", args.sessionId);
  mkdirSync(dir, { recursive: true });

  const manifestPath = join(dir, "manifest.json");
  const statePath = join(dir, "state.json");

  let manifest: Manifest;
  if (existsSync(manifestPath)) {
    manifest = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  } else {
    const ts = new Date().toISOString();
    manifest = {
      schemaVersion: 1,
      id: `s_${idGen()}`,
      name: args.name,
      description: args.description ?? "",
      createdAt: ts,
      updatedAt: ts,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }

  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify(EMPTY_STATE, null, 2) + "\n");
  }

  return { manifest, manifestPath, statePath };
}
