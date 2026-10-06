import { describe, it, expect } from "vitest";
import { deflateSync } from "fflate";
import {
  encodeSharePayload,
  decodeSharePayload,
  KIND_ORDER,
  type SharePayload,
} from "./sharePayload";

/**
 * Deterministic high-entropy text, so a payload's compressed size is
 * predictable. A repeated character will not do: deflate crushes it to almost
 * nothing, so the fragment never reaches the size cap under test.
 */
function highEntropy(n: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let x = 2463534242 >>> 0; // xorshift32
  let s = "";
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    s += alphabet[x % alphabet.length];
  }
  return s;
}

/** Mirrors the module's private base64url encoder, for hand-built fragments. */
function toBase64UrlForTest(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

// These four cases are not "more type checking". Each one is a fragment an
// attacker can hand-craft that the decoder used to ACCEPT, and each then hurt
// the recipient somewhere the decoder could no longer help: an OOM, a thrown
// RangeError mid-render, or a page that states a wrong number confidently.
describe("decode rejects hostile fragments, not just malformed ones", () => {
  it("rejects an oversized fragment", () => {
    expect(decodeSharePayload("A".repeat(20_000))).toEqual({
      ok: false,
      error: "corrupt",
    });
  });

  // The test above passes with or without the size cap — "A".repeat(20_000) is
  // not valid deflate data, so it would be rejected anyway. This one is the
  // real proof: the payload is entirely well-formed and decodes successfully
  // without the cap, so ONLY the length gate can reject it.
  it("rejects an over-cap fragment even though it would decode into a valid payload", () => {
    const big = encodeSharePayload({ ...FIXTURE, t: highEntropy(20_000) });
    expect(big.length).toBeGreaterThan(16_384);
    expect(decodeSharePayload(big)).toEqual({ ok: false, error: "corrupt" });
  });

  it("does not clip a legitimately large split", () => {
    // The cap has to sit far above real usage or it becomes a bug of its own.
    // 150 items across 8 people — the largest case the spec measured — is about
    // 1.2k chars, and even 2000 items still fits.
    const many = encodeSharePayload({
      ...FIXTURE,
      p: ["Andy", "Ben", "Cara", "Dev", "Eve", "Finn", "Gus", "Hana"],
      i: Array.from(
        { length: 2000 },
        (_, k) => [`Item number ${k} qty ${k % 7}`, 100 + k, 0, [k % 8]] as const
      ) as unknown as SharePayload["i"],
    });
    expect(many.length).toBeLessThanOrEqual(16_384);
    expect(decodeSharePayload(many)).toMatchObject({ ok: true });
  });

  it("bounds what a compression bomb can allocate", () => {
    // 16 MiB of zeros deflates to a 21,846-char fragment (~768x, the best ratio
    // fflate achieves). Because the worst case scales with the input, capping
    // the fragment at 16,384 chars caps inflation at roughly 12 MiB — allocated
    // once and immediately discarded. Uncapped, a multi-megabyte URL (which
    // Chromium accepts) reaches ~1 GB and hangs or OOMs the recipient's tab.
    const bombFragment = toBase64UrlForTest(
      deflateSync(new Uint8Array(16 * 1024 * 1024), { level: 9 })
    );
    expect(bombFragment.length).toBeGreaterThan(16_384);
    expect(decodeSharePayload(bombFragment)).toEqual({ ok: false, error: "corrupt" });
  });

  // Intl.NumberFormat throws RangeError on anything that is not three letters.
  // It happens inside SplitTotalsTable's render, which unmounts the React root
  // and leaves the recipient staring at a blank page.
  for (const c of ["US", "", "USDD", "U$D", "12"]) {
    it(`rejects a malformed currency code ${JSON.stringify(c)}`, () => {
      const bad = encodeSharePayload({ ...FIXTURE, c });
      expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
    });
  }

  it("still accepts any well-formed 3-letter currency code", () => {
    // The guard must admit everything Intl tolerates, not just USD — the app
    // does not restrict the currency field to a known list.
    for (const c of ["USD", "eur", "ZZZ", "GBP"]) {
      expect(decodeSharePayload(encodeSharePayload({ ...FIXTURE, c }))).toMatchObject({
        ok: true,
      });
    }
  });

  for (const d of ["2026-7-9", "29-07-2026", "tomorrow", "", "2026-07-29T10:00:00Z"]) {
    it(`rejects a malformed date ${JSON.stringify(d)}`, () => {
      const bad = encodeSharePayload({ ...FIXTURE, d });
      expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
    });
  }

  it("rejects a payload with items but no people", () => {
    // computeSplit([$50 item], []) returns { perPerson: [], totalCents: 0 },
    // so this rendered an empty table under "Total $0.00" while the payload
    // carried a real charge.
    const bad = encodeSharePayload({
      ...FIXTURE,
      p: [],
      i: [["Steak", 5000, 0, []]],
    });
    expect(decodeSharePayload(bad)).toEqual({ ok: false, error: "corrupt" });
  });

  it("still accepts an empty split with no people and no items", () => {
    // Nothing is misrepresented here: an empty table for an empty bill is
    // accurate, so this must not be swept up by the check above.
    const empty = encodeSharePayload({ ...FIXTURE, p: [], i: [] });
    expect(decodeSharePayload(empty)).toMatchObject({ ok: true });
  });
});
