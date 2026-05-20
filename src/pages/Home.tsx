import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cog, Plus } from "lucide-react";
import { api } from "@/lib/tauri";
import { formatCents } from "@/lib/formatCurrency";
import type { TransactionSummary } from "@/lib/types";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [rows, setRows] = useState<TransactionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const resetWizard = useWizardStore((s) => s.reset);

  useEffect(() => {
    api.listTransactions().then(setRows).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">ScanSplit</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate("/settings")}>
            <Cog className="size-4" /> Settings
          </Button>
          <Button
            onClick={() => {
              resetWizard();
              navigate("/transaction/new");
            }}
          >
            <Plus className="size-4" /> New Split
          </Button>
        </div>
      </div>

      {err && <p className="text-destructive">{err}</p>}
      {rows === null && <p className="text-muted-foreground">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="text-muted-foreground">
          No saved splits yet. Click "New Split" to start.
        </p>
      )}

      <ul className="m-0 list-none p-0">
        {rows?.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between border-b border-border py-3.5"
          >
            <Link to={`/transaction/${r.id}`} className="text-primary hover:underline">
              {r.title}
            </Link>
            <span className="text-sm text-muted-foreground">
              {formatCents(r.totalCents, r.currency)} · {r.peopleCount} people
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
