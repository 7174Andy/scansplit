import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";

export function SplitMathHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="How are amounts calculated?"
          title="How are amounts calculated?"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "#888",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <HelpCircle className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>How are amounts calculated?</DialogTitle>
        <DialogDescription>
          Each person's total combines four kinds of lines.
        </DialogDescription>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">Items</dt>
            <dd className="text-muted-foreground">
              Split evenly among the people you assigned. If no one is assigned,
              the item is shared by everyone.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Tax</dt>
            <dd className="text-muted-foreground">
              Split proportionally to each person's item subtotal — order more,
              pay more tax.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Tip</dt>
            <dd className="text-muted-foreground">
              Split evenly across everyone in the transaction, regardless of
              what each person ordered. Service is the same for the whole
              table.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Discounts</dt>
            <dd className="text-muted-foreground">
              Applied proportionally to each person's item subtotal — the
              opposite of how tax adds up.
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          When an amount doesn't divide into whole cents, the leftover cent
          goes to whoever is currently paying the least, so the rounding
          favor balances out. Per-person totals always sum exactly to the
          bill total — no money is gained or lost to rounding.
        </p>
      </DialogContent>
    </Dialog>
  );
}
