import type { SplitResult } from "../lib/splitMath";
import { formatCents } from "../lib/formatCurrency";
import { formatBreakdown } from "../lib/breakdownFormat";
import { SplitMathHelpDialog } from "./SplitMathHelpDialog";

interface Props {
  split: SplitResult;
  personNames: Record<string, string>;
  itemNames: Record<string, string>;
  currency: string;
  paidByPersonId?: Record<string, number | null>;
  onTogglePaid?: (personId: string, nextPaid: boolean) => void;
}

function formatPaidDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function SplitTotalsTable({
  split,
  personNames,
  itemNames,
  currency,
  paidByPersonId,
  onTogglePaid,
}: Props) {
  const showPaid = paidByPersonId !== undefined;
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Per-person totals</span>
        <SplitMathHelpDialog />
      </div>
      <p className="text-xs text-muted-foreground/70">
        Click a name to see how it's calculated.
      </p>
      {showPaid && (
        <p className="pb-1 text-xs text-muted-foreground/70">
          Check the box once someone pays you back.
        </p>
      )}
      {split.perPerson.map((p) => {
        const paidAt = showPaid ? paidByPersonId![p.personId] ?? null : null;
        const isPaid = paidAt != null;
        return (
          <details
            key={p.personId}
            className="border-b border-border py-2 [&_summary]:cursor-pointer"
          >
            <summary className="flex items-center justify-between hover:opacity-80">
              <span className="flex items-center gap-2">
                {showPaid && (
                  <input
                    type="checkbox"
                    aria-label={`Mark ${personNames[p.personId] ?? "person"} paid`}
                    checked={isPaid}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onTogglePaid?.(p.personId, e.target.checked)}
                    className="size-4 cursor-pointer accent-primary"
                  />
                )}
                <span>{personNames[p.personId] ?? "?"}</span>
                {isPaid && paidAt != null && (
                  <span className="text-xs text-muted-foreground">
                    Paid · {formatPaidDate(paidAt)}
                  </span>
                )}
              </span>
              <strong className={isPaid ? "text-muted-foreground line-through" : undefined}>
                {formatCents(p.totalCents, currency)}
              </strong>
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
        );
      })}
      <div className="flex justify-between pt-3 text-sm text-muted-foreground">
        <span>Total</span>
        <span>{formatCents(split.totalCents, currency)}</span>
      </div>
    </div>
  );
}
