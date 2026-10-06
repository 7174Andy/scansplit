import { KIND_ORDER, type SharePayload } from "@/lib/sharePayload";
import type { LineItem, Person } from "@/lib/types";

export interface Reconstructed {
  items: LineItem[];
  people: Person[];
  personNames: Record<string, string>;
  itemNames: Record<string, string>;
}

/**
 * The wire format uses array indices to stay small; computeSplit and
 * SplitTotalsTable are keyed by string IDs. These synthetic IDs are local to
 * this page and never serialized, so they cost nothing in the URL while
 * letting the existing math and table run completely unmodified.
 */
export function reconstruct(payload: SharePayload): Reconstructed {
  const people: Person[] = payload.p.map((name, ix) => ({ id: `p${ix}`, name }));

  const items: LineItem[] = payload.i.map(([name, priceCents, kindIx, assigned], ix) => ({
    id: `i${ix}`,
    name,
    priceCents,
    kind: KIND_ORDER[kindIx],
    // Left empty when empty — an empty array means "everyone" to computeSplit,
    // so filling it in with all person IDs would change the math.
    assignedPersonIds: assigned.map((pIx) => `p${pIx}`),
  }));

  return {
    people,
    items,
    personNames: Object.fromEntries(people.map((p) => [p.id, p.name])),
    itemNames: Object.fromEntries(items.map((i) => [i.id, i.name])),
  };
}
