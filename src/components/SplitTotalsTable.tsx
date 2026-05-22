import type { SplitResult } from "../lib/splitMath";
import { formatCents } from "../lib/formatCurrency";
import { formatBreakdown } from "../lib/breakdownFormat";
import { SplitMathHelpDialog } from "./SplitMathHelpDialog";

interface Props {
  split: SplitResult;
  personNames: Record<string, string>;
  itemNames: Record<string, string>;
  currency: string;
}

export function SplitTotalsTable({ split, personNames, itemNames, currency }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Per-person totals</span>
        <SplitMathHelpDialog />
      </div>
      <p className="pb-1 text-xs text-muted-foreground/70">
        Click a name to see how it's calculated.
      </p>
      {split.perPerson.map((p) => (
        <details
          key={p.personId}
          className="border-b border-border py-2 [&_summary]:cursor-pointer"
        >
          <summary className="flex justify-between hover:opacity-80">
            <span>{personNames[p.personId] ?? "?"}</span>
            <strong>{formatCents(p.totalCents, currency)}</strong>
          </summary>
          <ul className="mt-2 ml-4 space-y-1 text-sm text-muted-foreground">
            {p.itemBreakdown.map((b, i) => {
              const itemName = itemNames[b.itemId] ?? b.itemId;
              const { main, bump } = formatBreakdown(b, itemName, currency);
              return (
                <li key={i}>
                  {main}
                  {bump && (
                    <span className="ml-2 text-xs text-muted-foreground/70">
                      {bump}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      <div className="flex justify-between pt-3 text-sm text-muted-foreground">
        <span>Total</span>
        <span>{formatCents(split.totalCents, currency)}</span>
      </div>
    </div>
  );
}
