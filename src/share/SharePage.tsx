import { useMemo } from "react";
import { decodeSharePayload } from "@/lib/sharePayload";
import { computeSplit } from "@/lib/splitMath";
import { SplitTotalsTable } from "@/components/SplitTotalsTable";
import { formatDate } from "@/lib/formatDate";
import { reconstruct } from "./reconstruct";
import { Shell } from "./Shell";
import { MESSAGES } from "./messages";

export function SharePage({ fragment }: { fragment: string }) {
  const decoded = useMemo(() => decodeSharePayload(fragment), [fragment]);

  if (!decoded.ok) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Can&apos;t show this split</h1>
        <p className="mt-2 text-muted-foreground">{MESSAGES[decoded.error]}</p>
      </Shell>
    );
  }

  const payload = decoded.payload;
  const { items, people, personNames, itemNames } = reconstruct(payload);
  const split = computeSplit(items, people);

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">{payload.t}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{formatDate(payload.d)}</p>
      <div className="mt-6">
        <SplitTotalsTable
          split={split}
          personNames={personNames}
          itemNames={itemNames}
          currency={payload.c}
        />
      </div>
    </Shell>
  );
}
