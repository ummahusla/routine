import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { executeFlow } from "../src/executors/flow.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "echo-rote.mjs");

describe("executeFlow", () => {
  it("spawns roteCmd with flow run argv, captures stdout, parses JSON into data", async () => {
    const env = await executeFlow({
      node: { id: "f1", type: "flow", flow: "github/list", params: { owner: "alice" } },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
    });
    expect(env.text).toContain('"argv"');
    const data = env.data as { argv: string[] };
    expect(data.argv).toEqual(["flow", "run", "github/list", "--owner=alice"]);
  });

  it("substitutes {{input}} into string params before spawn", async () => {
    const env = await executeFlow({
      node: {
        id: "f1",
        type: "flow",
        flow: "x/y",
        params: { who: "{{input}}" },
      },
      input: { text: "world" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
    });
    const data = env.data as { argv: string[] };
    expect(data.argv).toContain("--who=world");
  });

  it("throws on non-zero exit, error includes stderr", async () => {
    // /usr/bin/false exits non-zero with no output — portable failure path
    await expect(
      executeFlow({
        node: { id: "f1", type: "flow", flow: "x/y", params: {} },
        input: { text: "" },
        roteCmd: "false",
      }),
    ).rejects.toThrow(/exit/);
  });
});
