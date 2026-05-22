import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWizardStore } from "../../store/wizardStore";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { ScanErrorDialog } from "../../components/ScanErrorDialog";
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
  const [errorDialog, setErrorDialog] = useState<{ receiptId: string } | null>(null);
  const [elapsed, setElapsed] = useState<Record<string, number>>({});

  // Track which receipts we've already auto-opened a dialog for.
  // When a receipt newly enters the error state (not previously errored), auto-open.
  const prevErrorIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentErrors = new Set(
      receipts.filter((r) => scanStatus[r.id] === "error").map((r) => r.id),
    );
    const newOnes: string[] = [];
    currentErrors.forEach((id) => {
      if (!prevErrorIds.current.has(id)) newOnes.push(id);
    });
    if (newOnes.length > 0) {
      setErrorDialog({ receiptId: newOnes[newOnes.length - 1] });
    }
    prevErrorIds.current = currentErrors;
  }, [scanStatus, receipts]);

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
      const started = performance.now();
      const result = await api.scanReceipt(sourcePath);
      const elapsedMs = Math.round(performance.now() - started);
      useWizardStore.setState((st) => ({
        receipts: st.receipts.map((r) =>
          r.id === id
            ? {
                ...r,
                imagePath: result.imagePath,
                imageBytesBase64: result.imageBytesBase64,
                mime: result.mime,
                byteSize: result.byteSize,
              }
            : r
        ),
      }));
      mergeParsed(id, result.parsed);
      setScanStatus(id, "ok");
      setElapsed((m) => ({ ...m, [id]: elapsedMs }));
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setScanStatus(id, "error", msg);
    }
  }

  const allDone = receipts.length > 0 && receipts.every((r) => scanStatus[r.id] === "ok");

  if (import.meta.env.MODE === "test" && typeof window !== "undefined") {
    const PLACEHOLDER_JPEG_B64 =
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==";
    (window as any).__scansplit_seed__ = (receiptId: string, parsed: any) => {
      const id = receiptId;
      addReceipt({
        id, transactionId: transaction.id, imagePath: "seed.jpg",
        position: receipts.length, scannedAt: 0,
        imageBytesBase64: PLACEHOLDER_JPEG_B64,
        mime: "image/jpeg",
        byteSize: 131,
      } as any);
      setScanStatus(id, "ok");
      mergeParsed(id, parsed);
    };
    (window as any).__scansplit_seed_error__ = (receiptId: string, message: string) => {
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "seed.jpg",
        position: receipts.length, scannedAt: 0,
      });
      setScanStatus(receiptId, "error", message);
    };
    (window as any).__scansplit_seed_empty__ = (receiptId: string) => {
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "seed.jpg",
        position: receipts.length, scannedAt: 0,
        imageBytesBase64: PLACEHOLDER_JPEG_B64,
        mime: "image/jpeg",
        byteSize: 131,
      } as any);
      setScanStatus(receiptId, "ok");
      mergeParsed(receiptId, { merchant: null, items: [] });
    };
  }

  const activeErrorReceipt = errorDialog
    ? receipts.find((r) => r.id === errorDialog.receiptId)
    : undefined;
  const activeErrorMsg = errorDialog ? scanErrors[errorDialog.receiptId] : undefined;

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
          <div key={r.id} className="flex flex-col gap-1">
            <ReceiptThumbnail
              receipt={r}
              status={scanStatus[r.id] ?? "pending"}
              onRemove={() => removeReceipt(r.id)}
              onErrorClick={() => setErrorDialog({ receiptId: r.id })}
            />
            {scanStatus[r.id] === "ok" && elapsed[r.id] !== undefined && (
              <div className="text-xs text-muted-foreground">
                ✓ Scanned in {(elapsed[r.id] / 1000).toFixed(1)} s
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button disabled={!allDone} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>

      {activeErrorReceipt && (
        <ScanErrorDialog
          open={true}
          onOpenChange={(open) => { if (!open) setErrorDialog(null); }}
          filename={activeErrorReceipt.imagePath.split("/").pop() ?? "(unknown)"}
          error={activeErrorMsg ?? "Unknown error"}
          onRetry={() => {
            const id = activeErrorReceipt.id;
            const path = activeErrorReceipt.imagePath;
            setErrorDialog(null);
            // Clear from prevErrorIds so the next failure re-opens the dialog
            prevErrorIds.current.delete(id);
            scanOne(id, path);
          }}
          onRemove={() => {
            const id = activeErrorReceipt.id;
            setErrorDialog(null);
            prevErrorIds.current.delete(id);
            removeReceipt(id);
          }}
        />
      )}
    </div>
  );
}
