import { KIND_ORDER, type SharePayload, type SharedItem } from "./sharePayload";
import type { LineItem, Person } from "./types";

/**
 * Collapses a transaction into the compact wire form: people become array
 * indices (dropping every UUID) and kinds become indices into KIND_ORDER.
 */
export function toSharePayload(args: {
  title: string;
  currency: string;
  date: string;
  people: Person[];
  items: LineItem[];
}): SharePayload {
  const indexOf = new Map(args.people.map((p, ix) => [p.id, ix]));

  const i: SharedItem[] = args.items.map((it) => {
    const kindIx = KIND_ORDER.indexOf(it.kind);
    const assigned = it.assignedPersonIds
      .map((id) => indexOf.get(id))
      // An unknown person id would otherwise become an out-of-range index,
      // which decode rejects as corrupt — indistinguishable from truncation.
      .filter((ix): ix is number => ix !== undefined);
    return [it.name, it.priceCents, kindIx as 0 | 1 | 2 | 3, assigned];
  });

  return {
    v: 1,
    t: args.title,
    c: args.currency,
    d: args.date,
    p: args.people.map((p) => p.name),
    i,
  };
}
