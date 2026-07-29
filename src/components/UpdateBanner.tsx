import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkForUpdate, type UpdateInfo } from "@/lib/updater";

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    checkForUpdate().then(setUpdate);
  }, []);

  // Both /transaction/new and /transaction/:id run the wizard, and its state
  // lives in sessionStorage — restarting would discard unsaved work.
  const wizardOpen = pathname.startsWith("/transaction");

  if (!update || dismissed) {
    return <div data-testid="update-banner-absent" hidden />;
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
      <span className="inline-flex items-center gap-2">
        <Download className="size-4" />
        ScanSplit {update.version} is available.
        {wizardOpen && " It will install once you finish this transaction."}
      </span>
      <span className="inline-flex items-center gap-2">
        {!wizardOpen && (
          <Button
            size="sm"
            disabled={installing}
            onClick={() => {
              setInstalling(true);
              update.install().catch((e) => {
                console.warn("update install failed", e);
                setInstalling(false);
              });
            }}
          >
            {installing ? "Installing…" : "Restart to update"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>
      </span>
    </div>
  );
}
