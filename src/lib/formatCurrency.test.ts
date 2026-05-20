import { describe, it, expect } from "vitest";
import { formatCents, parseCurrencyToCents } from "./formatCurrency";

describe("formatCents", () => {
  it("formats USD with two decimals", () => {
    expect(formatCents(349)).toBe("$3.49");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-100)).toMatch(/-\$1\.00/);
  });
});

describe("parseCurrencyToCents", () => {
  it("parses common inputs", () => {
    expect(parseCurrencyToCents("3.49")).toBe(349);
    expect(parseCurrencyToCents("$3.49")).toBe(349);
    expect(parseCurrencyToCents("0")).toBe(0);
    expect(parseCurrencyToCents("-1.00")).toBe(-100);
    expect(parseCurrencyToCents("abc")).toBeNull();
  });
});
