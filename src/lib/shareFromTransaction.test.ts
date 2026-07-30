import { describe, it, expect } from "vitest";
import { toSharePayload } from "./shareFromTransaction";
import { decodeSharePayload } from "./sharePayload";
import { buildShareUrl } from "./shareUrl";
import type { LineItem, Person } from "./types";

const PEOPLE: Person[] = [
  { id: "uuid-a", name: "Andy" },
  { id: "uuid-b", name: "Ben" },
];

const ITEMS: LineItem[] = [
  { id: "x1", name: "Pizza", priceCents: 1450, kind: "item", assignedPersonIds: ["uuid-b"] },
  { id: "x2", name: "Water", priceCents: 350, kind: "item", assignedPersonIds: [] },
  { id: "x3", name: "Tax", priceCents: 158, kind: "tax", assignedPersonIds: [] },
  { id: "x4", name: "Coupon", priceCents: -200, kind: "discount", assignedPersonIds: [] },
];

const ARGS = {
  title: "Dinner",
  currency: "USD",
  date: "2026-07-29",
  people: PEOPLE,
  items: ITEMS,
};

describe("toSharePayload", () => {
  it("replaces person UUIDs with array indices", () => {
    const p = toSharePayload(ARGS);
    expect(p.p).toEqual(["Andy", "Ben"]);
    expect(p.i[0][3]).toEqual([1]); // uuid-b is index 1
  });

  it("keeps an empty assignment empty, preserving 'everyone'", () => {
    const p = toSharePayload(ARGS);
    expect(p.i[1][3]).toEqual([]);
  });

  it("encodes kinds as indices in KIND_ORDER", () => {
    const p = toSharePayload(ARGS);
    expect(p.i.map((i) => i[2])).toEqual([0, 0, 1, 3]);
  });

  it("carries negative discount prices through", () => {
    expect(toSharePayload(ARGS).i[3][1]).toBe(-200);
  });

  it("sets version 1 and copies the metadata", () => {
    const p = toSharePayload(ARGS);
    expect(p.v).toBe(1);
    expect(p.t).toBe("Dinner");
    expect(p.c).toBe("USD");
    expect(p.d).toBe("2026-07-29");
  });

  it("drops an assignment referencing an unknown person rather than emitting a bad index", () => {
    const p = toSharePayload({
      ...ARGS,
      items: [{ id: "x", name: "Odd", priceCents: 100, kind: "item", assignedPersonIds: ["ghost"] }],
    });
    expect(p.i[0][3]).toEqual([]);
  });

  it("survives a full round trip through the URL", () => {
    const url = new URL(buildShareUrl(toSharePayload(ARGS)));
    const r = decodeSharePayload(url.hash.slice(1));
    expect(r.ok).toBe(true);
  });
});
