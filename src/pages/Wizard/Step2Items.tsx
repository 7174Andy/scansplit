import { useWizardStore } from "../../store/wizardStore";
import { ItemRow } from "../../components/ItemRow";

function newId(): string {
  return crypto.randomUUID();
}

export function Step2Items({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { items, transaction, setItem, removeItem, addItem } = useWizardStore();

  const hasItem = items.some((i) => i.kind === "item" && i.priceCents >= 0);

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 2 of 5 — Confirm items</h2>
      <p style={{ color: "#888" }}>
        Fix any OCR mistakes. Edit names and prices, mark tax/tip rows, delete things you don't want.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px 120px 30px",
        gap: 8, padding: "6px 0",
        color: "#4a9eff", fontWeight: 600,
      }}>
        <span>Item</span><span>Price</span><span>Kind</span><span></span>
      </div>

      {items.map((it) => (
        <ItemRow
          key={it.id}
          item={it}
          onChange={(patch) => setItem(it.id, patch)}
          onRemove={() => removeItem(it.id)}
        />
      ))}

      <button
        onClick={() =>
          addItem({
            id: newId(),
            transactionId: transaction.id,
            name: "",
            priceCents: 0,
            kind: "item",
            position: items.length,
            assignedPersonIds: [],
          })
        }
        style={{ marginTop: 12 }}
      >
        + Add row
      </button>

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={onBack}>← Back</button>
        <button disabled={!hasItem} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
