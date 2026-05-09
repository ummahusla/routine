import { describe, it, expect } from "vitest";
import { ulid, ULID_REGEX } from "./ulid.js";

describe("ulid", () => {
  it("produces 26-char Crockford-base32 strings matching the regex", () => {
    for (let i = 0; i < 100; i++) {
      const id = ulid();
      expect(id).toHaveLength(26);
      expect(id).toMatch(ULID_REGEX);
    }
  });

  it("is monotonically sortable in time", async () => {
    const a = ulid();
    await new Promise((r) => setTimeout(r, 2));
    const b = ulid();
    expect(a < b).toBe(true);
  });

  it("ULID_REGEX rejects non-ULIDs", () => {
    expect(ULID_REGEX.test("not-a-ulid")).toBe(false);
    expect(ULID_REGEX.test("01HXYZABCDEFGHJKMNPQRSTVWX")).toBe(true);
  });
});
