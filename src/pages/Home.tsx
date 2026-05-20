import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/tauri";
import { formatCents } from "../lib/formatCurrency";
import type { TransactionSummary } from "../lib/types";
import { useWizardStore } from "../store/wizardStore";

export default function Home() {
  const [rows, setRows] = useState<TransactionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const resetWizard = useWizardStore((s) => s.reset);

  useEffect(() => {
    api.listTransactions().then(setRows).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>ScanSplit</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/settings">Settings</Link>
          <button
            onClick={() => {
              resetWizard();
              navigate("/transaction/new");
            }}
          >
            + New Split
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#e07a7a" }}>{err}</p>}
      {rows === null && <p>Loading…</p>}
      {rows && rows.length === 0 && <p>No saved splits yet. Click "New Split" to start.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {rows?.map((r) => (
          <li
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #333" }}
          >
            <Link to={`/transaction/${r.id}`}>{r.title}</Link>
            <span>
              {formatCents(r.totalCents, r.currency)} · {r.peopleCount} people
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
