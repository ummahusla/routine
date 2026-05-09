import { describe, it, expect } from "vitest";
import { buildReplay } from "./replay.js";
import type { PersistedTurn } from "./types.js";

describe("buildReplay", () => {
  it("returns empty string for no completed turns", () => {
    expect(buildReplay([])).toBe("");
  });

  it("excludes in-flight turns (status running/interrupted with no turn_end)", () => {
    const turns: PersistedTurn[] = [
      {
        turnId: "T1",
        user: { text: "hi", ts: "t" },
        assistant: { textBlocks: ["ok"], toolCalls: [] },
        status: "interrupted",
      },
    ];
    expect(buildReplay(turns)).toBe("");
  });

  it("renders a completed turn with text + verbatim tool args/result", () => {
    const turns: PersistedTurn[] = [
      {
        turnId: "T1",
        user: { text: "list files", ts: "t" },
        assistant: {
          textBlocks: ["Here you go."],
          toolCalls: [
            {
              callId: "c1",
              name: "shell",
              args: { command: "ls" },
              ok: true,
              result: "a\nb\n",
            },
          ],
        },
        status: "completed",
      },
    ];
    const out = buildReplay(turns);
    expect(out).toContain("User: list files");
    expect(out).toContain("Assistant:");
    expect(out).toContain("[tool_call: shell");
    expect(out).toContain('"command":"ls"');
    expect(out).toContain('"a\\nb\\n"');
    expect(out).toContain("Here you go.");
  });

  it("appends [turn ended: cancelled] marker for cancelled turns", () => {
    const turns: PersistedTurn[] = [
      {
        turnId: "T1",
        user: { text: "hi", ts: "t" },
        assistant: { textBlocks: ["partial"], toolCalls: [] },
        status: "cancelled",
      },
    ];
    expect(buildReplay(turns)).toContain("[turn ended: cancelled]");
  });

  it("renders multiple turns separated by blank lines", () => {
    const t = (id: string, text: string): PersistedTurn => ({
      turnId: id,
      user: { text, ts: "t" },
      assistant: { textBlocks: ["ok"], toolCalls: [] },
      status: "completed",
    });
    const out = buildReplay([t("T1", "first"), t("T2", "second")]);
    expect(out).toMatch(/User: first[\s\S]+User: second/);
  });
});
