import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { executeFlow } from "../src/executors/flow.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "echo-rote.mjs");
const fakeFlowPath = "/fake/.rote/flows/github/list/main.ts";
const resolveFakePath = () => fakeFlowPath;

describe("executeFlow", () => {
  it("spawns roteCmd with deno run argv (positionals from params), captures stdout, parses JSON into data", async () => {
    const env = await executeFlow({
      node: { id: "f1", type: "flow", flow: "github/list", params: { owner: "alice" } },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
      resolveFlowPath: resolveFakePath,
    });
    expect(env.text).toContain('"argv"');
    const data = env.data as { argv: string[] };
    expect(data.argv).toEqual(["deno", "run", "--allow-all", fakeFlowPath, "alice"]);
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
      resolveFlowPath: resolveFakePath,
    });
    const data = env.data as { argv: string[] };
    expect(data.argv).toContain("world");
  });

  it("preserves param insertion order as positionals", async () => {
    const env = await executeFlow({
      node: {
        id: "f1",
        type: "flow",
        flow: "x/y",
        params: { limit: "25", offset: "", active: "true" },
      },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
      resolveFlowPath: resolveFakePath,
    });
    const data = env.data as { argv: string[] };
    expect(data.argv).toEqual([
      "deno", "run", "--allow-all", fakeFlowPath, "25", "", "true",
    ]);
  });

  it("throws on non-zero exit, error includes stderr", async () => {
    // /usr/bin/false exits non-zero with no output — portable failure path
    await expect(
      executeFlow({
        node: { id: "f1", type: "flow", flow: "x/y", params: {} },
        input: { text: "" },
        roteCmd: "false",
        resolveFlowPath: resolveFakePath,
      }),
    ).rejects.toThrow(/exit/);
  });

  it("throws when flow path cannot be resolved", async () => {
    await expect(
      executeFlow({
        node: { id: "f1", type: "flow", flow: "no/such", params: {} },
        input: { text: "" },
        roteCmd: "node",
        roteArgsPrefix: [fixture],
        resolveFlowPath: () => {
          throw new Error("flow not found: no/such");
        },
      }),
    ).rejects.toThrow(/flow not found/);
  });
});
