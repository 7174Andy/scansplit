import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import type { ItemKind } from "./types";

/** Index order is part of the wire format. Never reorder. */
export const KIND_ORDER: readonly ItemKind[] = ["item", "tax", "tip", "discount"];

/** [name, priceCents, kindIndex, assignedPersonIndices] */
export type SharedItem = [string, number, 0 | 1 | 2 | 3, number[]];

export interface SharePayload {
  v: 1;
  t: string;   // title
  c: string;   // currency code
  d: string;   // ISO date, YYYY-MM-DD
  p: string[]; // people names; the array index IS the person reference
  i: SharedItem[];
}

export type DecodeError = "empty" | "corrupt" | "version";

/**
 * The largest payload the spec measured was 1175 chars (150 items, 8 people);
 * this is ~13x that, so it cannot clip a real split.
 *
 * It exists to bound inflation. fflate cannot be asked to stop at a size: the
 * `out` option needs the length known in advance and SILENTLY TRUNCATES rather
 * than erroring, which would turn a hostile link into a wrong bill instead of a
 * rejected one. Capping the input is the only honest lever. fflate@0.8.3 tops
 * out around 768x (a 1376-char fragment inflates to 1 MiB; 21,846 chars to
 * 16 MiB), so 16 KiB in bounds output near 12 MiB — allocated once and
 * discarded. Uncapped, a multi-megabyte URL (which Chromium accepts) reaches
 * ~1 GB and hangs or OOMs the recipient's tab.
 */
const MAX_FRAGMENT_CHARS = 16_384;

/** Anything outside this throws RangeError inside Intl.NumberFormat. */
const CURRENCY_RE = /^[A-Za-z]{3}$/;

/** Anything else renders as the literal text "Invalid Date". */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DecodeResult =
  | { ok: true; payload: SharePayload }
  | { ok: false; error: DecodeError };

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

/**
 * Decodes and VALIDATES. The fragment is untrusted input — it may have been
 * truncated by a messaging app, hand-edited, or produced by a future version.
 * Returns a typed error rather than throwing or half-succeeding.
 */
export function decodeSharePayload(fragment: string): DecodeResult {
  const trimmed = fragment.trim();
  if (trimmed === "") return { ok: false, error: "empty" };
  // Checked before decoding, so the cap bounds every allocation downstream.
  if (trimmed.length > MAX_FRAGMENT_CHARS) return { ok: false, error: "corrupt" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(inflateSync(fromBase64Url(trimmed))));
  } catch {
    return { ok: false, error: "corrupt" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "corrupt" };
  }
  const o = parsed as Record<string, unknown>;

  // A missing `v` is garbage, not a future format. Only an explicitly present
  // but unrecognised version earns the "newer version" message. Version is
  // checked before shape, so a future format gets the accurate message
  // instead of being reported as corrupt.
  if (!("v" in o)) return { ok: false, error: "corrupt" };
  if (o.v !== 1) return { ok: false, error: "version" };

  if (
    typeof o.t !== "string" ||
    typeof o.d !== "string" ||
    !Array.isArray(o.p) ||
    !Array.isArray(o.i) ||
    !o.p.every((n) => typeof n === "string")
  ) {
    return { ok: false, error: "corrupt" };
  }

  // `c` and `d` are not merely read — they are handed to formatters that throw
  // or emit garbage on a malformed value, and the render happens too late to
  // recover cleanly. Both are validated for SHAPE, not just type: a bad `c`
  // makes Intl.NumberFormat throw a RangeError out of SplitTotalsTable's
  // render, and a bad `d` shows the recipient the literal text "Invalid Date".
  if (typeof o.c !== "string" || !CURRENCY_RE.test(o.c)) {
    return { ok: false, error: "corrupt" };
  }
  if (!ISO_DATE_RE.test(o.d)) return { ok: false, error: "corrupt" };

  // No people but at least one item cannot be rendered honestly: computeSplit
  // returns `{ perPerson: [], totalCents: 0 }`, so the page would show an empty
  // table and "Total $0.00" while the payload holds real money. Being
  // confidently wrong about a bill is worse than admitting the link is broken.
  if (o.p.length === 0 && o.i.length > 0) return { ok: false, error: "corrupt" };

  const peopleCount = o.p.length;
  for (const raw of o.i) {
    if (!Array.isArray(raw) || raw.length !== 4) {
      return { ok: false, error: "corrupt" };
    }
    const [name, price, kind, assigned] = raw as unknown[];
    if (typeof name !== "string") return { ok: false, error: "corrupt" };
    if (typeof price !== "number" || !Number.isInteger(price)) {
      return { ok: false, error: "corrupt" };
    }
    if (typeof kind !== "number" || kind < 0 || kind >= KIND_ORDER.length) {
      return { ok: false, error: "corrupt" };
    }
    if (!Array.isArray(assigned)) return { ok: false, error: "corrupt" };
    for (const ix of assigned) {
      if (typeof ix !== "number" || !Number.isInteger(ix) || ix < 0 || ix >= peopleCount) {
        return { ok: false, error: "corrupt" };
      }
    }
  }

  return { ok: true, payload: o as unknown as SharePayload };
}
