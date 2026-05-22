import { useMemo } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWizardStore } from "../../store/wizardStore";
import { computeSplit } from "../../lib/splitMath";
import { formatCents } from "../../lib/formatCurrency";
import { PersonChip } from "../../components/PersonChip";
import type { LineItem } from "../../lib/types";

export function Step4Assign({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { items, people, transaction, toggleAssignment } = useWizardStore();

  const split = useMemo(() => {
    const lineItems: LineItem[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      rawCode: i.rawCode ?? undefined,
      priceCents: i.priceCents,
      kind: i.kind,
      assignedPersonIds: i.assignedPersonIds,
      receiptId: i.receiptId ?? undefined,
    }));
    return computeSplit(lineItems, people.map((p) => ({ id: p.id, name: p.name })));
  }, [items, people]);

  return (
    <div>
      <p className="text-muted-foreground">
        Click a person to toggle. Empty = shared by everyone. Tax/tip/discount auto-allocate proportionally.
      </p>

      {items.filter((i) => i.kind === "item").map((it) => (
        <div key={it.id} className="grid grid-cols-[1fr_80px_2fr] items-center gap-3 border-b border-border py-2.5">
          <div className="min-w-0">
            <div className="line-clamp-2" title={it.name}>{it.name}</div>
            <div className="text-[13px] text-muted-foreground">
              {formatCents(it.priceCents, transaction.currency)}
            </div>
          </div>
          <div className="text-[13px] text-muted-foreground">
            {it.assignedPersonIds.length === 0 ? "All" : `${it.assignedPersonIds.length}/${people.length}`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <PersonChip
                key={p.id}
                name={p.name}
                active={
                  it.assignedPersonIds.length === 0 ||
                  it.assignedPersonIds.includes(p.id)
                }
                onClick={() => toggleAssignment(it.id, p.id)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="mt-6 border-t border-border py-3">
        <strong>Running totals</strong>
        <div className="mt-1.5 flex flex-wrap gap-4">
          {split.perPerson.map((p) => {
            const name = people.find((x) => x.id === p.personId)?.name ?? "?";
            return (
              <span key={p.personId}>
                {name}: {formatCents(p.totalCents, transaction.currency)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
