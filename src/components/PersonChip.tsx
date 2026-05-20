import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  onRemove?: () => void;
  active?: boolean;
  onClick?: () => void;
}

export function PersonChip({ name, onRemove, active, onClick }: Props) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary text-foreground",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${name}`}
          className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-current"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
