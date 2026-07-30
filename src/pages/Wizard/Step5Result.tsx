import { useMemo, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy as CopyIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { useWizardStore } from "../../store/wizardStore";
import { computeSplit } from "../../lib/splitMath";
import { SplitTotalsTable } from "../../components/SplitTotalsTable";
import { formatCents } from "../../lib/formatCurrency";
import { api } from "../../lib/tauri";
import { toSharePayload } from "../../lib/shareFromTransaction";
import { buildShareUrl } from "../../lib/shareUrl";

export function Step5Result({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const store = useWizardStore();
  const { items, people, transaction, detectedMerchant, setTitle, setDate } = store;

  const payerName =
    transaction.paidByPersonId != null
      ? people.find((p) => p.id === transaction.paidByPersonId)?.name ?? null
      : null;

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
    const shareUrl = buildShareUrl(
      toSharePayload({
        title: transaction.title,
        currency: transaction.currency,
        date: transaction.date,
        people: people.map((p) => ({ id: p.id, name: p.name })),
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          priceCents: i.priceCents,
          kind: i.kind,
          assignedPersonIds: i.assignedPersonIds,
        })),
      })
    );
    const lines = [
      transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, transaction.currency)}`,
      "",
      `Itemised breakdown: ${shareUrl}`,
    ];
    try {
      await writeText(lines.join("\n"));
    } catch {
      // ignore clipboard failures (e.g., in non-Tauri test mode)
    }
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
    <div>
      <label className="mb-3 block">
        Title:&nbsp;
        <Input
          value={transaction.title}
          onChange={(e) => setTitle(e.target.value)}
          className="inline-block w-80"
        />
      </label>
      <div className="mb-3 block">
        <span>Date:&nbsp;</span>
        <DatePicker value={transaction.date} onChange={setDate} />
      </div>

      {payerName && (
        <p className="mb-2 text-sm text-muted-foreground">
          {payerName} paid. Splitting the rest:
        </p>
      )}
      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={transaction.currency}
        paidByPersonId={{}}
        payerPersonId={transaction.paidByPersonId}
      />

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={save} disabled={saving}>
          <Check className="size-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {err && <p className="mt-2 text-destructive">{err}</p>}
    </div>
  );
}
