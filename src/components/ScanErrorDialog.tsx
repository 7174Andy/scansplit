import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertCircle, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  error: string;
  onRetry: () => void;
  onRemove: () => void;
}

export function ScanErrorDialog({
  open,
  onOpenChange,
  filename,
  error,
  onRetry,
  onRemove,
}: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed left-1/2 top-20 z-50 w-full max-w-md -translate-x-1/2",
            "rounded-lg border border-border bg-card p-6 shadow-2xl",
            "duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-semibold">
                Scan failed
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 truncate text-sm text-muted-foreground">
                {filename}
              </DialogPrimitive.Description>
              <p className="mt-3 break-words text-sm">{error}</p>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onRemove}>
              <Trash2 className="size-4" /> Remove
            </Button>
            <Button onClick={onRetry}>
              <RefreshCw className="size-4" /> Retry
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
