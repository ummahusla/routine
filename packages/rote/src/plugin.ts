import type { HarnessEvent, Plugin, RuntimeContext, ToolCallSnapshot } from "@flow-build/core";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultExec } from "./default-exec.js";
import { runProbe } from "./probe.js";
import { renderRulesBody } from "./render/rules.js";
import { renderPrefix } from "./render/prefix.js";
import {
  classifyBypass,
  defaultBypassPatterns,
  extractCommand,
} from "./intercept/bypass-patterns.js";
import { buildHintEvent } from "./intercept/hint.js";
import type { RoteFacts, RotePluginOptions } from "./types.js";

const DEFAULT_RULES_PATH = ".cursor/rules/.flow-build-rote.mdc";
const DEFAULT_TIMEOUT_MS = 1500;
const STATE_FACTS_KEY = "rote";
const STATE_TOOL_ARGS_KEY = "rote:lastToolArgs";

function getRoteHome(): string {
  return process.env.ROTE_HOME ?? join(homedir(), ".rote");
}

function getFacts(ctx: RuntimeContext): RoteFacts {
  const slot = ctx.state.get(STATE_FACTS_KEY) as { facts?: RoteFacts } | undefined;
  return (
    slot?.facts ?? {
      version: null,
      adapters: null,
      pendingStubs: null,
      flowCount: null,
      activeWorkspace: null,
    }
  );
}

export function createRotePlugin(opts: RotePluginOptions = {}): Plugin {
  const bin = opts.bin ?? "rote";
  const probeTimeoutMs = opts.probeTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const enableProbe = opts.enableProbe ?? true;
  const enableHints = opts.enableHints ?? true;
  const rulesPath = opts.rulesFilePath ?? DEFAULT_RULES_PATH;
  const patterns = opts.hintBypassPatterns ?? defaultBypassPatterns;
  const exec = opts.exec ?? defaultExec;

  return {
    name: "rote",

    async preRun(ctx) {
      let facts: RoteFacts;
      if (!enableProbe) {
        facts = {
          version: null,
          adapters: null,
          pendingStubs: null,
          flowCount: null,
          activeWorkspace: null,
        };
      } else {
        try {
          facts = await runProbe({
            bin,
            cwd: ctx.cwd,
            roteHome: getRoteHome(),
            timeoutMs: probeTimeoutMs,
            exec,
          });
        } catch (cause) {
          ctx.logger.warn("rote probe threw unexpectedly", { cause: String(cause) });
          facts = {
            version: null,
            adapters: null,
            pendingStubs: null,
            flowCount: null,
            activeWorkspace: null,
          };
        }
      }
      if (facts.version === null) {
        ctx.logger.warn("rote binary not found", { bin });
      }
      ctx.state.set(STATE_FACTS_KEY, { facts });
      return { facts: facts as unknown as Record<string, unknown> };
    },

    async systemPrompt(ctx) {
      const facts = getFacts(ctx);
      const versionLabel = facts.version ?? "unknown";
      return {
        rulesFile: {
          relativePath: rulesPath,
          contents: renderRulesBody({ versionLabel }),
        },
      };
    },

    async promptPrefix(ctx) {
      const facts = getFacts(ctx);
      return renderPrefix(facts);
    },

    async onToolCall(call: ToolCallSnapshot, ctx) {
      if (!enableHints) return;
      if (call.args === undefined) return;
      const slot =
        (ctx.state.get(STATE_TOOL_ARGS_KEY) as Record<string, unknown> | undefined) ?? {};
      slot[call.callId] = call.args;
      ctx.state.set(STATE_TOOL_ARGS_KEY, slot);
    },

    interceptEvent(e: HarnessEvent, ctx) {
      if (!enableHints) return undefined;
      if (e.type !== "tool_end") return undefined;
      const slot = ctx.state.get(STATE_TOOL_ARGS_KEY) as
        | Record<string, unknown>
        | undefined;
      const argv = slot?.[e.callId];
      const cmd = extractCommand(argv);
      if (!cmd) return undefined;
      const m = classifyBypass(e.name, cmd, patterns);
      if (!m) return undefined;
      return [e, buildHintEvent(m)];
    },
  };
}
