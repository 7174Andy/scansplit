import type { LineItem, Person, PersonTotal, ShareLine, SplitResult } from "./types";
export type { SplitResult } from "./types";

// Split exactly; leftover cents go to whichever sharer is currently furthest
// from balance in the direction the cent corrects (lowest for charges, highest
// for discounts). Ties broken POSITIONALLY — see the note in `allocate`.
interface AllocEntry {
  share: number;
  bumped: number;
}

function allocate(
  amountCents: number,
  sharerIds: string[],
  currentTotals: Map<string, number>
): Map<string, AllocEntry> {
  const n = sharerIds.length;
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const base = Math.floor(absAmount / n);
  const remainder = absAmount - base * n;
  const out = new Map<string, AllocEntry>();
  for (const id of sharerIds) out.set(id, { share: sign * base, bumped: 0 });
  if (remainder === 0) return out;

  const working = new Map<string, number>();
  for (const id of sharerIds) {
    working.set(id, (currentTotals.get(id) ?? 0) + sign * base);
  }
  const isCharge = sign > 0;
  for (let i = 0; i < remainder; i++) {
    // TIE-BREAK IS POSITIONAL ON PURPOSE. `pickId` starts at sharerIds[0] and
    // is only replaced on a STRICTLY better comparison below, so an exact tie
    // leaves the earliest-listed sharer holding the cent. Do not add an
    // `id < pickId` tie-break: the share page (src/share/reconstruct.ts)
    // rebuilds people as `p0..pN` from their array index, while the desktop app
    // passes real UUIDs whose order is random relative to display order. Any
    // ID-derived ordering makes the two sides hand the leftover cent to
    // different people — and one clipboard paste carries both sets of numbers.
    let pickId = sharerIds[0];
    let pickTotal = working.get(pickId)!;
    for (let j = 1; j < sharerIds.length; j++) {
      const id = sharerIds[j];
      const t = working.get(id)!;
      if (isCharge ? t < pickTotal : t > pickTotal) {
        pickId = id;
        pickTotal = t;
      }
    }
    const cur = out.get(pickId)!;
    out.set(pickId, { share: cur.share + sign, bumped: cur.bumped + sign });
    working.set(pickId, pickTotal + sign);
  }
  return out;
}

/**
 * Allocate `amountCents` proportionally to each person's `weight`.
 * Largest-remainder rounding: floor everyone, distribute the leftover cents
 * to the people with the largest fractional remainders (ties broken
 * positionally — see the note on the comparator).
 */
function allocateProportional(
  amountCents: number,
  weights: Map<string, number>
): Map<string, AllocEntry> {
  const totalWeight = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) {
    const z = new Map<string, AllocEntry>();
    for (const id of weights.keys()) z.set(id, { share: 0, bumped: 0 });
    return z;
  }
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const exact = new Map<string, number>();
  const floor = new Map<string, number>();
  for (const [id, w] of weights) {
    const e = (w * absAmount) / totalWeight;
    exact.set(id, e);
    floor.set(id, Math.floor(e));
  }
  const allocated = Array.from(floor.values()).reduce((s, n) => s + n, 0);
  const remainder = absAmount - allocated;
  const order = Array.from(weights.keys()).sort((a, b) => {
    const fa = exact.get(a)! - floor.get(a)!;
    const fb = exact.get(b)! - floor.get(b)!;
    if (fa !== fb) return fb - fa;
    // TIE-BREAK IS POSITIONAL ON PURPOSE. Array.prototype.sort is stable
    // (ES2019+) and `weights` is a Map built in `people` order, so returning 0
    // keeps equal-remainder people in display order. Do not compare the ids:
    // the share page rebuilds people as `p0..pN` from their array index while
    // the desktop app passes real UUIDs, so an ID-derived tie-break would give
    // the leftover cent to different people on the two sides.
    return 0;
  });
  const bumpedSet = new Set<string>();
  for (let i = 0; i < remainder; i++) {
    const id = order[i];
    floor.set(id, floor.get(id)! + 1);
    bumpedSet.add(id);
  }
  const out = new Map<string, AllocEntry>();
  for (const [id, v] of floor) {
    out.set(id, { share: sign * v, bumped: bumpedSet.has(id) ? sign : 0 });
  }
  return out;
}

export function computeSplit(
  items: LineItem[],
  people: Person[]
): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [
      p.id,
      { personId: p.id, totalCents: 0, itemBreakdown: [] as ShareLine[] },
    ])
  );

  // Pass 1: items, exact-sum allocation. Running totals feed back into
  // allocate so leftover cents self-balance across items.
  const running = new Map<string, number>(people.map((p) => [p.id, 0]));
  for (const it of items) {
    if (it.kind !== "item") continue;
    const isEveryone = it.assignedPersonIds.length === 0;
    const sharers = isEveryone ? people.map((p) => p.id) : it.assignedPersonIds;
    const shares = allocate(it.priceCents, sharers, running);
    for (const [pid, { share, bumped }] of shares) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({
        itemId: it.id,
        shareCents: share,
        itemKind: "item",
        itemPriceCents: it.priceCents,
        sharerCount: sharers.length,
        isEveryone,
        bumpedCents: bumped,
      });
      running.set(pid, running.get(pid)! + share);
    }
  }

  const subtotalByPerson = new Map<string, number>(
    Array.from(totals.values()).map((t) => [t.personId, t.totalCents])
  );
  const totalSubtotal = Array.from(subtotalByPerson.values()).reduce(
    (s, v) => s + v,
    0
  );

  // Pass 2: tax and discount stay proportional to item subtotal; tip splits
  // evenly across everyone in the transaction.
  const allIds = people.map((p) => p.id);
  for (const it of items) {
    if (it.kind === "item") continue;
    if (it.kind === "tip") {
      const shares = allocate(it.priceCents, allIds, running);
      for (const [pid, { share, bumped }] of shares) {
        const t = totals.get(pid)!;
        t.totalCents += share;
        t.itemBreakdown.push({
          itemId: it.id,
          shareCents: share,
          itemKind: "tip",
          itemPriceCents: it.priceCents,
          sharerCount: allIds.length,
          isEveryone: true,
          bumpedCents: bumped,
        });
        running.set(pid, running.get(pid)! + share);
      }
    } else {
      const shares = allocateProportional(it.priceCents, subtotalByPerson);
      for (const [pid, { share, bumped }] of shares) {
        const t = totals.get(pid)!;
        const personSubtotal = subtotalByPerson.get(pid) ?? 0;
        const weightBasisPoints =
          totalSubtotal === 0
            ? 0
            : Math.round((personSubtotal / totalSubtotal) * 10000);
        t.totalCents += share;
        t.itemBreakdown.push({
          itemId: it.id,
          shareCents: share,
          itemKind: it.kind,
          itemPriceCents: it.priceCents,
          sharerCount: allIds.length,
          isEveryone: true,
          weightBasisPoints,
          bumpedCents: bumped,
        });
        running.set(pid, running.get(pid)! + share);
      }
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
