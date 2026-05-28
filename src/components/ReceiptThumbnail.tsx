import { Receipt, Check, AlertCircle, X } from "lucide-react";
import type { ReceiptRecord, ScanStage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScanProgressRing } from "@/components/ScanProgressRing";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  stage?: ScanStage;
  onRemove: () => void;
  onErrorClick?: () => void;
}

const STAGE_LABEL: Record<ScanStage, string> = {
  prepare: "Preparing…",
  anthropic: "Analyzing receipt…",
  finalize: "Finalizing…",
};

export function ReceiptThumbnail({ receipt, status, stage, onRemove, onErrorClick }: Props) {
  const clickable = status === "error" && !!onErrorClick;
  const scanning = status === "scanning";
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
      {scanning && (
        <div className="text-xs text-muted-foreground">
          {STAGE_LABEL[stage ?? "prepare"]}
        </div>
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
      {scanning ? (
        <ScanProgressRing
          stage={stage ?? "prepare"}
          onRemove={onRemove}
        />
      ) : (
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
      )}
    </div>
  );
}
