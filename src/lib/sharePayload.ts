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

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(inflateSync(fromBase64Url(trimmed))));
  } catch {
    return { ok: false, error: "corrupt" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "corrupt" };
  }
  const o = parsed as Record<string, unknown>;

  // Version is checked before shape, so a future format gets the accurate
  // message instead of being reported as corrupt.
  if (o.v !== 1) return { ok: false, error: "version" };

  if (
    typeof o.t !== "string" ||
    typeof o.c !== "string" ||
    typeof o.d !== "string" ||
    !Array.isArray(o.p) ||
    !Array.isArray(o.i) ||
    !o.p.every((n) => typeof n === "string")
  ) {
    return { ok: false, error: "corrupt" };
  }

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
