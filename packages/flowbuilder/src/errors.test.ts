import { describe, it, expect } from "vitest";
import {
  FlowbuilderError,
  FlowbuilderSessionMissingError,
  FlowbuilderSchemaError,
  FlowbuilderRefIntegrityError,
  FlowbuilderIOError,
  FlowbuilderUnsupportedVersion,
  FlowbuilderMcpStartError,
} from "./errors.js";

describe("FlowbuilderError hierarchy", () => {
  it("all subclass FlowbuilderError", () => {
    const ctx = { sessionId: "s_test", path: "/tmp/x" };
    const errs = [
      new FlowbuilderSessionMissingError("missing", ctx),
      new FlowbuilderSchemaError("bad schema", ctx),
      new FlowbuilderRefIntegrityError("bad refs", ctx),
      new FlowbuilderIOError("io fail", ctx),
      new FlowbuilderUnsupportedVersion("v2 not supported", { ...ctx, version: 2 }),
      new FlowbuilderMcpStartError("port in use", ctx),
    ];
    for (const e of errs) {
      expect(e).toBeInstanceOf(FlowbuilderError);
      expect(e).toBeInstanceOf(Error);
      expect(e.sessionId).toBe("s_test");
      expect(e.path).toBe("/tmp/x");
      expect(e.name).toMatch(/^Flowbuilder/);
    }
  });

  it("wraps cause when provided", () => {
    const cause = new Error("root");
    const e = new FlowbuilderIOError("io fail", {
      sessionId: "s",
      path: "/x",
      cause,
    });
    expect(e.cause).toBe(cause);
  });
});
