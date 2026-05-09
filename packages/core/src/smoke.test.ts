import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "./test/fakeSdk.js";
import { createRotePlugin } from "@flow-build/rote";
import type { ExecResult } from "@flow-build/rote";
import type { HarnessEvent } from "./types.js";

const RUN_PATH = "./run.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flow-build-smoke-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@cursor/sdk");
});

describe("plugin layer + rote integration smoke", () => {
  it("materializes rules file, prefixes prompt, fans hint, cleans up", async () => {
    const rulesPath = join(dir, ".cursor/rules/.flow-build-rote.mdc");
    let rulesPresentDuringSend = false;

    const fa = makeFakeAgent({
      streamItems: [
        {
          type: "tool_call",
          call_id: "c1",
          name: "shell",
          status: "running",
          args: { command: "gh issue list" },
        },
        {
          type: "tool_call",
          call_id: "c1",
          name: "shell",
          status: "completed",
          args: { command: "gh issue list" },
        },
        { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
      ],
      waitResult: { status: "completed" },
    });

    const fake = installFakeSdk({
      createBehavior: [{ agent: fa }],
      sendBehavior: {
        before: () => {
          rulesPresentDuringSend = existsSync(rulesPath);
        },
      },
    });

    const fakeExec = async (
      _cmd: string,
      args: string[],
    ): Promise<ExecResult> => {
      const key = args.join(" ");
      if (key === "--version") {
        return { stdout: "rote 0.99.0\n", stderr: "", exitCode: 0, timedOut: false };
      }
      if (key === "machine inventory --json") {
        return {
          stdout: JSON.stringify({
            adapters: [
              { id: "github-api", fingerprint: "f1", toolsetCount: 5 },
              { id: "stripe", fingerprint: "f2", toolsetCount: 3 },
            ],
          }),
          stderr: "",
          exitCode: 0,
          timedOut: false,
        };
      }
      if (key === "flow pending list --json") {
        return {
          stdout: JSON.stringify([
            { workspace: "demo", name: "list-issues", adapter: "github-api" },
          ]),
          stderr: "",
          exitCode: 0,
          timedOut: false,
        };
      }
      if (key === "flow list --json") {
        return { stdout: "[]", stderr: "", exitCode: 0, timedOut: false };
      }
      return { stdout: "", stderr: "no", exitCode: 1, timedOut: false };
    };

    const plugin = createRotePlugin({ exec: fakeExec });

    const events: HarnessEvent[] = [];
    const { runPrompt } = await import(RUN_PATH);
    const result = await runPrompt({
      prompt: "summarize",
      cwd: dir,
      onEvent: (e: HarnessEvent) => events.push(e),
      plugins: [plugin],
    });

    expect(result.status).toBe("completed");

    expect(rulesPresentDuringSend).toBe(true);
    expect(existsSync(rulesPath)).toBe(false);

    const sentPrompt = fake.lastSendPrompt();
    expect(sentPrompt).toBeDefined();
    expect(sentPrompt!).toContain("[rote runtime");
    expect(sentPrompt!).toContain("0.99.0");
    expect(sentPrompt!).toContain("github-api");
    // runPrompt now layers Session.send under the hood, which prefixes the
    // user turn with "User: " for replay disambiguation. Assert the
    // structural <plugin prefix>\n\nUser: <prompt> shape rather than the
    // legacy raw-prompt suffix.
    expect(sentPrompt!).toContain("\n\nUser: summarize");

    const textEvents = events.filter(
      (e): e is Extract<HarnessEvent, { type: "text" }> => e.type === "text",
    );
    const allText = textEvents.map((e) => e.delta).join("");
    expect(allText).toContain("[rote hint]");
    expect(allText).toContain("GitHub CLI detected");

    const createConfig = fake.lastCreateConfig() as {
      local?: { settingSources?: string[] };
    };
    expect(createConfig.local?.settingSources).toEqual(["project", "user"]);
  });

  it("completes cleanly when rote is missing — install hint in prefix", async () => {
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
      ],
      waitResult: { status: "completed" },
    });

    const fake = installFakeSdk({ createBehavior: [{ agent: fa }] });

    const plugin = createRotePlugin({
      exec: async (): Promise<ExecResult> => ({
        stdout: "",
        stderr: "not found",
        exitCode: 127,
        timedOut: false,
      }),
    });

    const events: HarnessEvent[] = [];
    const { runPrompt } = await import(RUN_PATH);
    const result = await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: (e: HarnessEvent) => events.push(e),
      plugins: [plugin],
    });

    expect(result.status).toBe("completed");
    expect(fake.lastSendPrompt()!).toContain("rote unavailable");
  });
});
