import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  FullTransaction,
  ItemRecord,
  ParsedReceipt,
  PersonRecord,
  ReceiptRecord,
  ScanStage,
  TransactionMeta,
} from "../lib/types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  transaction: TransactionMeta;
  receipts: ReceiptRecord[];
  scanStatus: Record<string, "pending" | "scanning" | "ok" | "error">;
  scanStage: Record<string, ScanStage>;
  scanErrors: Record<string, string>;
  items: ItemRecord[];
  people: PersonRecord[];
  step: WizardStep;
  detectedMerchant: string | null;
  isExisting: boolean;

  reset: (id?: string) => void;
  loadFrom: (full: FullTransaction) => void;
  setStep: (s: WizardStep) => void;

  addReceipt: (r: ReceiptRecord) => void;
  setScanStatus: (id: string, status: WizardState["scanStatus"][string], err?: string) => void;
  setScanStage: (id: string, stage: ScanStage) => void;
  mergeParsed: (receiptId: string, parsed: ParsedReceipt) => void;
  removeReceipt: (id: string) => void;

  setItem: (id: string, patch: Partial<ItemRecord>) => void;
  addItem: (it: ItemRecord) => void;
  removeItem: (id: string) => void;

  setPeople: (people: PersonRecord[]) => void;
  addPerson: (name: string) => void;
  removePerson: (id: string) => void;

  toggleAssignment: (itemId: string, personId: string) => void;
  setTitle: (t: string) => void;

  toFull: () => FullTransaction;
}

function newId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function emptyMeta(id?: string): TransactionMeta {
  const t = now();
  return {
    id: id ?? newId(),
    title: "Split — " + new Date().toLocaleDateString(),
    currency: "USD",
    createdAt: t,
    updatedAt: t,
  };
}

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      transaction: emptyMeta(),
      receipts: [],
      scanStatus: {},
      scanStage: {},
      scanErrors: {},
      items: [],
      people: [],
      step: 1,
      detectedMerchant: null,
      isExisting: false,

      reset: (id) => set({
        transaction: emptyMeta(id),
        receipts: [],
        scanStatus: {},
        scanStage: {},
        scanErrors: {},
        items: [],
        people: [],
        step: 1,
        detectedMerchant: null,
        isExisting: false,
      }),

      loadFrom: (full) => set({
        transaction: full.transaction,
        receipts: full.receipts,
        scanStatus: Object.fromEntries(full.receipts.map((r) => [r.id, "ok"])),
        scanStage: {},
        scanErrors: {},
        items: full.items,
        people: full.people,
        step: 2,
        detectedMerchant: null,
        isExisting: true,
      }),

      setStep: (s) => set({ step: s }),

      addReceipt: (r) => set((st) => ({
        receipts: [...st.receipts, r],
        scanStatus: { ...st.scanStatus, [r.id]: "pending" },
      })),

      setScanStatus: (id, status, err) => set((st) => {
        const isTerminal = status === "ok" || status === "error";
        let nextStage = st.scanStage;
        if (isTerminal && st.scanStage[id] !== undefined) {
          const { [id]: _stage, ...rest } = st.scanStage;
          nextStage = rest;
        }
        return {
          scanStatus: { ...st.scanStatus, [id]: status },
          scanStage: nextStage,
          scanErrors: err ? { ...st.scanErrors, [id]: err } : st.scanErrors,
        };
      }),

      setScanStage: (id, stage) => set((st) => ({
        scanStage: { ...st.scanStage, [id]: stage },
      })),

      mergeParsed: (receiptId, parsed) => set((st) => {
        const baseIndex = st.items.filter((i) => i.receiptId === receiptId).length;
        const newItems: ItemRecord[] = parsed.items.map((p, idx) => ({
          id: newId(),
          transactionId: st.transaction.id,
          receiptId,
          rawCode: p.raw,
          name: p.name ?? p.raw,
          priceCents: p.priceCents,
          kind: p.kind,
          position: st.items.length + baseIndex + idx,
          assignedPersonIds: [],
        }));
        return {
          items: [...st.items, ...newItems],
          detectedMerchant: st.detectedMerchant ?? parsed.merchant ?? null,
        };
      }),

      removeReceipt: (id) => set((st) => {
        const { [id]: _status, ...remStatus } = st.scanStatus;
        const { [id]: _err, ...remErrors } = st.scanErrors;
        const { [id]: _stage, ...remStage } = st.scanStage;
        return {
          receipts: st.receipts.filter((r) => r.id !== id),
          items: st.items.filter((i) => i.receiptId !== id),
          scanStatus: remStatus,
          scanStage: remStage,
          scanErrors: remErrors,
        };
      }),

      setItem: (id, patch) => set((st) => ({
        items: st.items.map((i) => (i.id !== id ? i : { ...i, ...patch })),
      })),

      addItem: (it) => set((st) => ({ items: [...st.items, it] })),

      removeItem: (id) => set((st) => ({
        items: st.items.filter((i) => i.id !== id),
      })),

      setPeople: (people) => set({ people }),

      addPerson: (name) => set((st) => ({
        people: [
          ...st.people,
          { id: newId(), transactionId: st.transaction.id, name, position: st.people.length, paidAt: null },
        ],
      })),

      removePerson: (id) => set((st) => {
        const remainingIds = st.people
          .filter((p) => p.id !== id)
          .map((p) => p.id);
        return {
          people: st.people.filter((p) => p.id !== id),
          items: st.items.map((i) => {
            const filtered = i.assignedPersonIds.filter((p) => p !== id);
            const isEveryone =
              remainingIds.length > 1 &&
              filtered.length === remainingIds.length &&
              remainingIds.every((rid) => filtered.includes(rid));
            return { ...i, assignedPersonIds: isEveryone ? [] : filtered };
          }),
        };
      }),

      toggleAssignment: (itemId, personId) => set((st) => {
        const allIds = st.people.map((p) => p.id);
        return {
          items: st.items.map((i) => {
            if (i.id !== itemId) return i;
            // With 2+ people, an empty array visually means "all chips active".
            // Clicking a chip should deselect that one person, so expand to
            // the explicit set before toggling.
            const expandEmpty =
              i.assignedPersonIds.length === 0 && allIds.length > 1;
            const current = expandEmpty ? allIds : i.assignedPersonIds;
            const has = current.includes(personId);
            let next = has
              ? current.filter((p) => p !== personId)
              : [...current, personId];
            // Canonicalize "everyone selected" back to [] so the UI label
            // reads "All" and the convention in splitMath holds.
            if (
              allIds.length > 1 &&
              next.length === allIds.length &&
              allIds.every((id) => next.includes(id))
            ) {
              next = [];
            }
            return { ...i, assignedPersonIds: next };
          }),
        };
      }),

      setTitle: (t) => set((st) => ({
        transaction: { ...st.transaction, title: t, updatedAt: now() },
      })),

      toFull: (): FullTransaction => {
        const st = get();
        return {
          transaction: { ...st.transaction, updatedAt: now() },
          people: st.people,
          receipts: st.receipts,
          items: st.items,
        };
      },
    }),
    {
      name: "scansplit-wizard",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
