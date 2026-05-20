import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWizardStore } from "../../store/wizardStore";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { api } from "../../lib/tauri";
import { Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function newId(): string {
  return crypto.randomUUID();
}

export function Step1Scan({ onNext }: { onNext: () => void }) {
  const {
    transaction, receipts, scanStatus, scanErrors,
    addReceipt, setScanStatus, mergeParsed, removeReceipt,
  } = useWizardStore();

  const [picking, setPicking] = useState(false);

  async function pickFiles() {
    setPicking(true);
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Receipt", extensions: ["jpg", "jpeg", "png", "heic", "webp", "pdf"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const p of paths) {
        const id = newId();
        addReceipt({
          id, transactionId: transaction.id, imagePath: p,
          position: receipts.length, scannedAt: Math.floor(Date.now() / 1000),
        });
        scanOne(id, p);
      }
    } finally {
      setPicking(false);
    }
  }

  async function scanOne(id: string, sourcePath: string) {
    setScanStatus(id, "scanning");
    try {
      const result = await api.scanReceipt(sourcePath);
      useWizardStore.setState((st) => ({
        receipts: st.receipts.map((r) =>
          r.id === id ? { ...r, imagePath: result.imagePath } : r
        ),
      }));
      mergeParsed(id, result.parsed);
      setScanStatus(id, "ok");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setScanStatus(id, "error", msg);
    }
  }

  const allDone = receipts.length > 0 && receipts.every((r) => scanStatus[r.id] === "ok");

  if (import.meta.env.MODE === "test" && typeof window !== "undefined") {
    (window as any).__scansplit_seed__ = (receiptId: string, parsed: any) => {
      const id = receiptId;
      addReceipt({
        id, transactionId: transaction.id, imagePath: "/test/seed.jpg",
        position: receipts.length, scannedAt: 0,
      });
      setScanStatus(id, "ok");
      mergeParsed(id, parsed);
    };
    (window as any).__scansplit_seed_error__ = (receiptId: string, message: string) => {
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "/test/seed.jpg",
        position: receipts.length, scannedAt: 0,
      });
      setScanStatus(receiptId, "error", message);
    };
    (window as any).__scansplit_seed_empty__ = (receiptId: string) => {
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "/test/seed.jpg",
        position: receipts.length, scannedAt: 0,
      });
      setScanStatus(receiptId, "ok");
      mergeParsed(receiptId, { merchant: null, items: [] });
    };
  }

  return (
    <div>
      <p className="text-muted-foreground">
        Drop receipts to extract line items.
      </p>
      <Button onClick={pickFiles} disabled={picking}>
        <Plus className="size-4" /> Add receipt files
      </Button>
      <div className="mt-4 flex flex-wrap gap-2">
        {receipts.map((r) => (
          <ReceiptThumbnail
            key={r.id}
            receipt={r}
            status={scanStatus[r.id] ?? "pending"}
            error={scanErrors[r.id]}
            onRemove={() => removeReceipt(r.id)}
            onRetry={() => scanOne(r.id, r.imagePath)}
          />
        ))}
      </div>
      <div className="mt-6">
        <Button disabled={!allDone} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
