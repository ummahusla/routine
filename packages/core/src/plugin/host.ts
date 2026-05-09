import { PluginHostError } from "../errors.js";
import { writeRulesFile, restoreRulesFile, type WrittenFile } from "./rules-writer.js";
import type {
  HarnessEvent,
  Plugin,
  RuntimeContext,
  ToolCallSnapshot,
} from "../types.js";

export class PluginHost {
  private readonly plugins: Plugin[];
  private written: WrittenFile[] = [];

  constructor(plugins: Plugin[]) {
    const seen = new Set<string>();
    for (const p of plugins) {
      if (!p.name || p.name.trim() === "") {
        throw new PluginHostError("plugin name must be a non-empty string");
      }
      if (seen.has(p.name)) {
        throw new PluginHostError(`duplicate plugin name: ${p.name}`);
      }
      seen.add(p.name);
    }
    this.plugins = plugins;
  }

  async runPreRun(ctx: RuntimeContext): Promise<void> {
    await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.preRun) return;
        let out;
        try {
          out = await p.preRun(ctx);
        } catch (cause) {
          throw new PluginHostError(`plugin "${p.name}" preRun failed`, { cause });
        }
        const facts = (out && out.facts) ?? {};
        ctx.state.set(p.name, { facts });
      }),
    );
  }

  async runSystemPrompt(ctx: RuntimeContext): Promise<void> {
    const results = await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.systemPrompt) return null;
        let contrib;
        try {
          contrib = await p.systemPrompt(ctx);
        } catch (cause) {
          throw new PluginHostError(`plugin "${p.name}" systemPrompt failed`, { cause });
        }
        if (!contrib) return null;
        try {
          return writeRulesFile({
            cwd: ctx.cwd,
            pluginName: p.name,
            relativePath: contrib.rulesFile.relativePath,
            contents: contrib.rulesFile.contents,
            runId: ctx.runId,
          });
        } catch (cause) {
          throw new PluginHostError(
            `plugin "${p.name}" rules file write failed`,
            { cause },
          );
        }
      }),
    );
    for (const r of results) {
      if (r) this.written.push(r);
    }
  }

  async runPromptPrefix(ctx: RuntimeContext): Promise<string> {
    const parts = await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.promptPrefix) return undefined;
        try {
          const out = await p.promptPrefix(ctx);
          return typeof out === "string" && out.length > 0 ? out : undefined;
        } catch (cause) {
          throw new PluginHostError(`plugin "${p.name}" promptPrefix failed`, { cause });
        }
      }),
    );
    return parts.filter((p): p is string => typeof p === "string").join("\n\n");
  }

  async runProvideMcpServers(
    ctx: RuntimeContext,
  ): Promise<Record<string, import("../types.js").McpServerConfig>> {
    const results = await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.provideMcpServers) return null;
        try {
          return { name: p.name, config: await p.provideMcpServers(ctx) };
        } catch (cause) {
          throw new PluginHostError(
            `plugin "${p.name}" provideMcpServers failed`,
            { cause },
          );
        }
      }),
    );
    const merged: Record<string, import("../types.js").McpServerConfig> = {};
    for (const r of results) {
      if (!r) continue;
      for (const [name, cfg] of Object.entries(r.config)) {
        if (name in merged) {
          ctx.logger.warn("mcp server name collision; later contribution wins", {
            name,
            from: r.name,
          });
        }
        merged[name] = cfg;
      }
    }
    return merged;
  }

  intercept(e: HarnessEvent, ctx: RuntimeContext): HarnessEvent[] {
    let stream: HarnessEvent[] = [e];
    for (const p of this.plugins) {
      if (!p.interceptEvent) continue;
      const next: HarnessEvent[] = [];
      for (const evt of stream) {
        try {
          const out = p.interceptEvent(evt, ctx);
          if (out === undefined) {
            next.push(evt);
          } else {
            next.push(...out);
          }
        } catch (cause) {
          ctx.logger.warn(`plugin "${p.name}" interceptEvent threw`, {
            cause: String(cause),
          });
          next.push(evt);
        }
      }
      stream = next;
    }
    return stream;
  }

  fireToolCall(call: ToolCallSnapshot, ctx: RuntimeContext): void {
    for (const p of this.plugins) {
      if (!p.onToolCall) continue;
      p.onToolCall(call, ctx).catch((cause) => {
        ctx.logger.warn(`plugin "${p.name}" onToolCall threw`, {
          cause: String(cause),
        });
      });
    }
  }

  async cleanup(ctx: RuntimeContext): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const p = this.plugins[i];
      if (!p?.cleanup) continue;
      try {
        await p.cleanup(ctx);
      } catch (cause) {
        ctx.logger.warn(`plugin "${p.name}" cleanup threw`, {
          cause: String(cause),
        });
      }
    }
    while (this.written.length > 0) {
      const w = this.written.pop()!;
      try {
        restoreRulesFile(w);
      } catch (cause) {
        ctx.logger.warn(`rules-file restore failed for plugin "${w.pluginName}"`, {
          cause: String(cause),
        });
      }
    }
  }
}
