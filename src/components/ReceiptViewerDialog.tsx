import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import type { ReceiptRecord } from "@/lib/types";

interface Props {
  receipts: ReceiptRecord[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CacheEntry {
  dataUrl: string | null;
  loading: boolean;
  error: string | null;
}

export function ReceiptViewerDialog({ receipts, initialIndex, open, onOpenChange }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});

  // Reset index when re-opened.
  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const active = receipts[index];

  // Fetch on first display of each receipt.
  useEffect(() => {
    if (!open || !active) return;
    if (cache[active.id]) return;

    setCache((c) => ({ ...c, [active.id]: { dataUrl: null, loading: true, error: null } }));
    api
      .getReceiptImage(active.id)
      .then((res) => {
        if (!res.bytesBase64) {
          setCache((c) => ({
            ...c,
            [active.id]: { dataUrl: null, loading: false, error: "Image no longer available" },
          }));
          return;
        }
        const dataUrl = `data:${res.mime};base64,${res.bytesBase64}`;
        setCache((c) => ({ ...c, [active.id]: { dataUrl, loading: false, error: null } }));
      })
      .catch((e: unknown) => {
        const err = e as { message?: string };
        const msg = String(err?.message ?? e);
        setCache((c) => ({
          ...c,
          [active.id]: { dataUrl: null, loading: false, error: msg },
        }));
      });
  }, [open, active, cache]);

  // Keyboard nav.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(receipts.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, receipts.length]);

  if (!active) return null;
  const entry = cache[active.id];
  const filename = active.imagePath || "receipt";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogTitle className="text-base">{filename}</DialogTitle>
        <div className="flex min-h-[40vh] items-center justify-center bg-muted/30 p-2">
          {entry?.loading && (
            <div className="text-muted-foreground">Loading…</div>
          )}
          {entry?.error && (
            <div className="text-destructive">{entry.error}</div>
          )}
          {entry?.dataUrl && (
            <img
              src={entry.dataUrl}
              alt={filename}
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
        </div>
        {receipts.length > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm text-muted-foreground">
              {index + 1} / {receipts.length}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next"
              disabled={index === receipts.length - 1}
              onClick={() => setIndex((i) => Math.min(receipts.length - 1, i + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
