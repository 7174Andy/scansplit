import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Trash2, Pencil } from "lucide-react";
import { api } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Settings() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getApiKey().then((k) => setHasKey(!!k));
  }, []);

  async function save(): Promise<boolean> {
    setErr(null);
    try {
      await api.setApiKey(key);
      setSaved(true);
      setHasKey(true);
      setKey("");
      return true;
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      return false;
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

  async function backOrSaveAndBack() {
    if (key.length > 0) {
      const ok = await save();
      if (!ok) return;
    }
    navigate("/");
  }

  const dirty = key.length > 0;

  return (
    <div className="mx-auto max-w-xl p-8">
      <Button
        variant={dirty ? "default" : "ghost"}
        onClick={backOrSaveAndBack}
      >
        {dirty ? <Check className="size-4" /> : <ArrowLeft className="size-4" />}
        {dirty ? "Save & Back" : "Back"}
      </Button>

      <h1 className="mt-6 text-3xl font-bold">Settings</h1>

      <h3 className="mt-4 text-lg font-semibold">Anthropic API key</h3>
      <p className="text-muted-foreground">
        ScanSplit uses Claude to read receipts. You'll need an Anthropic API
        key to scan anything — get one at console.anthropic.com.
      </p>
      {hasKey === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking…</p>
      ) : hasKey ? (
        <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" /> Key configured
          </span>
          <Button variant="destructive" size="sm" onClick={remove}>
            <Trash2 className="size-4" /> Remove key
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-3 mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <X className="size-4" /> No key set
          </p>

          <Input
            type="password"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mb-2"
          />

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={!key}>
              <Check className="size-4" /> Save
            </Button>
            {dirty && (
              <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                <Pencil className="size-3.5" /> Unsaved
              </span>
            )}
            {saved && !dirty && (
              <span className="inline-flex items-center gap-1 text-[13px] text-success">
                <Check className="size-3.5" /> Saved
              </span>
            )}
          </div>
        </>
      )}
      {err && <p className="mt-2 text-destructive">{err}</p>}
    </div>
  );
}
