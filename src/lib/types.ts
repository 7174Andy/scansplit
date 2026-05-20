export type ItemKind = "item" | "tax" | "tip" | "discount";

export interface Person {
  id: string;
  name: string;
}

export interface LineItem {
  id: string;
  name: string;
  rawCode?: string;
  priceCents: number; // can be negative for discounts
  kind: ItemKind;
  assignedPersonIds: string[]; // empty array = "everyone" at compute time
  receiptId?: string;
}

export interface PersonTotal {
  personId: string;
  totalCents: number;
  itemBreakdown: Array<{ itemId: string; shareCents: number }>;
}

export interface SplitResult {
  perPerson: PersonTotal[];
  totalCents: number;
}
