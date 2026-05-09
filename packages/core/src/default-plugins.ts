import { createRotePlugin, type RotePluginOptions } from "@flow-build/rote";
import { createFlowbuilderPlugin } from "@flow-build/flowbuilder";
import type { Plugin } from "./types.js";

export type DefaultPluginsOptions = {
  baseDir: string;
  sessionId: string;
  rote?: RotePluginOptions;
};

export function defaultPlugins(opts: DefaultPluginsOptions): Plugin[] {
  return [
    createRotePlugin(opts.rote ?? {}),
    createFlowbuilderPlugin({ baseDir: opts.baseDir, sessionId: opts.sessionId }),
  ];
}
