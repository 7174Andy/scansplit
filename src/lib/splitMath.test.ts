import { describe, it, expect } from "vitest";
import { computeSplit } from "./splitMath";
import type { LineItem, Person } from "./types";

const people = (...names: string[]): Person[] =>
  names.map((n, i) => ({ id: `p${i}`, name: n }));

const item = (
  overrides: Partial<LineItem> & Pick<LineItem, "id" | "priceCents">
): LineItem => ({
  name: "Item",
  kind: "item",
  assignedPersonIds: [],
  ...overrides,
});

describe("computeSplit — even N-way", () => {
  it("splits one item evenly across all people when assignment is empty", () => {
    const result = computeSplit(
      [item({ id: "i1", priceCents: 1500 })],
      people("A", "B", "C")
    );
    expect(result.totalCents).toBe(1500);
    expect(result.perPerson.map((p) => p.totalCents)).toEqual([500, 500, 500]);
  });

  it("returns one person owing zero when there are no items", () => {
    const result = computeSplit([], people("A"));
    expect(result.totalCents).toBe(0);
    expect(result.perPerson[0].totalCents).toBe(0);
  });
});

describe("computeSplit — subset assignment", () => {
  it("only assigned people pay; others owe zero for that item", () => {
    const ps = people("A", "B", "C");
    const result = computeSplit(
      [{ ...item({ id: "i1", priceCents: 900 }), assignedPersonIds: ["p0", "p1"] }],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(450); // A
    expect(result.perPerson[1].totalCents).toBe(450); // B
    expect(result.perPerson[2].totalCents).toBe(0);   // C
  });
});

describe("computeSplit — proportional tax, even-split tip", () => {
  it("allocates tax proportionally to each person's item subtotal", () => {
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 2000 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 1000 }), assignedPersonIds: ["p1"] },
        item({ id: "tax", priceCents: 300, kind: "tax" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(2200);
    expect(result.perPerson[1].totalCents).toBe(1100);
    expect(result.totalCents).toBe(3300);
  });

  it("splits tip evenly across all people regardless of item subtotal", () => {
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 2000 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 1000 }), assignedPersonIds: ["p1"] },
        item({ id: "tip", priceCents: 600, kind: "tip" }),
      ],
      ps
    );
    // 600 / 2 = 300 each, exact. A and B each pay half the tip even though
    // A ordered twice as much.
    expect(result.perPerson[0].totalCents).toBe(2300);
    expect(result.perPerson[1].totalCents).toBe(1300);
    expect(result.totalCents).toBe(3600);
  });

  it("routes the odd tip cent to the person furthest behind", () => {
    // Three people, one with no items. Tip of 7¢ → base 2, remainder 1.
    // Cumulative-min sends the +1 to C, who's at 0 after items.
    const ps = people("A", "B", "C");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 500 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 500 }), assignedPersonIds: ["p1"] },
        item({ id: "tip", priceCents: 7, kind: "tip" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(502); // A: 500 + 2
    expect(result.perPerson[1].totalCents).toBe(502); // B: 500 + 2
    expect(result.perPerson[2].totalCents).toBe(3);   // C: 0 + 3
    expect(result.totalCents).toBe(1007);
  });
});

describe("computeSplit — rounding invariant", () => {
  it("sum of per-person totals equals sum of input prices (no money lost)", () => {
    const ps = people("A", "B", "C");
    const result = computeSplit([item({ id: "i1", priceCents: 1000 })], ps);
    expect(result.totalCents).toBe(1000);
    expect(result.perPerson.map((p) => p.totalCents).sort()).toEqual([333, 333, 334]);
  });

  it("is deterministic across calls", () => {
    const ps = people("A", "B", "C");
    const r1 = computeSplit([item({ id: "i1", priceCents: 1000 })], ps);
    const r2 = computeSplit([item({ id: "i1", priceCents: 1000 })], ps);
    expect(r1.perPerson.map((p) => p.totalCents)).toEqual(
      r2.perPerson.map((p) => p.totalCents)
    );
  });

  it("balances the leftover cent across items so two people split evenly", () => {
    // Two odd-cent items split 2 ways. Item 1: tie → A (lower id) gets the +1.
    // Item 2: A is now ahead, so B gets the +1. Net: both at 349.
    const ps = people("A", "B");
    const result = computeSplit(
      [
        item({ id: "i1", priceCents: 349 }),
        item({ id: "i2", priceCents: 349 }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(349);
    expect(result.perPerson[1].totalCents).toBe(349);
  });

  it("sends the leftover cent to the person furthest behind, not by item index", () => {
    // Item 1 ($1.00, A+B only) leaves C at 0 while A=B=50.
    // Item 2 ($1.00, all three) has a leftover cent. A rotation-by-index
    // scheme would give it to A or B; cumulative-min gives it to C, who's
    // furthest behind.
    const ps = people("A", "B", "C");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 100 }), assignedPersonIds: ["p0", "p1"] },
        item({ id: "i2", priceCents: 100 }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(83); // A: 50 + 33
    expect(result.perPerson[1].totalCents).toBe(83); // B: 50 + 33
    expect(result.perPerson[2].totalCents).toBe(34); // C: 0 + 34
    expect(result.totalCents).toBe(200);
  });

  it("bounds the imbalance between two people to at most 1 cent across many items", () => {
    const ps = people("A", "B");
    const items = Array.from({ length: 7 }, (_, idx) =>
      item({ id: `i${idx}`, priceCents: 349 })
    );
    const result = computeSplit(items, ps);
    const diff = Math.abs(
      result.perPerson[0].totalCents - result.perPerson[1].totalCents
    );
    expect(diff).toBeLessThanOrEqual(1);
  });
});

describe("computeSplit — discounts", () => {
  it("allocates a discount proportionally as a negative amount", () => {
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 2000 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 1000 }), assignedPersonIds: ["p1"] },
        item({ id: "d1", priceCents: -300, kind: "discount" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(1800);
    expect(result.perPerson[1].totalCents).toBe(900);
    expect(result.totalCents).toBe(2700);
  });

  it("does not produce negative per-person totals on small discounts", () => {
    const ps = people("A");
    const result = computeSplit(
      [
        item({ id: "i1", priceCents: 1000 }),
        item({ id: "d1", priceCents: -100, kind: "discount" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(900);
  });
});
