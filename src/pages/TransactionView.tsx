import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "../lib/tauri";
import { computeSplit } from "../lib/splitMath";
import { SplitTotalsTable } from "../components/SplitTotalsTable";
import { formatCents } from "../lib/formatCurrency";
import { useWizardStore } from "../store/wizardStore";
import type { FullTransaction } from "../lib/types";

export default function TransactionView() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [full, setFull] = useState<FullTransaction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loadFrom = useWizardStore((s) => s.loadFrom);

  useEffect(() => {
    api.getTransaction(id).then(setFull).catch((e) => setErr(String(e?.message ?? e)));
  }, [id]);

  const split = useMemo(() => {
    if (!full) return null;
    return computeSplit(
      full.items.map((i) => ({
        id: i.id, name: i.name, priceCents: i.priceCents,
        kind: i.kind, assignedPersonIds: i.assignedPersonIds,
      })),
      full.people.map((p) => ({ id: p.id, name: p.name }))
    );
  }, [full]);

  if (err) return <div style={{ padding: 24, color: "#e07a7a" }}>Error: {err}</div>;
  if (!full || !split) return <div style={{ padding: 24 }}>Loading…</div>;

  const personNames = Object.fromEntries(full.people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(full.items.map((i) => [i.id, i.name]));

  async function copy() {
    if (!full || !split) return;
    const lines = [
      full.transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, full.transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, full.transaction.currency)}`,
    ];
    await writeText(lines.join("\n"));
  }

  async function del() {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    try {
      await api.deleteTransaction(id);
      navigate("/");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  function edit() {
    if (!full) return;
    loadFrom(full);
    navigate("/transaction/new");
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <Link to="/">← Home</Link>
      <h1>{full.transaction.title}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={copy}>📋 Copy</button>
        <button onClick={edit}>Edit</button>
        <button onClick={del}>Delete</button>
      </div>
      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={full.transaction.currency}
      />
    </div>
  );
}
