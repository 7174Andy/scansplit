# Calculation details in the per-person breakdown

**Date:** 2026-05-22
**Status:** Design

## Motivation

ScanSplit already shows a per-person split in two surfaces — the wizard's
Step 5 result and the saved-transaction view — both rendered through the
shared `SplitTotalsTable`. Each person row is a `<details>` element that
expands to show item-level shares (e.g., `Caesar Salad: $6.00`).

The conceptual `SplitMathHelpDialog` explains *how* the four kinds of lines
are split (items even among assignees, tax/discount proportional to subtotal,
tip evenly across everyone), but for a specific transaction the user cannot
see *why* their share of any individual line equals what it equals. Two
people looking at the same bill can disagree on a number with no way to
inspect the arithmetic.

The fix: when a person row is expanded, render the actual formula for each
line — the line price, the divisor or proportional weight, the result, and
a small annotation when the share absorbed a leftover-cent rounding bump.
No new clicks, no new screens, no toggle.

## Goals

- Expanding a person row in `SplitTotalsTable` reveals the formula for each
  line in that person's breakdown.
- Formula data is produced by `computeSplit` itself — never re-derived in the
  UI — so the displayed math matches the actual allocation exactly.
- Per-share rounding bumps (±1¢ from largest-remainder allocation) are
  visible on the lines they were applied to.
- Both surfaces (wizard Step 5 and saved transaction view) get this for free
  by virtue of the shared component.

## Non-goals

- Localizing the strings (`just you`, `everyone`, `proportional`,
  `split evenly`). English only for now.
- Changing the clipboard `copy()` output in `Step5Result` or
  `TransactionView` — that lands with the future share/export work.
- Showing formulas in collapsed rows.
- Any Rust-side or SQLite-schema change. The breakdown is computed
  frontend-side and never persisted.
- Visual redesign of the totals table beyond Tailwind-ifying the inline
  styles in lines we already touch.

## Decisions

| Topic | Decision |
| --- | --- |
| Surface | Both wizard Step 5 result and saved transaction view (via `SplitTotalsTable`). |
| Detail depth | Formula + leftover-cent annotation. |
| Interaction model | Always-inline when the existing person row is expanded — no new affordances. |
| Line format | Terse — formulas only when they add information; rounding note only when applied. |
| Where the data comes from | `computeSplit` emits richer per-share metadata directly. No sibling explainer, no UI-side recomputation. |

## Architecture

### Data model — extended `ShareLine`

Per-share entry inside `PersonTotal.itemBreakdown` grows from
`{ itemId, shareCents }` to:

```ts
interface ShareLine {
  itemId: string;
  shareCents: number;        // unchanged

  itemKind: "item" | "tax" | "tip" | "discount";
  itemPriceCents: number;    // line's full price (negative for discounts)
  sharerCount: number;       // how many people the line was split across
  isEveryone: boolean;       // true only for items where assignedPersonIds was empty
  weightBasisPoints?: number;// proportional lines only: 0–10000 (e.g. 3820 = 38.20%)
  bumpedCents: number;       // -1 / 0 / +1 — rounding bump applied to this share
}
```

- `weightBasisPoints` is an integer to stay in the integer-cents convention
  and avoid float drift. Display divides by 100.
- `bumpedCents` is captured at allocation time, not re-derived. Sum of
  `bumpedCents` across a single line's sharers equals that line's rounding
  remainder; sum of `shareCents` equals the line's price exactly.

`SplitResult.totalCents` and `PersonTotal.totalCents` are unchanged.

### Math changes — `src/lib/splitMath.ts`

Both internal allocation helpers grow a `bumped` field on each entry they
return.

- `allocate(amountCents, sharerIds, currentTotals)` →
  `Map<personId, { share: number, bumped: number }>`. Each sharer gets
  `bumped = sign` if they received a leftover cent that pass, else `0`.
- `allocateProportional(amountCents, weights)` →
  `Map<personId, { share: number, bumped: number }>`. `bumped = sign` for
  the people whose floor was incremented to absorb the remainder.

`computeSplit` then builds `ShareLine` per share at allocation time:

- **Items pass.** For each `kind === "item"` line, after calling `allocate`,
  push a `ShareLine` per sharer with:
  - `itemKind: "item"`
  - `itemPriceCents: it.priceCents`
  - `sharerCount: sharers.length`
  - `isEveryone: it.assignedPersonIds.length === 0`
  - `bumpedCents` from the allocator.
  People not in `sharers` receive no entry for that line (unchanged).

- **Tax / discount pass.** After `allocateProportional`, for each person
  also compute
  `weightBasisPoints = round(personSubtotal / totalSubtotal × 10000)`.
  Edge case: if `totalSubtotal === 0`, set `weightBasisPoints = 0` for
  everyone. The renderer treats this as "no items" and drops the `× %`
  part of the formula.

- **Tip pass.** Uses `allocate` across all people. `itemKind: "tip"`,
  `sharerCount: people.length`, `isEveryone: true` (tip is always
  everyone in the transaction).

### UI rendering

A new pure helper:

```ts
// src/lib/breakdownFormat.ts
export function formatBreakdown(
  line: ShareLine,
  itemName: string,
  currency: string
): { main: string; bump: string | null }
```

The helper returns the main formula text plus an optional bump suffix (so
the renderer can style the suffix in muted color). The leading name in
every output is the actual `itemName` passed in (so a tax line called
`"VAT"` renders as `VAT (proportional): ...`). Rules:

| Line shape | `main` output (with example names) |
| --- | --- |
| Item, single sharer | `Garlic Bread (just you): $9.00` |
| Item, subset (≥ 2) | `Caesar Salad: $12.00 ÷ 2 = $6.00` |
| Item, everyone | `Beer Pitcher (everyone, 4): $20.00 ÷ 4 = $5.00` |
| Tax / discount, weight > 0 | `Tax (proportional): $4.50 × 38% = $1.71` |
| Tax / discount, weight = 0 | `Tax (proportional): $0.00 (no items)` |
| Tip | `Tip (split evenly): $6.00 ÷ 3 = $2.00` |

`bump` is `+1¢ rounding`, `−1¢ rounding`, or `null`. Percent rendering is
`Math.round(weightBasisPoints / 100)` — an integer. The conceptual
`SplitMathHelpDialog` already explains that rounding favor balances out
over the bill, so we do not need a per-line caveat about the rounded %.

`SplitTotalsTable.tsx` calls `formatBreakdown` for each line inside the
existing `<details>` block. The `bump` suffix renders inside a
`<span className="text-muted-foreground">` so it visually recedes.

Two scoped cleanups in `SplitTotalsTable.tsx` while we're in the file:

1. Inline `style={{ ... }}` for colors and borders → Tailwind classes,
   matching the rest of the codebase.
2. The `<details>` summary becomes clearly clickable (cursor pointer,
   hover state) so users discover the expandable affordance.

These cleanups are scoped to lines touched by the feature — not a broader
refactor.

## Edge cases

- **Person with $0 subtotal and there's tax.** `weightBasisPoints = 0`,
  `shareCents = 0`. Renderer shows `Tax (proportional): $0.00 (no items)`.
- **All-zero subtotals + a tax line.** `allocateProportional` returns 0 for
  everyone (existing behavior). Every tax `ShareLine` has
  `weightBasisPoints = 0` and `shareCents = 0`.
- **Discount (negative price).** Same code path as tax (proportional). The
  `bump` suffix reads `−1¢ rounding` because the bump sign follows the
  line's sign.
- **Single-person transaction.** Items show `(just you)`. Tip and
  proportional lines still get formulas (`× 100%`, `÷ 1`); those are
  visible but not wrong.
- **No items at all.** No `ShareLine` entries. The expanded row is empty.
  Existing behavior; nothing to do.

## Testing

### `src/lib/splitMath.test.ts` (extend)

All existing total-correctness tests stay green — totals don't change. Add:

- Solo item: asserts `sharerCount === 1`, `bumpedCents === 0`,
  `isEveryone === false`.
- Subset item: `sharerCount === assigned.length`, `isEveryone === false`.
- Everyone item (empty `assignedPersonIds`):
  `sharerCount === people.length`, `isEveryone === true`.
- Tax proportional case: `weightBasisPoints` matches
  `Math.round(personSubtotal / totalSubtotal × 10000)`; `bumpedCents` is
  ±1 for the recipients of the rounding remainder.
- Zero-subtotal edge: every tax `ShareLine` has `weightBasisPoints === 0`
  and `shareCents === 0`.
- Tip case: `sharerCount === people.length`, `isEveryone === true`.
- Rounding-bump invariants: sum of `bumpedCents` across a line's sharers
  equals the rounding remainder; sum of `shareCents` equals the line
  price exactly.

### `src/lib/breakdownFormat.test.ts` (new)

One test per row in the rule table above, plus the negative-bump
(discount) case. Pure-function tests — no React.

### `src/components/SplitTotalsTable.test.tsx` (new)

Render with a small fixture covering: a solo item, a subset item, an
everyone item, tax with weight > 0, tax with weight 0, and a tip with a
bump. Assert representative formatted strings appear via
`screen.getByText`.

### Rust

No backend changes. `cargo test` does not need updates.

## File touch list

**Modified**
- `src/lib/types.ts`
- `src/lib/splitMath.ts`
- `src/lib/splitMath.test.ts`
- `src/components/SplitTotalsTable.tsx`

**New**
- `src/lib/breakdownFormat.ts`
- `src/lib/breakdownFormat.test.ts`
- `src/components/SplitTotalsTable.test.tsx`

**Unchanged**
- Rust backend, SQLite schema, OCR pipeline, IPC bridge.
- `SplitMathHelpDialog` content.
- Clipboard `copy()` output in `Step5Result` and `TransactionView`.
- `src/pages/Wizard/Step5Result.tsx` and `src/pages/TransactionView.tsx` —
  no API change, just a richer breakdown rendered by the shared component.
