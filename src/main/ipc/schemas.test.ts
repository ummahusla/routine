import { describe, it, expect } from "vitest";
import {
  SessionIdSchema,
  CreateInputSchema,
  SendInputSchema,
  WatchInputSchema,
  RenameInputSchema,
  RunExecuteInputSchema,
  RunCancelInputSchema,
  RunListInputSchema,
  RunReadInputSchema,
  RunWatchInputSchema,
  RunUnwatchInputSchema,
} from "./schemas.js";

describe("schemas", () => {
  it("SessionIdSchema accepts ULID, rejects garbage", () => {
    expect(SessionIdSchema.safeParse("01HXYZABCDEFGHJKMNPQRSTVWX").success).toBe(true);
    expect(SessionIdSchema.safeParse("nope").success).toBe(false);
    expect(SessionIdSchema.safeParse("").success).toBe(false);
  });
  it("CreateInputSchema accepts empty + optional title/model", () => {
    expect(CreateInputSchema.safeParse({}).success).toBe(true);
    expect(CreateInputSchema.safeParse({ title: "x" }).success).toBe(true);
    expect(CreateInputSchema.safeParse({ title: 1 }).success).toBe(false);
  });
  it("SendInputSchema requires sessionId+prompt; cap on prompt length", () => {
    expect(SendInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", prompt: "" }).success).toBe(false);
    expect(SendInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", prompt: "hi" }).success).toBe(true);
    const huge = "x".repeat(200_001);
    expect(SendInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", prompt: huge }).success).toBe(false);
  });
  it("WatchInputSchema + RenameInputSchema basics", () => {
    expect(WatchInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX" }).success).toBe(true);
    expect(RenameInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", title: "" }).success).toBe(false);
    expect(RenameInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", title: "ok" }).success).toBe(true);
  });
  it(".strict() rejects unknown keys at trust boundary", () => {
    const validId = "01HXYZABCDEFGHJKMNPQRSTVWX";
    expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", extra: "x" }).success).toBe(false);
    expect(CreateInputSchema.safeParse({ wat: 1 }).success).toBe(false);
    expect(WatchInputSchema.safeParse({ sessionId: validId, foo: "bar" }).success).toBe(false);
    expect(RenameInputSchema.safeParse({ sessionId: validId, title: "ok", junk: true }).success).toBe(false);
  });
  it("SendInputSchema accepts optional model and rejects empty/long", () => {
    const validId = "01HXYZABCDEFGHJKMNPQRSTVWX";
    expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", model: "composer-2" }).success).toBe(true);
    expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi" }).success).toBe(true);
    expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", model: "" }).success).toBe(false);
    const longModel = "x".repeat(81);
    expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", model: longModel }).success).toBe(false);
  });
});

describe("run:* schemas", () => {
  it("RunExecuteInputSchema accepts { sessionId } and rejects unknown keys", () => {
    expect(() => RunExecuteInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).not.toThrow();
    expect(() => RunExecuteInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", junk: 1 })).toThrow();
  });
  it("RunCancelInputSchema requires sessionId + runId", () => {
    expect(() => RunCancelInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", runId: "r1" })).not.toThrow();
    expect(() => RunCancelInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).toThrow();
  });
  it("RunWatchInputSchema rejects extra keys", () => {
    expect(() => RunWatchInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", runId: "r1", x: 1 })).toThrow();
  });
});
