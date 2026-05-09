import { describe, it, expect } from "vitest";
import {
  SessionIdSchema,
  CreateInputSchema,
  SendInputSchema,
  WatchInputSchema,
  RenameInputSchema,
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
});
