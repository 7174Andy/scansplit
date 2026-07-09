import { describe, it, expect } from "vitest";
import { isoToDate, dateToIso } from "./calendarDate";

describe("calendarDate", () => {
  it("dateToIso serializes LOCAL date parts to YYYY-MM-DD", () => {
    expect(dateToIso(new Date(2026, 6, 15))).toBe("2026-07-15"); // month is 0-indexed
    expect(dateToIso(new Date(2026, 0, 5))).toBe("2026-01-05");  // zero-padded
  });

  it("isoToDate parses YYYY-MM-DD into a LOCAL Date (no UTC shift)", () => {
    const d = isoToDate("2026-07-15")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
  });

  it("round-trips iso -> Date -> iso", () => {
    expect(dateToIso(isoToDate("2026-03-14")!)).toBe("2026-03-14");
  });

  it("isoToDate returns undefined for malformed input", () => {
    expect(isoToDate("not-a-date")).toBeUndefined();
  });
});
