import type { Plugin, RuntimeContext } from "@flow-build/core";
import type { McpServerConfig } from "@flow-build/core";
import { SessionManager, type LoadedSession } from "./session.js";
import { renderFlowbuilderPrefix } from "./prompt.js";
import { FLOWBUILDER_RULES_PATH, renderFlowbuilderRules } from "./rules.js";
import {
  startFlowbuilderMcpServer,
  type FlowbuilderMcpHandle,
  type RunStarter,
  type RunResultReader,
  type RunWaiter,
} from "./mcp-server.js";

export type FlowbuilderPluginOptions = {
  baseDir: string;
  sessionId: string;
  runStarter?: RunStarter;
  runResultReader?: RunResultReader;
  waitForRunEnd?: RunWaiter;
};

type StashedState = {
  session: SessionManager;
  loaded: LoadedSession;
  handle: FlowbuilderMcpHandle;
};

const STATE_KEY = "flowbuilder:internal";

export function createFlowbuilderPlugin(opts: FlowbuilderPluginOptions): Plugin {
  if (!opts.baseDir || !opts.sessionId) {
    throw new Error("createFlowbuilderPlugin: baseDir and sessionId are required");
  }
  const { baseDir, sessionId } = opts;

  return {
    name: "flowbuilder",

    async preRun(ctx: RuntimeContext) {
      const session = new SessionManager({
        baseDir,
        sessionId,
        runId: ctx.runId,
      });
      const loaded = session.load();
      const handle = await startFlowbuilderMcpServer({
        session,
        runStarter: opts.runStarter ?? (async () => { throw new Error("execute_flow not available in this context"); }),
        runResultReader: opts.runResultReader ?? (async () => { throw new Error("get_run_result not available"); }),
        waitForRunEnd: opts.waitForRunEnd ?? (async () => {}),
      });
      const stash: StashedState = { session, loaded, handle };
      ctx.state.set(STATE_KEY, stash);
    },

    async systemPrompt() {
      return {
        rulesFile: {
          relativePath: FLOWBUILDER_RULES_PATH,
          contents: renderFlowbuilderRules(),
        },
      };
    },

    async promptPrefix(ctx: RuntimeContext) {
      const stash = ctx.state.get(STATE_KEY) as StashedState | undefined;
      if (!stash) return undefined;
      return renderFlowbuilderPrefix({
        manifest: stash.loaded.manifest,
        state: stash.loaded.state,
      });
    },

    async provideMcpServers(ctx: RuntimeContext): Promise<Record<string, McpServerConfig>> {
      const stash = ctx.state.get(STATE_KEY) as StashedState | undefined;
      if (!stash) {
        throw new Error("flowbuilder: provideMcpServers called before preRun");
      }
      return {
        flowbuilder: { type: "http", url: stash.handle.url },
      };
    },

    async cleanup(ctx: RuntimeContext) {
      const stash = ctx.state.get(STATE_KEY) as StashedState | undefined;
      if (!stash) return;
      await stash.handle.close();
    },
  };
}
