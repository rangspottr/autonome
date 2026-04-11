import { describe, it, expect } from "vitest";
import { uid, iso, $$, da } from "../utils.js";

describe("uid()", () => {
  it("generates non-empty strings", () => {
    expect(typeof uid()).toBe("string");
    expect(uid().length).toBeGreaterThan(0);
  });

  it("generates unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });
});

describe("iso()", () => {
  it("returns a valid ISO 8601 string", () => {
    const result = iso();
    expect(typeof result).toBe("string");
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });

  it("is close to current time", () => {
    const before = Date.now();
    const result = iso();
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("$$()", () => {
  it("formats numbers as dollar amounts", () => {
    expect($$( 1000)).toBe("$1,000");
    expect($$(0)).toBe("$0");
    expect($$(1500.9)).toBe("$1,501");
  });

  it("handles null and undefined gracefully", () => {
    expect($$(null)).toBe("$0");
    expect($$(undefined)).toBe("$0");
  });
});

describe("da()", () => {
  it("returns 0 for null/undefined", () => {
    expect(da(null)).toBe(0);
    expect(da(undefined)).toBe(0);
  });

  it("returns 0 for today", () => {
    expect(da(new Date().toISOString())).toBe(0);
  });

  it("returns correct days for past date", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(da(threeDaysAgo)).toBe(3);
  });
});
