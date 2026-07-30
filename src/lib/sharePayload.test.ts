import { describe, it, expect } from "vitest";
import {
  encodeSharePayload,
  decodeSharePayload,
  KIND_ORDER,
  type SharePayload,
} from "./sharePayload";

const FIXTURE: SharePayload = {
  v: 1,
  t: "Dinner at Luigi's",
  c: "USD",
  d: "2026-07-29",
  p: ["Andy", "Ben", "Cara"],
  i: [
    ["Margherita Pizza", 1450, 0, [0, 1]],
    ["Sparkling Water", 350, 0, []],
    ["Tax", 158, 1, []],
    ["Loyalty discount", -200, 3, []],
  ],
};

describe("KIND_ORDER", () => {
  it("matches the ItemKind union order exactly", () => {
    expect(KIND_ORDER).toEqual(["item", "tax", "tip", "discount"]);
  });
});

describe("encode/decode round trip", () => {
  it("returns a deep-equal payload", () => {
    const r = decodeSharePayload(encodeSharePayload(FIXTURE));
    expect(r).toEqual({ ok: true, payload: FIXTURE });
  });

  it("preserves an empty assigned array as meaningful (everyone)", () => {
    const r = decodeSharePayload(encodeSharePayload(FIXTURE));
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.i[1][3]).toEqual([]);
  });

  it("preserves negative prices for discounts", () => {
    const r = decodeSharePayload(encodeSharePayload(FIXTURE));
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.i[3][1]).toBe(-200);
  });

  it("produces a fragment with no characters needing percent-encoding", () => {
    const frag = encodeSharePayload(FIXTURE);
    expect(frag).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

describe("decode failures", () => {
  it("reports empty for an empty or whitespace fragment", () => {
    expect(decodeSharePayload("")).toEqual({ ok: false, error: "empty" });
    expect(decodeSharePayload("   ")).toEqual({ ok: false, error: "empty" });
  });

  it("reports corrupt for non-base64 junk", () => {
    expect(decodeSharePayload("!!!not base64!!!")).toEqual({
      ok: false,
      error: "corrupt",
    });
  });

  it("reports corrupt for a truncated fragment", () => {
    const frag = encodeSharePayload(FIXTURE);
    const cut = frag.slice(0, Math.floor(frag.length * 0.8));
    expect(decodeSharePayload(cut)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports version for an unrecognised v", () => {
    const future = encodeSharePayload({ ...FIXTURE, v: 2 as unknown as 1 });
    expect(decodeSharePayload(future)).toEqual({ ok: false, error: "version" });
  });

  it("reports corrupt (not version) for a JSON array root", () => {
    const bad = encodeSharePayload([1, 2, 3] as unknown as SharePayload);
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt (not version) for an object with no v field at all", () => {
    const bad = encodeSharePayload({
      t: "x",
      c: "USD",
      d: "2026-07-29",
      p: [],
      i: [],
    } as unknown as SharePayload);
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when an assigned index is out of range", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: [["Pizza", 1000, 0, [7]]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt for a non-integer price", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: [["Pizza", 10.5, 0, []]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt for a kind index out of range", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: [["Pizza", 1000, 9 as unknown as 0, []]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when required fields are missing", () => {
    const bad = encodeSharePayload({ v: 1 } as unknown as SharePayload);
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when c is not a string", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      c: 123 as unknown as string,
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when d is not a string", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      d: 20260729 as unknown as string,
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when p is not an array", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      p: "Andy" as unknown as string[],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when i is not an array", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: "not an array" as unknown as SharePayload["i"],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when p contains a non-string", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      p: ["Andy", 5 as unknown as string, "Cara"],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when an item is not itself an array", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: ["not an item tuple" as unknown as SharePayload["i"][number]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when an item tuple has the wrong length", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: [["Pizza", 1000, 0] as unknown as SharePayload["i"][number]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when an item name is not a string", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: [[123, 1000, 0, []] as unknown as SharePayload["i"][number]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("reports corrupt when an item's assigned field is not an array", () => {
    const bad = encodeSharePayload({
      ...FIXTURE,
      i: [
        ["Pizza", 1000, 0, "nope"] as unknown as SharePayload["i"][number],
      ],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });
});
