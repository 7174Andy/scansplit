import { useMemo } from "react";
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
    <div style={{ padding: 24 }}>
      <h2>Step 4 of 5 — Assign items</h2>
      <p style={{ color: "#888" }}>
        Click a person to toggle. Empty = shared by everyone. Tax/tip/discount auto-allocate proportionally.
      </p>

      {items.filter((i) => i.kind === "item").map((it) => (
        <div key={it.id} style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 2fr",
          gap: 12, padding: "10px 0", borderBottom: "1px solid #2a2a2a",
        }}>
          <div>
            <div>{it.name}</div>
            <div style={{ color: "#888", fontSize: 12 }}>{formatCents(it.priceCents, transaction.currency)}</div>
          </div>
          <div style={{ color: "#666", fontSize: 12 }}>
            {it.assignedPersonIds.length === 0 ? "All" : `${it.assignedPersonIds.length}/${people.length}`}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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

      <div style={{ marginTop: 24, padding: "12px 0", borderTop: "1px solid #444" }}>
        <strong>Running totals</strong>
        <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
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

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={onBack}>← Back</button>
        <button onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
