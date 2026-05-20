import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/tauri";

export default function Settings() {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getApiKey().then((k) => setHasKey(!!k));
  }, []);

  async function save() {
    setErr(null);
    try {
      await api.setApiKey(key);
      setSaved(true);
      setHasKey(true);
      setKey("");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  async function remove() {
    try {
      await api.deleteApiKey();
      setHasKey(false);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: "0 auto" }}>
      <Link to="/">← Back</Link>
      <h1>Settings</h1>

      <h3>Anthropic API key</h3>
      <p style={{ color: "#888" }}>
        Stored in your OS keychain. Used for receipt OCR via Claude.
      </p>
      <p>{hasKey === null ? "Checking…" : hasKey ? "✅ Key configured" : "❌ No key set"}</p>

      <input
        type="password"
        placeholder="sk-ant-…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={!key}>Save</button>
        {hasKey && <button onClick={remove}>Remove key</button>}
      </div>
      {saved && <p style={{ color: "#6ec96e" }}>Saved.</p>}
      {err && <p style={{ color: "#e07a7a" }}>{err}</p>}
    </div>
  );
}
