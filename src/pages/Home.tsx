import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cog, Plus } from "lucide-react";
import { api } from "@/lib/tauri";
import { formatCents } from "@/lib/formatCurrency";
import type { TransactionSummary } from "@/lib/types";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

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
        <div className="flex items-center gap-3">
          <Logo className="size-9" aria-hidden="true" />
          <h1 className="text-3xl font-bold">ScanSplit</h1>
        </div>
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
        {rows?.map((r) => {
          const allPaid = r.peopleCount > 0 && r.paidCount === r.peopleCount;
          const someTracked = r.peopleCount > 0;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between border-b border-border py-3.5"
            >
              <Link to={`/transaction/${r.id}`} className="text-primary hover:underline">
                {r.title}
              </Link>
              <span className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {formatCents(r.totalCents, r.currency)} · {r.peopleCount} people
                </span>
                {allPaid && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2 rounded-full bg-green-500" />
                    <span>Settled</span>
                  </span>
                )}
                {!allPaid && someTracked && (
                  <span>{r.paidCount} of {r.peopleCount} paid</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
