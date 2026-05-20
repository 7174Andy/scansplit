import type { LineItem, Person, PersonTotal, SplitResult } from "./types";

export function computeSplit(items: LineItem[], people: Person[]): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [p.id, { personId: p.id, totalCents: 0, itemBreakdown: [] }])
  );

  for (const item of items) {
    if (item.kind !== "item") continue;
    const sharers = item.assignedPersonIds.length === 0
      ? people.map((p) => p.id)
      : item.assignedPersonIds;
    const share = Math.floor(item.priceCents / sharers.length);
    for (const pid of sharers) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: item.id, shareCents: share });
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
