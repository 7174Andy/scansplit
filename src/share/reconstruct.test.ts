import { describe, it, expect } from "vitest";
import { reconstruct } from "./reconstruct";
import type { SharePayload } from "@/lib/sharePayload";

const PAYLOAD: SharePayload = {
  v: 1,
  t: "Dinner",
  c: "USD",
  d: "2026-07-29",
  p: ["Andy", "Ben", "Cara"],
  i: [
    ["Pizza", 1450, 0, [0, 2]],
    ["Water", 350, 0, []],
    ["Tax", 158, 1, []],
    ["Discount", -200, 3, [1]],
  ],
};

describe("reconstruct", () => {
  it("maps people to synthetic p{n} ids in order", () => {
    const { people } = reconstruct(PAYLOAD);
    expect(people).toEqual([
      { id: "p0", name: "Andy" },
      { id: "p1", name: "Ben" },
      { id: "p2", name: "Cara" },
    ]);
  });

  it("maps items to synthetic i{n} ids in order", () => {
    const { items } = reconstruct(PAYLOAD);
    expect(items.map((i) => i.id)).toEqual(["i0", "i1", "i2", "i3"]);
    expect(items.map((i) => i.name)).toEqual(["Pizza", "Water", "Tax", "Discount"]);
  });

  it("translates assigned indices to the matching person ids, in order", () => {
    const { items } = reconstruct(PAYLOAD);
    expect(items[0].assignedPersonIds).toEqual(["p0", "p2"]);
    expect(items[3].assignedPersonIds).toEqual(["p1"]);
  });

  it("keeps an empty assigned array empty, preserving 'everyone'", () => {
    const { items } = reconstruct(PAYLOAD);
    expect(items[1].assignedPersonIds).toEqual([]);
    expect(items[2].assignedPersonIds).toEqual([]);
  });

  it("decodes kind indices back to ItemKind strings", () => {
    const { items } = reconstruct(PAYLOAD);
    expect(items.map((i) => i.kind)).toEqual(["item", "item", "tax", "discount"]);
  });

  it("carries prices through unchanged, including negatives", () => {
    const { items } = reconstruct(PAYLOAD);
    expect(items.map((i) => i.priceCents)).toEqual([1450, 350, 158, -200]);
  });

  it("builds name lookups keyed by the synthetic ids", () => {
    const { personNames, itemNames } = reconstruct(PAYLOAD);
    expect(personNames).toEqual({ p0: "Andy", p1: "Ben", p2: "Cara" });
    expect(itemNames.i0).toBe("Pizza");
    expect(itemNames.i3).toBe("Discount");
  });

  it("handles a payload with no items", () => {
    const { items, itemNames } = reconstruct({ ...PAYLOAD, i: [] });
    expect(items).toEqual([]);
    expect(itemNames).toEqual({});
  });
});
