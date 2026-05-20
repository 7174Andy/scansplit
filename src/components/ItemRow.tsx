import type { ItemRecord } from "../lib/types";
import { parseCurrencyToCents, formatCents } from "../lib/formatCurrency";

interface Props {
  item: ItemRecord;
  onChange: (patch: Partial<ItemRecord>) => void;
  onRemove: () => void;
}

export function ItemRow({ item, onChange, onRemove }: Props) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 120px 120px 30px",
      gap: 8, padding: "6px 0",
      borderBottom: "1px solid #2a2a2a", alignItems: "center",
    }}>
      <div>
        <input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ width: "100%", padding: 4 }}
        />
        {item.rawCode && item.rawCode !== item.name && (
          <div style={{ fontSize: 11, color: "#666" }}>{item.rawCode}</div>
        )}
      </div>
      <input
        defaultValue={formatCents(item.priceCents).replace(/[^\d.-]/g, "")}
        onBlur={(e) => {
          const c = parseCurrencyToCents(e.target.value);
          if (c !== null) onChange({ priceCents: c });
        }}
        style={{ width: "100%", padding: 4 }}
      />
      <select
        value={item.kind}
        onChange={(e) => onChange({ kind: e.target.value as ItemRecord["kind"] })}
      >
        <option value="item">item</option>
        <option value="tax">tax</option>
        <option value="tip">tip</option>
        <option value="discount">discount</option>
      </select>
      <button onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}
