import { invoke } from "@tauri-apps/api/core";
import type {
  FullTransaction,
  TransactionSummary,
  ScanResult,
  ReceiptImagePayload,
} from "./types";

interface TauriApi {
  createTransaction: (full: FullTransaction) => Promise<void>;
  updateTransaction: (full: FullTransaction) => Promise<void>;
  getTransaction: (id: string) => Promise<FullTransaction>;
  listTransactions: () => Promise<TransactionSummary[]>;
  deleteTransaction: (id: string) => Promise<void>;
  getApiKey: () => Promise<string | null>;
  setApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;
  scanReceipt: (sourcePath: string) => Promise<ScanResult>;
  recordCodeCorrections: (
    merchant: string | null,
    corrections: Array<[string, string]>
  ) => Promise<void>;
  getReceiptImage: (receiptId: string) => Promise<ReceiptImagePayload>;
}

const realApi: TauriApi = {
  createTransaction: (full) => invoke<void>("create_transaction", { full }),
  updateTransaction: (full) => invoke<void>("update_transaction", { full }),
  getTransaction: (id) => invoke<FullTransaction>("get_transaction", { id }),
  listTransactions: () => invoke<TransactionSummary[]>("list_transactions"),
  deleteTransaction: (id) => invoke<void>("delete_transaction", { id }),
  getApiKey: () => invoke<string | null>("get_api_key"),
  setApiKey: (key) => invoke<void>("set_api_key", { key }),
  deleteApiKey: () => invoke<void>("delete_api_key"),
  scanReceipt: (sourcePath) => invoke<ScanResult>("scan_receipt", { sourcePath }),
  recordCodeCorrections: (merchant, corrections) =>
    invoke<void>("record_code_corrections", { merchant, corrections }),
  getReceiptImage: (receiptId) =>
    invoke<ReceiptImagePayload>("get_receipt_image", { receiptId }),
};

let lastSaved: FullTransaction | null = null;

const stubApi: TauriApi = {
  createTransaction: async (full) => { lastSaved = full; },
  updateTransaction: async (full) => { lastSaved = full; },
  getTransaction: async (id) => {
    if (lastSaved && lastSaved.transaction.id === id) return lastSaved;
    return {
      transaction: {
        id, title: "Stub", currency: "USD", createdAt: 0, updatedAt: 0,
      },
      people: [], receipts: [], items: [],
    };
  },
  listTransactions: async () =>
    lastSaved
      ? [{
          id: lastSaved.transaction.id,
          title: lastSaved.transaction.title,
          currency: lastSaved.transaction.currency,
          updatedAt: lastSaved.transaction.updatedAt,
          peopleCount: lastSaved.people.length,
          totalCents: lastSaved.items.reduce((s, i) => s + i.priceCents, 0),
        }]
      : [],
  deleteTransaction: async () => { lastSaved = null; },
  getApiKey: async () => "test-key",
  setApiKey: async () => {},
  deleteApiKey: async () => {},
  scanReceipt: async () => {
    throw new Error("scan_receipt is not available in test mode; use the window seed hook");
  },
  recordCodeCorrections: async () => {},
  getReceiptImage: async () => ({
    mime: "image/jpeg",
    bytesBase64:
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==",
    byteSize: 286,
  }),
};

export const api: TauriApi = import.meta.env.MODE === "test" ? stubApi : realApi;
