import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy as CopyIcon, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "@/lib/tauri";
import { computeSplit } from "@/lib/splitMath";
import { SplitTotalsTable } from "@/components/SplitTotalsTable";
import { ReceiptViewerDialog } from "@/components/ReceiptViewerDialog";
import { formatCents } from "@/lib/formatCurrency";
import { formatDate } from "@/lib/formatDate";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import type { FullTransaction } from "@/lib/types";
import { toSharePayload } from "../lib/shareFromTransaction";
import { buildShareUrl } from "../lib/shareUrl";

export default function TransactionView() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [full, setFull] = useState<FullTransaction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });
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

  if (err && !full) return <div className="p-6 text-destructive">Error: {err}</div>;
  if (!full || !split) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const personNames = Object.fromEntries(full.people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(full.items.map((i) => [i.id, i.name]));
  const paidByPersonId = Object.fromEntries(full.people.map((p) => [p.id, p.paidAt]));
  const payerName =
    full.transaction.paidByPersonId != null
      ? full.people.find((p) => p.id === full.transaction.paidByPersonId)?.name ?? null
      : null;

  async function togglePaid(personId: string, nextPaid: boolean) {
    if (!full) return;
    const prev = full;
    const optimistic: FullTransaction = {
      ...full,
      people: full.people.map((p) =>
        p.id === personId ? { ...p, paidAt: nextPaid ? Date.now() : null } : p
      ),
    };
    setFull(optimistic);
    setErr(null);
    try {
      await api.setPersonPaid(personId, nextPaid);
    } catch (e: any) {
      setFull(prev);
      setErr(String(e?.message ?? e));
    }
  }

  async function copy() {
    if (!full || !split) return;
    const shareUrl = buildShareUrl(
      toSharePayload({
        title: full.transaction.title,
        currency: full.transaction.currency,
        date: full.transaction.date,
        people: full.people.map((p) => ({ id: p.id, name: p.name })),
        items: full.items.map((i) => ({
          id: i.id,
          name: i.name,
          priceCents: i.priceCents,
          kind: i.kind,
          assignedPersonIds: i.assignedPersonIds,
        })),
      })
    );
    const lines = [
      full.transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, full.transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, full.transaction.currency)}`,
      "",
      `Itemised breakdown: ${shareUrl}`,
    ];
    try {
      await writeText(lines.join("\n"));
    } catch {
      // ignore in test mode
    }
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

  const hasReceipts = full.receipts.length > 0;
  const viewLabel = full.receipts.length > 1 ? "View receipts" : "View receipt";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button variant="ghost" onClick={() => navigate("/")}>
        <ArrowLeft className="size-4" /> Home
      </Button>
      <h1 className="mt-4 mb-3 text-3xl font-bold">{full.transaction.title}</h1>
      <p className="mb-3 text-sm text-muted-foreground">{formatDate(full.transaction.date)}</p>
      <div className="mb-4 flex gap-2">
        <Button variant="outline" onClick={copy}>
          <CopyIcon className="size-4" /> Copy
        </Button>
        {hasReceipts && (
          <Button variant="outline" onClick={() => setViewer({ open: true, index: 0 })}>
            <ImageIcon className="size-4" /> {viewLabel}
          </Button>
        )}
        <Button variant="outline" onClick={edit}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button variant="destructive" onClick={del}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
      {err && <p className="mb-2 text-destructive">{err}</p>}
      {payerName && (
        <p className="mb-2 text-sm text-muted-foreground">
          {payerName} paid. Splitting the rest:
        </p>
      )}
      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={full.transaction.currency}
        paidByPersonId={paidByPersonId}
        onTogglePaid={togglePaid}
        payerPersonId={full.transaction.paidByPersonId}
      />

      <ReceiptViewerDialog
        receipts={full.receipts}
        initialIndex={viewer.index}
        open={viewer.open}
        onOpenChange={(o) => setViewer((v) => ({ ...v, open: o }))}
      />
    </div>
  );
}
