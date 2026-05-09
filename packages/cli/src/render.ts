import type { HarnessEvent } from "@flow-build/core";
import pc from "picocolors";

type WriteStream = { write: (s: string) => unknown };

type Colors = Pick<typeof pc, "cyan" | "dim" | "green" | "red">;

export type RenderOpts = {
  stdout: WriteStream;
  stderr: WriteStream;
  color: boolean;
};

const passthrough = (s: string | number | null | undefined): string => String(s);

const noColor: Colors = {
  cyan: passthrough,
  dim: passthrough,
  green: passthrough,
  red: passthrough,
};

export function makeRenderer(opts: RenderOpts): (e: HarnessEvent) => void {
  const colorize: Colors = opts.color ? pc.createColors(true) : noColor;

  return function render(e: HarnessEvent): void {
    switch (e.type) {
      case "text":
        opts.stdout.write(e.delta);
        return;
      case "thinking":
        opts.stdout.write(colorize.dim(e.delta));
        return;
      case "tool_start":
        opts.stdout.write("\n" + colorize.cyan(`[tool: ${e.name}]`) + "\n");
        return;
      case "tool_end": {
        const mark = e.ok ? colorize.green("✓") : colorize.red("✗");
        opts.stdout.write(colorize.cyan(`[tool: ${e.name} ${mark}]`) + "\n");
        return;
      }
      case "status":
        opts.stderr.write(`[${e.phase}]\n`);
        return;
    }
  };
}
