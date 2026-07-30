import { describe, it, expect } from "vitest";
import { buildShareUrl, SHARE_BASE_URL } from "./shareUrl";
import { decodeSharePayload, type SharePayload } from "./sharePayload";

const FIXTURE: SharePayload = {
  v: 1,
  t: "Dinner at Luigi's",
  c: "USD",
  d: "2026-07-29",
  p: ["Andy", "Ben"],
  i: [["Pizza", 1450, 0, [0, 1]]],
};

describe("buildShareUrl", () => {
  it("puts the payload in the fragment, never the path or query", () => {
    const url = new URL(buildShareUrl(FIXTURE));
    expect(url.search).toBe("");
    expect(url.pathname).toBe("/scansplit/share/");
    expect(url.hash.length).toBeGreaterThan(1);
  });

  it("round-trips through decodeSharePayload", () => {
    const url = new URL(buildShareUrl(FIXTURE));
    const r = decodeSharePayload(url.hash.slice(1));
    expect(r).toEqual({ ok: true, payload: FIXTURE });
  });

  it("starts with the documented base URL", () => {
    expect(buildShareUrl(FIXTURE).startsWith(SHARE_BASE_URL + "#")).toBe(true);
  });
});
