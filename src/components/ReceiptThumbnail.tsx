import { Receipt, Check, RefreshCw, X } from "lucide-react";
import type { ReceiptRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  error?: string;
  onRemove: () => void;
  onRetry?: () => void;
}

export function ReceiptThumbnail({ receipt, status, error, onRemove, onRetry }: Props) {
  return (
    <div
      className={cn(
        "relative flex w-28 flex-col items-center gap-1.5 rounded-lg border bg-card p-2.5",
        status === "error" ? "border-destructive" : "border-border",
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
        <div className="text-center text-[11px] text-destructive">
          {error}
          {onRetry && (
            <Button variant="ghost" size="icon" aria-label="Retry scan" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      <Button variant="ghost" size="icon" aria-label="Remove receipt" onClick={onRemove}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
