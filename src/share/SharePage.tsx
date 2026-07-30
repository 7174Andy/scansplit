import { useMemo } from "react";
import { decodeSharePayload, type DecodeError } from "@/lib/sharePayload";
import { computeSplit } from "@/lib/splitMath";
import { SplitTotalsTable } from "@/components/SplitTotalsTable";
import { formatDate } from "@/lib/formatDate";
import { reconstruct } from "./reconstruct";

const DOWNLOAD_URL = "https://7174andy.github.io/scansplit/";

const MESSAGES: Record<DecodeError, string> = {
  empty: "No split data in this link.",
  corrupt:
    "This link looks corrupted or incomplete — it may have been cut short when it was shared.",
  version: "This link was made by a newer version of ScanSplit.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {children}
      <footer className="mt-10 border-t pt-4 text-sm text-muted-foreground">
        Split with{" "}
        <a className="underline" href={DOWNLOAD_URL}>
          ScanSplit
        </a>
        .
      </footer>
    </div>
  );
}

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
