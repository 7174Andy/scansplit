import { describe, it, expect } from "vitest";
import { toSharePayload } from "./shareFromTransaction";
import { decodeSharePayload } from "./sharePayload";
import { buildShareUrl } from "./shareUrl";
import { computeSplit } from "./splitMath";
import { reconstruct } from "@/share/reconstruct";
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

// ---------------------------------------------------------------------------
// The guarantee the whole feature rests on: the clipboard paste carries BOTH
// the desktop app's numbers (as text lines) and the share page's (behind the
// link), so a single pasted message must not contradict itself.
//
// SharePage.test.tsx cannot establish this — it computes its expectation from
// reconstruct()'s own synthetic `p0..pN` ids, so it compares the page against
// itself. This file has both sides: real-UUID people on the desktop side and
// the full encode -> URL -> decode -> reconstruct pipeline on the link side.
//
// The UUIDs below are hardcoded and deliberately sort into a DIFFERENT order
// than the people array (Cara < Ben < Andy lexicographically, but the display
// order is Andy, Ben, Cara). Any tie-break derived from an id would therefore
// place a rounding cent differently on the two sides. Choosing UUIDs whose
// order happened to match the display order would make this test as blind as
// the ones it is here to backstop.
// ---------------------------------------------------------------------------
const ANDY = "f0a1b2c3-1111-4000-8000-000000000001";
const BEN = "a0a1b2c3-2222-4000-8000-000000000002";
const CARA = "50a1b2c3-3333-4000-8000-000000000003";

const ORDERED_PEOPLE: Person[] = [
  { id: ANDY, name: "Andy" },
  { id: BEN, name: "Ben" },
  { id: CARA, name: "Cara" },
];

/** Per-person totals keyed BY NAME — the only key both sides share. */
function totalsByName(items: LineItem[], people: Person[]): Map<string, number> {
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const split = computeSplit(items, people);
  return new Map(split.perPerson.map((pt) => [nameOf.get(pt.personId)!, pt.totalCents]));
}

/** What the desktop app shows: real UUIDs, straight through computeSplit. */
function desktopTotals(items: LineItem[]): Map<string, number> {
  return totalsByName(items, ORDERED_PEOPLE);
}

/** What a recipient sees: the complete encode -> URL -> decode -> render path. */
function shareLinkTotals(items: LineItem[]): Map<string, number> {
  const payload = toSharePayload({
    title: "Dinner",
    currency: "USD",
    date: "2026-07-29",
    people: ORDERED_PEOPLE,
    items,
  });
  const url = new URL(buildShareUrl(payload));
  const decoded = decodeSharePayload(url.hash.slice(1));
  if (!decoded.ok) throw new Error(`share link failed to decode: ${decoded.error}`);
  const { items: rItems, people: rPeople } = reconstruct(decoded.payload);
  return totalsByName(rItems, rPeople);
}

describe("the share link agrees with the desktop app, cent for cent", () => {
  it("sanity check: these UUIDs really do sort differently than the people array", () => {
    expect(ORDERED_PEOPLE.map((p) => p.name)).toEqual(["Andy", "Ben", "Cara"]);
    expect(
      [...ORDERED_PEOPLE].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => p.name)
    ).toEqual(["Cara", "Ben", "Andy"]);
  });

  // allocate(): an odd amount over 2 sharers leaves exactly one cent to place,
  // and both candidates are equally far from balance, so the tie-break decides.
  it("places allocate()'s leftover cent on the same person on both sides", () => {
    const items: LineItem[] = [
      { id: "i1", name: "Pizza", priceCents: 1451, kind: "item", assignedPersonIds: [ANDY, BEN] },
    ];
    expect(Object.fromEntries(shareLinkTotals(items))).toEqual(
      Object.fromEntries(desktopTotals(items))
    );
  });

  // allocateProportional(): equal item subtotals give equal fractional
  // remainders, so the tax's single leftover cent hits the tie-break too.
  it("places allocateProportional()'s leftover cent on the same person on both sides", () => {
    const items: LineItem[] = [
      { id: "i1", name: "Platter", priceCents: 2000, kind: "item", assignedPersonIds: [ANDY, BEN] },
      { id: "i2", name: "Tax", priceCents: 101, kind: "tax", assignedPersonIds: [] },
    ];
    expect(Object.fromEntries(shareLinkTotals(items))).toEqual(
      Object.fromEntries(desktopTotals(items))
    );
  });

  // A three-way odd split plus tip and a discount, so remainders land in every
  // allocation path at once rather than one at a time.
  it("agrees across items, tax, tip and a discount together", () => {
    const items: LineItem[] = [
      { id: "i1", name: "Pizza", priceCents: 1451, kind: "item", assignedPersonIds: [ANDY, BEN] },
      { id: "i2", name: "Wine", priceCents: 2501, kind: "item", assignedPersonIds: [] },
      { id: "i3", name: "Fries", priceCents: 703, kind: "item", assignedPersonIds: [BEN, CARA] },
      { id: "i4", name: "Tax", priceCents: 347, kind: "tax", assignedPersonIds: [] },
      { id: "i5", name: "Tip", priceCents: 802, kind: "tip", assignedPersonIds: [] },
      { id: "i6", name: "Coupon", priceCents: -251, kind: "discount", assignedPersonIds: [] },
    ];
    const desktop = desktopTotals(items);
    const link = shareLinkTotals(items);
    expect(Object.fromEntries(link)).toEqual(Object.fromEntries(desktop));
    // Guard against the assertion above passing because both sides are empty.
    expect(desktop.size).toBe(3);
  });
});
