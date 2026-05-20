import { Trash2 } from "lucide-react";
import type { ItemRecord } from "@/lib/types";
import { parseCurrencyToCents, formatCents } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  item: ItemRecord;
  onChange: (patch: Partial<ItemRecord>) => void;
  onRemove: () => void;
}

export function ItemRow({ item, onChange, onRemove }: Props) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px_40px] items-center gap-2 border-b border-border py-2">
      <div>
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {item.rawCode && item.rawCode !== item.name && (
          <div className="mt-0.5 text-xs text-muted-foreground">{item.rawCode}</div>
        )}
      </div>
      <Input
        defaultValue={formatCents(item.priceCents).replace(/[^\d.-]/g, "")}
        onBlur={(e) => {
          const c = parseCurrencyToCents(e.target.value);
          if (c !== null) onChange({ priceCents: c });
        }}
      />
      <select
        value={item.kind}
        onChange={(e) => onChange({ kind: e.target.value as ItemRecord["kind"] })}
        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="item">item</option>
        <option value="tax">tax</option>
        <option value="tip">tip</option>
        <option value="discount">discount</option>
      </select>
      <Button variant="ghost" size="icon" aria-label="Remove row" onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
