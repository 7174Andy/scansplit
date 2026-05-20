import { useWizardStore } from "../../store/wizardStore";
import { ItemRow } from "../../components/ItemRow";
import { ConfidenceDot } from "@/components/ConfidenceDot";
import { Plus, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function newId(): string {
  return crypto.randomUUID();
}

export function Step2Items({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { items, transaction, setItem, removeItem, addItem } = useWizardStore();

  const hasItem = items.some((i) => i.kind === "item" && i.priceCents >= 0);

  return (
    <div>
      <p className="text-muted-foreground">
        Fix any OCR mistakes. Edit names and prices, mark tax/tip rows, delete things you don't want.
      </p>

      <div className="grid grid-cols-[16px_1fr_120px_120px_30px] gap-2 py-1.5 font-semibold text-primary">
        <span></span><span>Item</span><span>Price</span><span>Kind</span><span></span>
      </div>

      {items.map((it) => (
        <div key={it.id}>
          <div className="flex items-center gap-2">
            <ConfidenceDot confidence={it.confidence ?? "high"} reasons={it.confidenceReasons} />
            <div className="flex-1">
              <ItemRow
                item={it}
                onChange={(patch) => setItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
              />
            </div>
          </div>
          {(it.confidence ?? "high") !== "high" && (it.confidenceReasons?.length ?? 0) > 0 && (
            <div className="ml-4 text-xs text-muted-foreground">
              {it.confidenceReasons?.[0]}
            </div>
          )}
        </div>
      ))}

      <Button
        variant="outline"
        className="mt-3"
        onClick={() =>
          addItem({
            id: newId(),
            transactionId: transaction.id,
            name: "",
            priceCents: 0,
            kind: "item",
            position: items.length,
            assignedPersonIds: [],
            confidence: "high",
            confidenceReasons: [],
          })
        }
      >
        <Plus className="size-4" /> Add row
      </Button>

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button disabled={!hasItem} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
