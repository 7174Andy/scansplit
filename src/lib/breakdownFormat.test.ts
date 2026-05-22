import { describe, it, expect } from "vitest";
import { formatBreakdown } from "./breakdownFormat";
import type { ShareLine } from "./types";

const line = (overrides: Partial<ShareLine>): ShareLine => ({
  itemId: "i1",
  shareCents: 600,
  itemKind: "item",
  itemPriceCents: 1200,
  sharerCount: 2,
  isEveryone: false,
  bumpedCents: 0,
  ...overrides,
});

describe("formatBreakdown", () => {
  it("solo item shows (just you) with no formula", () => {
    const r = formatBreakdown(
      line({ shareCents: 900, itemPriceCents: 900, sharerCount: 1 }),
      "Garlic Bread",
      "USD"
    );
    expect(r.main).toBe("Garlic Bread (just you): $9.00");
    expect(r.bump).toBeNull();
  });

  it("subset item shows the divisor formula", () => {
    const r = formatBreakdown(line({}), "Caesar Salad", "USD");
    expect(r.main).toBe("Caesar Salad: $12.00 ÷ 2 = $6.00");
  });

  it("everyone item shows (everyone, N) annotation", () => {
    const r = formatBreakdown(
      line({
        shareCents: 500,
        itemPriceCents: 2000,
        sharerCount: 4,
        isEveryone: true,
      }),
      "Beer Pitcher",
      "USD"
    );
    expect(r.main).toBe("Beer Pitcher (everyone, 4): $20.00 ÷ 4 = $5.00");
  });

  it("tax with weight > 0 shows × percent formula", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 450,
        shareCents: 171,
        sharerCount: 3,
        isEveryone: true,
        weightBasisPoints: 3800,
      }),
      "Tax",
      "USD"
    );
    expect(r.main).toBe("Tax (proportional): $4.50 × 38% = $1.71");
  });

  it("tax with weight = 0 shows (no items) note", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 450,
        shareCents: 0,
        sharerCount: 3,
        isEveryone: true,
        weightBasisPoints: 0,
      }),
      "Tax",
      "USD"
    );
    expect(r.main).toBe("Tax (proportional): $0.00 (no items)");
  });

  it("tip shows ÷ formula across all people", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tip",
        itemPriceCents: 600,
        shareCents: 200,
        sharerCount: 3,
        isEveryone: true,
      }),
      "Tip",
      "USD"
    );
    expect(r.main).toBe("Tip (split evenly): $6.00 ÷ 3 = $2.00");
  });

  it("uses the actual itemName, not a hardcoded label", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 200,
        shareCents: 76,
        sharerCount: 2,
        isEveryone: true,
        weightBasisPoints: 3800,
      }),
      "VAT",
      "USD"
    );
    expect(r.main).toBe("VAT (proportional): $2.00 × 38% = $0.76");
  });

  it("positive bump renders as +1¢ rounding", () => {
    const r = formatBreakdown(line({ bumpedCents: 1 }), "Caesar Salad", "USD");
    expect(r.bump).toBe("+1¢ rounding");
  });

  it("negative bump (discount) renders as −1¢ rounding", () => {
    const r = formatBreakdown(
      line({
        itemKind: "discount",
        itemPriceCents: -500,
        shareCents: -190,
        sharerCount: 2,
        isEveryone: true,
        weightBasisPoints: 3800,
        bumpedCents: -1,
      }),
      "Discount",
      "USD"
    );
    expect(r.bump).toBe("−1¢ rounding");
  });

  it("rendered percent can round to 99% or 101% across people — formatter does not reconcile", () => {
    // subtotals 10/11/12 → bp 3030/3333/3636; rendered as 30%/33%/36% = 99% across people.
    // The formatter just shows the rounded integer percent per line; the actual share is exact.
    // This test pins that we display the rounded percent verbatim, even when the row sum looks "off".
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 100,
        shareCents: 37, // 36 floor + 1¢ bump
        sharerCount: 3,
        isEveryone: true,
        weightBasisPoints: 3636,
        bumpedCents: 1,
      }),
      "Tax",
      "USD"
    );
    expect(r.main).toBe("Tax (proportional): $1.00 × 36% = $0.37");
    expect(r.bump).toBe("+1¢ rounding");
  });
});
