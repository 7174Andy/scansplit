import { invoke } from "@tauri-apps/api/core";
import type {
  FullTransaction,
  TransactionSummary,
  ScanResult,
} from "./types";

export const api = {
  createTransaction: (full: FullTransaction) =>
    invoke<void>("create_transaction", { full }),

  updateTransaction: (full: FullTransaction) =>
    invoke<void>("update_transaction", { full }),

  getTransaction: (id: string) =>
    invoke<FullTransaction>("get_transaction", { id }),

  listTransactions: () =>
    invoke<TransactionSummary[]>("list_transactions"),

  deleteTransaction: (id: string) =>
    invoke<void>("delete_transaction", { id }),

  getApiKey: () => invoke<string | null>("get_api_key"),
  setApiKey: (key: string) => invoke<void>("set_api_key", { key }),
  deleteApiKey: () => invoke<void>("delete_api_key"),

  scanReceipt: (sourcePath: string) =>
    invoke<ScanResult>("scan_receipt", { sourcePath }),

  recordCodeCorrections: (
    merchant: string | null,
    corrections: Array<[string, string]>
  ) => invoke<void>("record_code_corrections", { merchant, corrections }),
};
