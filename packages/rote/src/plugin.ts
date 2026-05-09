import type { Plugin } from "@flow-build/core";
import type { RotePluginOptions } from "./types.js";

export function createRotePlugin(_opts: RotePluginOptions = {}): Plugin {
  return { name: "rote" };
}
