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

export interface ShareLine {
  itemId: string;
  shareCents: number;
  itemKind: ItemKind;
  itemPriceCents: number;
  sharerCount: number;
  isEveryone: boolean;
  weightBasisPoints?: number;
  bumpedCents: number;
}

export interface PersonTotal {
  personId: string;
  totalCents: number;
  itemBreakdown: ShareLine[];
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
  paidByPersonId: string | null;
  date: string; // calendar date, YYYY-MM-DD (local)
}

export interface ReceiptRecord {
  id: string;
  transactionId: string;
  imagePath: string;
  position: number;
  scannedAt: number;
  // present in-memory during the wizard (set by scan, sent to Rust on save).
  // absent on the response from get_transaction.
  imageBytesBase64?: string;
  mime?: string;
  byteSize?: number;
}

export interface PersonRecord {
  id: string;
  transactionId: string;
  name: string;
  position: number;
  paidAt: number | null;
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
  paidCount: number;
  totalCents: number;
  date: string; // calendar date, YYYY-MM-DD (local)
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
  imageBytesBase64: string;
  mime: string;
  byteSize: number;
  parsed: ParsedReceipt;
}

export interface ReceiptImagePayload {
  mime: string;
  bytesBase64: string;
  byteSize: number;
}

export interface AppErrorPayload {
  code: string;
  message: string;
}

export type ScanStage = "prepare" | "anthropic" | "finalize";

export interface ScanProgressEvent {
  receiptId: string;
  stage: ScanStage;
}
