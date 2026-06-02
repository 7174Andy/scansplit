import type { SplitResult } from "../lib/types";
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
  payerPersonId?: string | null;
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
  payerPersonId,
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
        const isPayer = payerPersonId != null && p.personId === payerPersonId;
        const storedPaidAt = showPaid ? paidByPersonId![p.personId] ?? null : null;
        const isPaid = isPayer || storedPaidAt != null;
        const paidAtForDisplay = isPayer ? null : storedPaidAt;
        // Show the checkbox for all rows when paidByPersonId is provided (old
        // behaviour), UNLESS payerPersonId is set without an onTogglePaid handler
        // (Step 5 / read-only mode). In that case only render the locked payer
        // checkbox so non-payer rows don't show inert, unclickable boxes.
        const noHandlerWithPayer = payerPersonId != null && onTogglePaid === undefined;
        const showCheckbox = showPaid && (isPayer || !noHandlerWithPayer);
        return (
          <details
            key={p.personId}
            className="border-b border-border py-2 [&_summary]:cursor-pointer"
          >
            <summary className="flex items-center justify-between hover:opacity-80">
              <span className="flex items-center gap-2">
                {showCheckbox && (
                  <input
                    type="checkbox"
                    aria-label={`Mark ${personNames[p.personId] ?? "person"} paid`}
                    checked={isPaid}
                    disabled={isPayer}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (isPayer) return;
                      onTogglePaid?.(p.personId, e.target.checked);
                    }}
                    className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                )}
                <span>{personNames[p.personId] ?? "?"}</span>
                {paidAtForDisplay != null && (
                  <span className="text-xs text-muted-foreground">
                    Paid · {formatPaidDate(paidAtForDisplay)}
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
