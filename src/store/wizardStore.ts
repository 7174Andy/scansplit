import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  FullTransaction,
  ItemRecord,
  ParsedReceipt,
  PersonRecord,
  ReceiptRecord,
  TransactionMeta,
} from "../lib/types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  transaction: TransactionMeta;
  receipts: ReceiptRecord[];
  scanStatus: Record<string, "pending" | "scanning" | "ok" | "error">;
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

      setScanStatus: (id, status, err) => set((st) => ({
        scanStatus: { ...st.scanStatus, [id]: status },
        scanErrors: err ? { ...st.scanErrors, [id]: err } : st.scanErrors,
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
        const { [id]: _, ...remStatus } = st.scanStatus;
        const { [id]: __, ...remErrors } = st.scanErrors;
        return {
          receipts: st.receipts.filter((r) => r.id !== id),
          items: st.items.filter((i) => i.receiptId !== id),
          scanStatus: remStatus,
          scanErrors: remErrors,
        };
      }),

      setItem: (id, patch) => set((st) => ({
        items: st.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      })),

      addItem: (it) => set((st) => ({ items: [...st.items, it] })),

      removeItem: (id) => set((st) => ({
        items: st.items.filter((i) => i.id !== id),
      })),

      setPeople: (people) => set({ people }),

      addPerson: (name) => set((st) => ({
        people: [
          ...st.people,
          { id: newId(), transactionId: st.transaction.id, name, position: st.people.length },
        ],
      })),

      removePerson: (id) => set((st) => ({
        people: st.people.filter((p) => p.id !== id),
        items: st.items.map((i) => ({
          ...i,
          assignedPersonIds: i.assignedPersonIds.filter((p) => p !== id),
        })),
      })),

      toggleAssignment: (itemId, personId) => set((st) => ({
        items: st.items.map((i) => {
          if (i.id !== itemId) return i;
          const has = i.assignedPersonIds.includes(personId);
          return {
            ...i,
            assignedPersonIds: has
              ? i.assignedPersonIds.filter((p) => p !== personId)
              : [...i.assignedPersonIds, personId],
          };
        }),
      })),

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
