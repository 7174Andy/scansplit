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
