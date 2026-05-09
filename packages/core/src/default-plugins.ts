import { createRotePlugin, type RotePluginOptions } from "@flow-build/rote";
import {
  createFlowbuilderPlugin,
  type RunStarter,
  type RunResultReader,
  type RunWaiter,
} from "@flow-build/flowbuilder";
import type { Plugin } from "./types.js";

export type DefaultPluginsOptions = {
  baseDir: string;
  sessionId: string;
  rote?: RotePluginOptions;
  runStarter?: RunStarter;
  runResultReader?: RunResultReader;
  waitForRunEnd?: RunWaiter;
};

export function defaultPlugins(opts: DefaultPluginsOptions): Plugin[] {
  return [
    createRotePlugin(opts.rote ?? {}),
    createFlowbuilderPlugin({
      baseDir: opts.baseDir,
      sessionId: opts.sessionId,
      ...(opts.runStarter ? { runStarter: opts.runStarter } : {}),
      ...(opts.runResultReader ? { runResultReader: opts.runResultReader } : {}),
      ...(opts.waitForRunEnd ? { waitForRunEnd: opts.waitForRunEnd } : {}),
    }),
  ];
}
