import { describe, it, expect } from "vitest";
import { formatDate } from "./formatDate";

describe("formatDate", () => {
  it("renders the correct day with no timezone off-by-one", () => {
    // Parsing YYYY-MM-DD as local parts must keep the 15th as the 15th,
    // regardless of the runner's timezone.
    const out = formatDate("2026-07-15");
    expect(out).toMatch(/15/);
    expect(out).toMatch(/2026/);
  });

  it("returns the input unchanged when it is not a valid YYYY-MM-DD", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
