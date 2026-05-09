import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { executeFlow, defaultResolveManifest } from "../src/executors/flow.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "echo-rote.mjs");
const manifestFixture = join(here, "fixtures", "flow-with-manifest.ts");
const fakeFlowPath = "/fake/.rote/flows/github/list/main.ts";
const resolveFakePath = () => fakeFlowPath;

describe("executeFlow", () => {
  it("spawns roteCmd with deno run argv (positionals from manifest), captures stdout, parses JSON into data", async () => {
    const env = await executeFlow({
      node: { id: "f1", type: "flow", flow: "github/list", params: { owner: "alice" } },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
      resolveFlowPath: resolveFakePath,
      resolveManifest: () => [{ name: "owner", required: true }],
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
      resolveManifest: () => [{ name: "who", required: true }],
    });
    const data = env.data as { argv: string[] };
    expect(data.argv).toContain("world");
  });

  it("substitutes {{input}} inside array/object param values, then JSON-encodes them", async () => {
    const env = await executeFlow({
      node: {
        id: "f1",
        type: "flow",
        flow: "x/y",
        params: { tags: ["{{input}}", "static"], cfg: { who: "{{input}}" } },
      },
      input: { text: "abc" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
      resolveFlowPath: resolveFakePath,
      resolveManifest: () => [
        { name: "tags", required: true },
        { name: "cfg", required: true },
      ],
    });
    const data = env.data as { argv: string[] };
    expect(data.argv.slice(-2)).toEqual([
      JSON.stringify(["abc", "static"]),
      JSON.stringify({ who: "abc" }),
    ]);
  });

  it("throws when flow has no @rote-frontmatter manifest (no legacy positional fallback)", async () => {
    await expect(
      executeFlow({
        node: { id: "f1", type: "flow", flow: "x/y", params: { stray: "v" } },
        input: { text: "" },
        roteCmd: "node",
        roteArgsPrefix: [fixture],
        resolveFlowPath: resolveFakePath,
        // simulate a flow without a parameters block
        resolveManifest: () => null,
      }),
    ).rejects.toThrow(/has no @rote-frontmatter parameters list/);
  });

  it("accepts a manifest declaring zero params (empty parameters: block)", async () => {
    const env = await executeFlow({
      node: { id: "f1", type: "flow", flow: "x/y", params: {} },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
      resolveFlowPath: resolveFakePath,
      resolveManifest: () => [],
    });
    const data = env.data as { argv: string[] };
    expect(data.argv).toEqual(["deno", "run", "--allow-all", fakeFlowPath]);
  });

  it("throws on non-zero exit, error includes stderr", async () => {
    // /usr/bin/false exits non-zero with no output — portable failure path
    await expect(
      executeFlow({
        node: { id: "f1", type: "flow", flow: "x/y", params: {} },
        input: { text: "" },
        roteCmd: "false",
        resolveFlowPath: resolveFakePath,
        resolveManifest: () => [],
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

  it("with manifest: emits positionals in declared order regardless of params key order", async () => {
    const env = await executeFlow({
      node: {
        id: "f1",
        type: "flow",
        flow: "telegram/send",
        // intentionally inverted insertion order
        params: { text: "hello", chat_id: "123" },
      },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
      resolveFlowPath: () => manifestFixture,
    });
    const data = env.data as { argv: string[] };
    expect(data.argv.slice(-2)).toEqual(["123", "hello"]);
  });

  it("with manifest: throws on unknown param key (e.g. stray 'notes')", async () => {
    await expect(
      executeFlow({
        node: {
          id: "f1",
          type: "flow",
          flow: "telegram/send",
          params: { chat_id: "123", notes: "annotation", text: "hi" },
        },
        input: { text: "" },
        roteCmd: "node",
        roteArgsPrefix: [fixture],
        resolveFlowPath: () => manifestFixture,
      }),
    ).rejects.toThrow(/unknown param 'notes'/);
  });

  it("with manifest: throws on missing required param", async () => {
    await expect(
      executeFlow({
        node: {
          id: "f1",
          type: "flow",
          flow: "telegram/send",
          params: { chat_id: "123" },
        },
        input: { text: "" },
        roteCmd: "node",
        roteArgsPrefix: [fixture],
        resolveFlowPath: () => manifestFixture,
      }),
    ).rejects.toThrow(/missing required param 'text'/);
  });

  it("defaultResolveManifest parses parameters list from frontmatter", () => {
    const params = defaultResolveManifest(manifestFixture);
    expect(params).toEqual([
      { name: "chat_id", required: true },
      { name: "text", required: true },
    ]);
  });

  it("defaultResolveManifest returns null when file is missing", () => {
    expect(defaultResolveManifest("/no/such/path/main.ts")).toBeNull();
  });
});
