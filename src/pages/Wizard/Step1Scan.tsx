import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWizardStore } from "../../store/wizardStore";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { ScanErrorDialog } from "../../components/ScanErrorDialog";
import { api } from "../../lib/tauri";
import type { ParsedReceipt } from "../../lib/types";
import { Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function newId(): string {
  return crypto.randomUUID();
}

export function Step1Scan({ onNext }: { onNext: () => void }) {
  const {
    transaction, receipts, scanStatus, scanErrors, items,
    addReceipt, setScanStatus, mergeParsed, replaceParsed, removeReceipt,
  } = useWizardStore();

  const [picking, setPicking] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{ receiptId: string } | null>(null);
  const [elapsed, setElapsed] = useState<Record<string, number>>({});
  const [hasApiKey, setHasApiKey] = useState(false);

  // Check for API key on mount
  useEffect(() => {
    api.getApiKey().then((key) => setHasApiKey(!!key)).catch(() => setHasApiKey(false));
  }, []);

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
          r.id === id ? { ...r, imagePath: result.imagePath } : r
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

  function needsReview(receiptId: string): boolean {
    const ri = items.filter((i) => i.receiptId === receiptId);
    return ri.some((i) => i.confidence !== "high");
  }

  async function rescanWithClaude(receiptId: string) {
    const r = receipts.find((x) => x.id === receiptId);
    if (!r) return;
    setScanStatus(receiptId, "scanning");
    try {
      const started = performance.now();
      const result = await api.scanReceiptWithClaude(r.imagePath);
      replaceParsed(receiptId, result.parsed);
      setElapsed((m) => ({ ...m, [receiptId]: Math.round(performance.now() - started) }));
      setScanStatus(receiptId, "ok");
    } catch (err: any) {
      setScanStatus(receiptId, "error", String(err));
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
      mergeParsed(receiptId, { merchant: null, items: [], totalsReconciled: true });
    };
    (window as any).__scansplit_seed_low_confidence__ = (receiptId: string, parsed: ParsedReceipt) => {
      const stamped: ParsedReceipt = {
        ...parsed,
        items: parsed.items.map((it) => ({
          ...it,
          confidence: "low" as const,
          confidenceReasons: it.confidenceReasons?.length ? it.confidenceReasons : ["needs review"],
        })),
        totalsReconciled: false,
      };
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "/test/seed.jpg",
        position: receipts.length, scannedAt: 0,
      });
      useWizardStore.getState().mergeParsed(receiptId, stamped);
      useWizardStore.getState().setScanStatus(receiptId, "ok");
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
            {scanStatus[r.id] === "ok" && hasApiKey && needsReview(r.id) && (
              <Button variant="outline" size="sm" onClick={() => rescanWithClaude(r.id)}>
                Rescan with Claude
              </Button>
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
