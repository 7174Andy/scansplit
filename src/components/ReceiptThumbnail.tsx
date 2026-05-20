import { Receipt, Check, AlertCircle, X } from "lucide-react";
import type { ReceiptRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  onRemove: () => void;
  onErrorClick?: () => void;
}

export function ReceiptThumbnail({ receipt, status, onRemove, onErrorClick }: Props) {
  const clickable = status === "error" && !!onErrorClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onErrorClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onErrorClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "relative flex w-28 flex-col items-center gap-1.5 rounded-lg border bg-card p-2.5",
        status === "error"
          ? "cursor-pointer border-destructive hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          : "border-border",
      )}
    >
      <Receipt className="size-8" />
      <div className="break-all text-center text-[11px] text-muted-foreground">
        {receipt.imagePath.split("/").pop()}
      </div>
      {status === "scanning" && (
        <div className="text-xs text-muted-foreground">scanning…</div>
      )}
      {status === "ok" && (
        <div className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="size-3" /> done
        </div>
      )}
      {status === "error" && (
        <div className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" /> error
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove receipt"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
