import { useMemo, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { computeSplit } from "../../lib/splitMath";
import { SplitTotalsTable } from "../../components/SplitTotalsTable";
import { formatCents } from "../../lib/formatCurrency";
import { api } from "../../lib/tauri";

export function Step5Result({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const store = useWizardStore();
  const { items, people, transaction, detectedMerchant, setTitle } = store;

  const split = useMemo(() => {
    const lineItems = items.map((i) => ({
      id: i.id, name: i.name, priceCents: i.priceCents,
      kind: i.kind, assignedPersonIds: i.assignedPersonIds,
    }));
    return computeSplit(lineItems, people.map((p) => ({ id: p.id, name: p.name })));
  }, [items, people]);

  const personNames = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(items.map((i) => [i.id, i.name]));

  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    const lines = [
      transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, transaction.currency)}`,
    ];
    await writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const full = store.toFull();
      if (store.isExisting) {
        await api.updateTransaction(full);
      } else {
        await api.createTransaction(full);
      }
      const corrections: Array<[string, string]> = items
        .filter((i) => i.rawCode && i.name && i.rawCode !== i.name)
        .map((i) => [i.rawCode!, i.name]);
      if (corrections.length > 0) {
        await api.recordCodeCorrections(detectedMerchant, corrections);
      }
      navigate(`/transaction/${transaction.id}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 5 of 5 — Result</h2>
      <label style={{ display: "block", marginBottom: 12 }}>
        Title:&nbsp;
        <input
          value={transaction.title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: 6, width: 320 }}
        />
      </label>

      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={transaction.currency}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <button onClick={onBack}>← Back</button>
        <button onClick={copy}>{copied ? "Copied ✓" : "📋 Copy"}</button>
        <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {err && <p style={{ color: "#e07a7a" }}>{err}</p>}
    </div>
  );
}
