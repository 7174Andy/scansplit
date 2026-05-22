import type { LineItem, Person, PersonTotal, SplitResult } from "./types";
export type { SplitResult } from "./types";

// Split exactly; leftover cents go to whichever sharer is currently furthest
// from balance in the direction the cent corrects (lowest for charges, highest
// for discounts). Ties broken by id order for determinism.
function allocate(
  amountCents: number,
  sharerIds: string[],
  currentTotals: Map<string, number>
): Map<string, number> {
  const n = sharerIds.length;
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const base = Math.floor(absAmount / n);
  const remainder = absAmount - base * n;
  const out = new Map<string, number>();
  for (const id of sharerIds) out.set(id, sign * base);
  if (remainder === 0) return out;

  const working = new Map<string, number>();
  for (const id of sharerIds) {
    working.set(id, (currentTotals.get(id) ?? 0) + sign * base);
  }
  const isCharge = sign > 0;
  for (let i = 0; i < remainder; i++) {
    let pickId = sharerIds[0];
    let pickTotal = working.get(pickId)!;
    for (let j = 1; j < sharerIds.length; j++) {
      const id = sharerIds[j];
      const t = working.get(id)!;
      if (isCharge ? t < pickTotal : t > pickTotal) {
        pickId = id;
        pickTotal = t;
      } else if (t === pickTotal && id < pickId) {
        pickId = id;
      }
    }
    out.set(pickId, out.get(pickId)! + sign);
    working.set(pickId, pickTotal + sign);
  }
  return out;
}

/**
 * Allocate `amountCents` proportionally to each person's `weight`.
 * Largest-remainder rounding: floor everyone, distribute the leftover cents
 * to the people with the largest fractional remainders (ties broken by id order).
 */
function allocateProportional(
  amountCents: number,
  weights: Map<string, number>
): Map<string, number> {
  const totalWeight = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) {
    const z = new Map<string, number>();
    for (const id of weights.keys()) z.set(id, 0);
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
  let allocated = Array.from(floor.values()).reduce((s, n) => s + n, 0);
  let remainder = absAmount - allocated;
  const order = Array.from(weights.keys()).sort((a, b) => {
    const fa = exact.get(a)! - floor.get(a)!;
    const fb = exact.get(b)! - floor.get(b)!;
    if (fa !== fb) return fb - fa;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (let i = 0; i < remainder; i++) {
    const id = order[i];
    floor.set(id, floor.get(id)! + 1);
  }
  const out = new Map<string, number>();
  for (const [id, v] of floor) out.set(id, sign * v);
  return out;
}

export function computeSplit(
  items: LineItem[],
  people: Person[]
): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [
      p.id,
      { personId: p.id, totalCents: 0, itemBreakdown: [] },
    ])
  );

  // Pass 1: items, exact-sum allocation. Running totals feed back into
  // allocate so leftover cents self-balance across items.
  const running = new Map<string, number>(people.map((p) => [p.id, 0]));
  for (const it of items) {
    if (it.kind !== "item") continue;
    const sharers =
      it.assignedPersonIds.length === 0
        ? people.map((p) => p.id)
        : it.assignedPersonIds;
    const shares = allocate(it.priceCents, sharers, running);
    for (const [pid, share] of shares) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
      running.set(pid, running.get(pid)! + share);
    }
  }

  const subtotalByPerson = new Map<string, number>(
    Array.from(totals.values()).map((t) => [t.personId, t.totalCents])
  );

  // Pass 2: tax and discount stay proportional to item subtotal; tip splits
  // evenly across everyone in the transaction.
  const allIds = people.map((p) => p.id);
  for (const it of items) {
    if (it.kind === "item") continue;
    const shares =
      it.kind === "tip"
        ? allocate(it.priceCents, allIds, running)
        : allocateProportional(it.priceCents, subtotalByPerson);
    for (const [pid, share] of shares) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
      running.set(pid, running.get(pid)! + share);
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
