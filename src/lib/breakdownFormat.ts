import type { ShareLine } from "./types";
import { formatCents } from "./formatCurrency";

export interface FormattedBreakdown {
  main: string;
  bump: string | null;
}

export function formatBreakdown(
  line: ShareLine,
  itemName: string,
  currency: string
): FormattedBreakdown {
  const share = formatCents(line.shareCents, currency);
  const price = formatCents(line.itemPriceCents, currency);
  let main: string;

  switch (line.itemKind) {
    case "item":
      if (line.sharerCount === 1) {
        main = `${itemName} (just you): ${share}`;
      } else if (line.isEveryone) {
        main = `${itemName} (everyone, ${line.sharerCount}): ${price} ÷ ${line.sharerCount} = ${share}`;
      } else {
        main = `${itemName}: ${price} ÷ ${line.sharerCount} = ${share}`;
      }
      break;
    case "tax":
    case "discount": {
      const bp = line.weightBasisPoints ?? 0;
      if (bp === 0) {
        main = `${itemName} (proportional): ${share} (no items)`;
      } else {
        const pct = Math.round(bp / 100);
        main = `${itemName} (proportional): ${price} × ${pct}% = ${share}`;
      }
      break;
    }
    case "tip":
      main = `${itemName} (split evenly): ${price} ÷ ${line.sharerCount} = ${share}`;
      break;
  }

  let bump: string | null = null;
  if (line.bumpedCents !== 0) {
    const sign = line.bumpedCents > 0 ? "+" : "−";
    const abs = Math.abs(line.bumpedCents);
    bump = `${sign}${abs}¢ rounding`;
  }

  return { main, bump };
}
