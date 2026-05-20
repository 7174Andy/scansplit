import type { LineItem, Person, PersonTotal, SplitResult } from "./types";

export function computeSplit(items: LineItem[], people: Person[]): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [p.id, { personId: p.id, totalCents: 0, itemBreakdown: [] }])
  );

  // Pass 1: items
  for (const it of items) {
    if (it.kind !== "item") continue;
    const sharers = it.assignedPersonIds.length === 0
      ? people.map((p) => p.id)
      : it.assignedPersonIds;
    const share = Math.floor(it.priceCents / sharers.length);
    for (const pid of sharers) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
    }
  }

  const subtotalByPerson = new Map<string, number>(
    Array.from(totals.values()).map((t) => [t.personId, t.totalCents])
  );
  const subtotalTotal = Array.from(subtotalByPerson.values()).reduce(
    (s, n) => s + n,
    0
  );

  // Pass 2: tax / tip / discount allocated proportionally to person subtotal
  for (const it of items) {
    if (it.kind === "item") continue;
    if (subtotalTotal === 0) continue;
    for (const pid of subtotalByPerson.keys()) {
      const ps = subtotalByPerson.get(pid)!;
      const share = Math.floor((ps * it.priceCents) / subtotalTotal);
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
