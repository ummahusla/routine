import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  runPrompt,
  AuthError,
  ConfigError,
  NetworkError,
  HarnessError,
} from "@flow-build/core";
import type { Logger } from "@flow-build/core";
import { makeRenderer } from "./render.js";

type CliDeps = {
  argv: string[];
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  isTTY: boolean;
  signal: AbortSignal;
  exit: (code: number) => never;
};

export async function runCli(deps: CliDeps): Promise<void> {
  const program = new Command();
  program
    .name("flow-build")
    .description("Cursor SDK harness — CLI")
    .exitOverride();

  program
    .command("run")
    .argument("<prompt>", "prompt to send to the agent")
    .option("--cwd <path>", "working directory", process.cwd())
    .option("--model <id>", "model id", "composer-2")
    .option("--max-retries <n>", "max retry attempts", (v) => parseInt(v, 10), 3)
    .option("--no-retry", "disable retries (sets attempts=1)")
    .option("--verbose", "enable debug logs", false)
    .action(async (prompt: string, opts: RunCmdOpts) => {
      await executeRun(prompt, opts, deps);
    });

  try {
    await program.parseAsync(deps.argv);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") return;
    if (typeof err.code === "string" && err.code.startsWith("commander.")) {
      deps.stderr.write(`error: ${err.message ?? String(e)}\n`);
      deps.exit(1);
      return;
    }
    throw e;
  }
}

type RunCmdOpts = {
  cwd: string;
  model: string;
  maxRetries: number;
  retry: boolean;
  verbose: boolean;
};

async function executeRun(
  prompt: string,
  opts: RunCmdOpts,
  deps: CliDeps,
): Promise<void> {
  const render = makeRenderer({
    stdout: deps.stdout,
    stderr: deps.stderr,
    color: deps.isTTY,
  });

  const logger: Logger = opts.verbose
    ? {
        warn: (msg, ctx) => {
          deps.stderr.write(`[warn] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}\n`);
        },
        debug: (msg, ctx) => {
          deps.stderr.write(`[debug] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}\n`);
        },
      }
    : {
        warn: (msg, ctx) => {
          deps.stderr.write(`[warn] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}\n`);
        },
      };

  const attempts = opts.retry ? opts.maxRetries : 1;

  let result;
  try {
    result = await runPrompt({
      prompt,
      cwd: opts.cwd,
      model: opts.model,
      signal: deps.signal,
      onEvent: render,
      logger,
      retry: { attempts },
    });
  } catch (e) {
    deps.stderr.write(`\nerror: ${(e as Error).message}\n`);
    if (opts.verbose && (e as { cause?: unknown }).cause) {
      deps.stderr.write(`cause: ${String((e as { cause?: unknown }).cause)}\n`);
    }
    if (e instanceof AuthError) deps.exit(2);
    if (e instanceof ConfigError) deps.exit(2);
    if (e instanceof NetworkError) deps.exit(3);
    if (e instanceof HarnessError) deps.exit(1);
    deps.exit(1);
    return;
  }

  if (result.status === "completed") deps.exit(0);
  if (result.status === "cancelled") deps.exit(130);
  deps.exit(1);
}

const isMainModule =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  runCli({
    argv: process.argv,
    stdout: process.stdout,
    stderr: process.stderr,
    isTTY: process.stdout.isTTY ?? false,
    signal: controller.signal,
    exit: process.exit,
  });
}
