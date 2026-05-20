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

export interface TransactionMeta {
  id: string;
  title: string;
  currency: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReceiptRecord {
  id: string;
  transactionId: string;
  imagePath: string;
  position: number;
  scannedAt: number;
}

export interface PersonRecord {
  id: string;
  transactionId: string;
  name: string;
  position: number;
}

export interface ItemRecord {
  id: string;
  transactionId: string;
  receiptId?: string | null;
  rawCode?: string | null;
  name: string;
  priceCents: number;
  kind: "item" | "tax" | "tip" | "discount";
  position: number;
  assignedPersonIds: string[];
}

export interface FullTransaction {
  transaction: TransactionMeta;
  people: PersonRecord[];
  receipts: ReceiptRecord[];
  items: ItemRecord[];
}

export interface TransactionSummary {
  id: string;
  title: string;
  currency: string;
  updatedAt: number;
  peopleCount: number;
  totalCents: number;
}

export interface ParsedItem {
  raw: string;
  name: string | null;
  priceCents: number;
  kind: "item" | "tax" | "tip" | "discount";
}

export interface ParsedReceipt {
  merchant: string | null;
  items: ParsedItem[];
}

export interface ScanResult {
  imagePath: string;
  parsed: ParsedReceipt;
}

export interface AppErrorPayload {
  code: string;
  message: string;
}
