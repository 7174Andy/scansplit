import type { SplitResult } from "../lib/splitMath";
import { formatCents } from "../lib/formatCurrency";

interface Props {
  split: SplitResult;
  personNames: Record<string, string>;
  itemNames: Record<string, string>;
  currency: string;
}

export function SplitTotalsTable({ split, personNames, itemNames, currency }: Props) {
  return (
    <div>
      {split.perPerson.map((p) => (
        <details key={p.personId} style={{ borderBottom: "1px solid #2a2a2a", padding: "8px 0" }}>
          <summary style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{personNames[p.personId] ?? "?"}</span>
            <strong>{formatCents(p.totalCents, currency)}</strong>
          </summary>
          <ul style={{ margin: "8px 0 0 16px", color: "#aaa", fontSize: 13 }}>
            {p.itemBreakdown.map((b, i) => (
              <li key={i}>
                {itemNames[b.itemId] ?? b.itemId}: {formatCents(b.shareCents, currency)}
              </li>
            ))}
          </ul>
        </details>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, color: "#888" }}>
        <span>Total</span>
        <span>{formatCents(split.totalCents, currency)}</span>
      </div>
    </div>
  );
}
