# Calculation details in the per-person breakdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a person row is expanded in the totals table, show the actual formula for each line in that person's share (item ÷ N, proportional × %, tip ÷ N), plus a small `+1¢` / `−1¢` annotation when the share absorbed a rounding bump.

**Architecture:** Frontend-only change. The `ShareLine` type in `src/lib/types.ts` gains formula-relevant fields. `src/lib/splitMath.ts` populates them at allocation time — both internal helpers (`allocate`, `allocateProportional`) start returning a `{ share, bumped }` shape so the bump per recipient is captured naturally. A new pure helper `src/lib/breakdownFormat.ts` turns a `ShareLine` into displayable text. `SplitTotalsTable` calls that helper inside its existing `<details>` block and gets a small Tailwind cleanup. No backend, schema, or wire-format changes.

**Tech Stack:** TypeScript (strict), Vitest + Testing Library (jsdom), React + Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-22-calculation-details-design.md`

---

## File structure

**Modified**
- `src/lib/types.ts` — extend `ShareLine`; `PersonTotal.itemBreakdown` becomes `ShareLine[]`.
- `src/lib/splitMath.ts` — `allocate` / `allocateProportional` return `{ share, bumped }`; `computeSplit` builds full `ShareLine` per entry.
- `src/lib/splitMath.test.ts` — add `ShareLine` metadata + invariant tests.
- `src/components/SplitTotalsTable.tsx` — render formula via helper; muted bump suffix; convert inline `style={{}}` to Tailwind classes.

**New**
- `src/lib/breakdownFormat.ts` — pure formatter returning `{ main, bump }`.
- `src/lib/breakdownFormat.test.ts` — one test per row in the rule table + negative-bump (discount).
- `src/components/SplitTotalsTable.test.tsx` — fixture render asserting formatted strings appear.

**Unchanged**
- `src/pages/Wizard/Step5Result.tsx`, `src/pages/TransactionView.tsx` — no API change.
- Rust backend, SQLite schema, IPC bridge.
- `src/components/SplitMathHelpDialog.tsx` content.
- Clipboard `copy()` output in both surfaces (still uses `itemId`/`shareCents`).

---

## Task 1: Extend `ShareLine` type

**Files:**
- Modify: `src/lib/types.ts:18-22`

- [ ] **Step 1: Replace the inline shape with a named `ShareLine`**

In `src/lib/types.ts`, find the existing block:

```ts
export interface PersonTotal {
  personId: string;
  totalCents: number;
  itemBreakdown: Array<{ itemId: string; shareCents: number }>;
}
```

Replace it with:

```ts
export interface ShareLine {
  itemId: string;
  shareCents: number;
  itemKind: ItemKind;
  itemPriceCents: number;
  sharerCount: number;
  isEveryone: boolean;
  weightBasisPoints?: number;
  bumpedCents: number;
}

export interface PersonTotal {
  personId: string;
  totalCents: number;
  itemBreakdown: ShareLine[];
}
```

`ItemKind` is already exported at the top of the file — no new import needed.

- [ ] **Step 2: Verify the typecheck fails as expected**

Run: `pnpm build`
Expected: `tsc` fails. `splitMath.ts` pushes `{ itemId, shareCents }` only; the new fields are required so this won't compile. That's the failure we want — Tasks 2 and 3 will fix it.

- [ ] **Step 3: Do not commit yet**

We'll commit at the end of Task 3 once the codebase typechecks again. Skip commit here.

---

## Task 2: Capture rounding bumps in the allocators

**Files:**
- Modify: `src/lib/splitMath.ts:7-84` (both helpers)
- Modify: `src/lib/splitMath.test.ts` (add bump test at the bottom)

- [ ] **Step 1: Write a failing test that exercises the bump**

Append to `src/lib/splitMath.test.ts`:

```ts
describe("computeSplit — rounding bumps", () => {
  it("attributes bumpedCents to exactly the people who absorbed the rounding remainder", () => {
    // 1001¢ ÷ 3 = 333r2. Two people each get +1¢; one gets +0.
    const result = computeSplit(
      [item({ id: "i1", priceCents: 1001 })],
      people("A", "B", "C")
    );
    const bumps = result.perPerson.map((p) => p.itemBreakdown[0].bumpedCents);
    expect(bumps.reduce((s, b) => s + b, 0)).toBe(2);
    expect(bumps.filter((b) => b === 1).length).toBe(2);
    expect(bumps.filter((b) => b === 0).length).toBe(1);
  });

  it("share-sum invariant: per-line share totals equal the line price", () => {
    const result = computeSplit(
      [item({ id: "i1", priceCents: 1001 })],
      people("A", "B", "C")
    );
    const sum = result.perPerson.reduce(
      (s, p) => s + p.itemBreakdown[0].shareCents,
      0
    );
    expect(sum).toBe(1001);
  });

  it("negative line price (discount) flips bump sign", () => {
    // -100¢ proportional across A:600, B:400 subtotals → weights 60/40.
    // -100 * 0.6 = -60 exact, -100 * 0.4 = -40 exact. Both exact, no bump.
    // Use uneven amount to force a bump: -101¢
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { id: "a1", name: "A", priceCents: 600, kind: "item", assignedPersonIds: ["p0"] },
        { id: "b1", name: "B", priceCents: 400, kind: "item", assignedPersonIds: ["p1"] },
        { id: "d1", name: "Disc", priceCents: -101, kind: "discount", assignedPersonIds: [] },
      ],
      ps
    );
    const discA = result.perPerson[0].itemBreakdown.find((b) => b.itemId === "d1")!;
    const discB = result.perPerson[1].itemBreakdown.find((b) => b.itemId === "d1")!;
    const bumps = [discA.bumpedCents, discB.bumpedCents];
    expect(bumps.reduce((s, b) => s + b, 0)).toBe(-1);
    expect(bumps.filter((b) => b === -1).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/splitMath.test.ts`
Expected: TypeScript error (`bumpedCents` does not exist on the current breakdown entry — actually it does after Task 1's type change, but `computeSplit` doesn't populate it yet). Tests fail.

- [ ] **Step 3: Refactor `allocate` to return `{ share, bumped }`**

In `src/lib/splitMath.ts`, replace lines 7–43 (the `allocate` function) with:

```ts
interface AllocEntry {
  share: number;
  bumped: number;
}

function allocate(
  amountCents: number,
  sharerIds: string[],
  currentTotals: Map<string, number>
): Map<string, AllocEntry> {
  const n = sharerIds.length;
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const base = Math.floor(absAmount / n);
  const remainder = absAmount - base * n;
  const out = new Map<string, AllocEntry>();
  for (const id of sharerIds) out.set(id, { share: sign * base, bumped: 0 });
  if (remainder === 0) return out;

  const working = new Map<string, number>();
  for (const id of sharerIds) {
    working.set(id, (currentTotals.get(id) ?? 0) + sign * base);
  }
  const isCharge = sign > 0;
  for (let i = 0; i < remainder; i++) {
    let pickId = sharerIds[0];
    let pickTotal = working.get(pickId)!;
    for (let j = 1; j < sharerIds.length; j++) {
      const id = sharerIds[j];
      const t = working.get(id)!;
      if (isCharge ? t < pickTotal : t > pickTotal) {
        pickId = id;
        pickTotal = t;
      } else if (t === pickTotal && id < pickId) {
        pickId = id;
      }
    }
    const cur = out.get(pickId)!;
    out.set(pickId, { share: cur.share + sign, bumped: cur.bumped + sign });
    working.set(pickId, pickTotal + sign);
  }
  return out;
}
```

- [ ] **Step 4: Refactor `allocateProportional` to return `{ share, bumped }`**

Replace lines 50–84 of `src/lib/splitMath.ts` (the `allocateProportional` function) with:

```ts
function allocateProportional(
  amountCents: number,
  weights: Map<string, number>
): Map<string, AllocEntry> {
  const totalWeight = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) {
    const z = new Map<string, AllocEntry>();
    for (const id of weights.keys()) z.set(id, { share: 0, bumped: 0 });
    return z;
  }
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const exact = new Map<string, number>();
  const floor = new Map<string, number>();
  for (const [id, w] of weights) {
    const e = (w * absAmount) / totalWeight;
    exact.set(id, e);
    floor.set(id, Math.floor(e));
  }
  const allocated = Array.from(floor.values()).reduce((s, n) => s + n, 0);
  const remainder = absAmount - allocated;
  const order = Array.from(weights.keys()).sort((a, b) => {
    const fa = exact.get(a)! - floor.get(a)!;
    const fb = exact.get(b)! - floor.get(b)!;
    if (fa !== fb) return fb - fa;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const bumpedSet = new Set<string>();
  for (let i = 0; i < remainder; i++) {
    const id = order[i];
    floor.set(id, floor.get(id)! + 1);
    bumpedSet.add(id);
  }
  const out = new Map<string, AllocEntry>();
  for (const [id, v] of floor) {
    out.set(id, { share: sign * v, bumped: bumpedSet.has(id) ? sign : 0 });
  }
  return out;
}
```

Note: `let allocated` / `let remainder` become `const` since we no longer reassign them.

- [ ] **Step 5: Do not commit yet**

`computeSplit` still consumes the old `Map<string, number>` shape and will fail typecheck. Task 3 makes it whole. Skip commit.

---

## Task 3: Rebuild `computeSplit` to emit full `ShareLine`s

**Files:**
- Modify: `src/lib/splitMath.ts:86-141` (the `computeSplit` function and the imports at the top)
- Modify: `src/lib/splitMath.test.ts` (add metadata + weightBasisPoints + tip tests)

- [ ] **Step 1: Write failing tests for the new metadata**

Append to `src/lib/splitMath.test.ts`:

```ts
describe("computeSplit — ShareLine metadata", () => {
  it("emits itemKind, itemPriceCents, sharerCount, isEveryone for subset items", () => {
    const ps = people("A", "B", "C");
    const result = computeSplit(
      [{ ...item({ id: "i1", priceCents: 900 }), assignedPersonIds: ["p0", "p1"] }],
      ps
    );
    const s = result.perPerson[0].itemBreakdown[0];
    expect(s.itemKind).toBe("item");
    expect(s.itemPriceCents).toBe(900);
    expect(s.sharerCount).toBe(2);
    expect(s.isEveryone).toBe(false);
  });

  it("marks everyone-shared items with isEveryone=true and sharerCount=people.length", () => {
    const result = computeSplit(
      [item({ id: "i1", priceCents: 600 })],
      people("A", "B", "C")
    );
    const s = result.perPerson[0].itemBreakdown[0];
    expect(s.isEveryone).toBe(true);
    expect(s.sharerCount).toBe(3);
  });

  it("marks solo items with sharerCount=1, isEveryone=false", () => {
    const ps = people("A", "B");
    const result = computeSplit(
      [{ ...item({ id: "i1", priceCents: 900 }), assignedPersonIds: ["p0"] }],
      ps
    );
    const s = result.perPerson[0].itemBreakdown[0];
    expect(s.sharerCount).toBe(1);
    expect(s.isEveryone).toBe(false);
  });

  it("tax line: weightBasisPoints proportional to subtotal", () => {
    // A owns 600, B owns 400 → 60% / 40%.
    const result = computeSplit(
      [
        { id: "a1", name: "A's", priceCents: 600, kind: "item", assignedPersonIds: ["p0"] },
        { id: "b1", name: "B's", priceCents: 400, kind: "item", assignedPersonIds: ["p1"] },
        { id: "t1", name: "Tax", priceCents: 100, kind: "tax", assignedPersonIds: [] },
      ],
      people("A", "B")
    );
    const taxA = result.perPerson[0].itemBreakdown.find((b) => b.itemId === "t1")!;
    const taxB = result.perPerson[1].itemBreakdown.find((b) => b.itemId === "t1")!;
    expect(taxA.weightBasisPoints).toBe(6000);
    expect(taxB.weightBasisPoints).toBe(4000);
    expect(taxA.itemKind).toBe("tax");
    expect(taxA.isEveryone).toBe(true);
  });

  it("zero-subtotal: tax weightBasisPoints is 0 for all people, shareCents is 0", () => {
    const result = computeSplit(
      [{ id: "t1", name: "Tax", priceCents: 100, kind: "tax", assignedPersonIds: [] }],
      people("A", "B")
    );
    for (const p of result.perPerson) {
      const tax = p.itemBreakdown[0];
      expect(tax.weightBasisPoints).toBe(0);
      expect(tax.shareCents).toBe(0);
    }
  });

  it("tip emits itemKind=tip, isEveryone=true, sharerCount=people.length", () => {
    const result = computeSplit(
      [{ id: "tp", name: "Tip", priceCents: 600, kind: "tip", assignedPersonIds: [] }],
      people("A", "B", "C")
    );
    const t = result.perPerson[0].itemBreakdown[0];
    expect(t.itemKind).toBe("tip");
    expect(t.isEveryone).toBe(true);
    expect(t.sharerCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/splitMath.test.ts`
Expected: tests fail — `computeSplit` still uses the old `{ itemId, shareCents }` shape, and the new fields are `undefined`.

- [ ] **Step 3: Rewrite `computeSplit` to emit full `ShareLine`s**

In `src/lib/splitMath.ts`, update the import line at the top to bring `ShareLine` into scope:

```ts
import type { LineItem, Person, PersonTotal, ShareLine, SplitResult } from "./types";
```

Then replace the `computeSplit` function (currently lines 86–141) with:

```ts
export function computeSplit(
  items: LineItem[],
  people: Person[]
): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [
      p.id,
      { personId: p.id, totalCents: 0, itemBreakdown: [] as ShareLine[] },
    ])
  );

  // Pass 1: items, exact-sum allocation. Running totals feed back into
  // allocate so leftover cents self-balance across items.
  const running = new Map<string, number>(people.map((p) => [p.id, 0]));
  for (const it of items) {
    if (it.kind !== "item") continue;
    const isEveryone = it.assignedPersonIds.length === 0;
    const sharers = isEveryone ? people.map((p) => p.id) : it.assignedPersonIds;
    const shares = allocate(it.priceCents, sharers, running);
    for (const [pid, { share, bumped }] of shares) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({
        itemId: it.id,
        shareCents: share,
        itemKind: "item",
        itemPriceCents: it.priceCents,
        sharerCount: sharers.length,
        isEveryone,
        bumpedCents: bumped,
      });
      running.set(pid, running.get(pid)! + share);
    }
  }

  const subtotalByPerson = new Map<string, number>(
    Array.from(totals.values()).map((t) => [t.personId, t.totalCents])
  );
  const totalSubtotal = Array.from(subtotalByPerson.values()).reduce(
    (s, v) => s + v,
    0
  );

  // Pass 2: tax and discount stay proportional to item subtotal; tip splits
  // evenly across everyone in the transaction.
  const allIds = people.map((p) => p.id);
  for (const it of items) {
    if (it.kind === "item") continue;
    if (it.kind === "tip") {
      const shares = allocate(it.priceCents, allIds, running);
      for (const [pid, { share, bumped }] of shares) {
        const t = totals.get(pid)!;
        t.totalCents += share;
        t.itemBreakdown.push({
          itemId: it.id,
          shareCents: share,
          itemKind: "tip",
          itemPriceCents: it.priceCents,
          sharerCount: allIds.length,
          isEveryone: true,
          bumpedCents: bumped,
        });
        running.set(pid, running.get(pid)! + share);
      }
    } else {
      const shares = allocateProportional(it.priceCents, subtotalByPerson);
      for (const [pid, { share, bumped }] of shares) {
        const t = totals.get(pid)!;
        const personSubtotal = subtotalByPerson.get(pid) ?? 0;
        const weightBasisPoints =
          totalSubtotal === 0
            ? 0
            : Math.round((personSubtotal / totalSubtotal) * 10000);
        t.totalCents += share;
        t.itemBreakdown.push({
          itemId: it.id,
          shareCents: share,
          itemKind: it.kind,
          itemPriceCents: it.priceCents,
          sharerCount: allIds.length,
          isEveryone: true,
          weightBasisPoints,
          bumpedCents: bumped,
        });
        running.set(pid, running.get(pid)! + share);
      }
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm test -- src/lib/splitMath.test.ts`
Expected: all old + new tests pass. No regressions.

- [ ] **Step 5: Typecheck the project**

Run: `pnpm build`
Expected: `tsc` passes (Vite build also runs).

- [ ] **Step 6: Commit Tasks 1–3 together**

```bash
git add src/lib/types.ts src/lib/splitMath.ts src/lib/splitMath.test.ts
git commit -m "$(cat <<'EOF'
feat(split): emit per-share formula metadata from computeSplit

ShareLine now carries itemKind, itemPriceCents, sharerCount, isEveryone,
weightBasisPoints (proportional lines), and bumpedCents — captured at
allocation time so the UI never has to re-derive the math.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pure formatter `breakdownFormat.ts`

**Files:**
- Create: `src/lib/breakdownFormat.ts`
- Create: `src/lib/breakdownFormat.test.ts`

- [ ] **Step 1: Write all the failing tests first**

Create `src/lib/breakdownFormat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatBreakdown } from "./breakdownFormat";
import type { ShareLine } from "./types";

const line = (overrides: Partial<ShareLine>): ShareLine => ({
  itemId: "i1",
  shareCents: 600,
  itemKind: "item",
  itemPriceCents: 1200,
  sharerCount: 2,
  isEveryone: false,
  bumpedCents: 0,
  ...overrides,
});

describe("formatBreakdown", () => {
  it("solo item shows (just you) with no formula", () => {
    const r = formatBreakdown(
      line({ shareCents: 900, itemPriceCents: 900, sharerCount: 1 }),
      "Garlic Bread",
      "USD"
    );
    expect(r.main).toBe("Garlic Bread (just you): $9.00");
    expect(r.bump).toBeNull();
  });

  it("subset item shows the divisor formula", () => {
    const r = formatBreakdown(line({}), "Caesar Salad", "USD");
    expect(r.main).toBe("Caesar Salad: $12.00 ÷ 2 = $6.00");
  });

  it("everyone item shows (everyone, N) annotation", () => {
    const r = formatBreakdown(
      line({
        shareCents: 500,
        itemPriceCents: 2000,
        sharerCount: 4,
        isEveryone: true,
      }),
      "Beer Pitcher",
      "USD"
    );
    expect(r.main).toBe("Beer Pitcher (everyone, 4): $20.00 ÷ 4 = $5.00");
  });

  it("tax with weight > 0 shows × percent formula", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 450,
        shareCents: 171,
        sharerCount: 3,
        isEveryone: true,
        weightBasisPoints: 3800,
      }),
      "Tax",
      "USD"
    );
    expect(r.main).toBe("Tax (proportional): $4.50 × 38% = $1.71");
  });

  it("tax with weight = 0 shows (no items) note", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 450,
        shareCents: 0,
        sharerCount: 3,
        isEveryone: true,
        weightBasisPoints: 0,
      }),
      "Tax",
      "USD"
    );
    expect(r.main).toBe("Tax (proportional): $0.00 (no items)");
  });

  it("tip shows ÷ formula across all people", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tip",
        itemPriceCents: 600,
        shareCents: 200,
        sharerCount: 3,
        isEveryone: true,
      }),
      "Tip",
      "USD"
    );
    expect(r.main).toBe("Tip (split evenly): $6.00 ÷ 3 = $2.00");
  });

  it("uses the actual itemName, not a hardcoded label", () => {
    const r = formatBreakdown(
      line({
        itemKind: "tax",
        itemPriceCents: 200,
        shareCents: 76,
        sharerCount: 2,
        isEveryone: true,
        weightBasisPoints: 3800,
      }),
      "VAT",
      "USD"
    );
    expect(r.main).toBe("VAT (proportional): $2.00 × 38% = $0.76");
  });

  it("positive bump renders as +1¢ rounding", () => {
    const r = formatBreakdown(line({ bumpedCents: 1 }), "Caesar Salad", "USD");
    expect(r.bump).toBe("+1¢ rounding");
  });

  it("negative bump (discount) renders as −1¢ rounding", () => {
    const r = formatBreakdown(
      line({
        itemKind: "discount",
        itemPriceCents: -500,
        shareCents: -190,
        sharerCount: 2,
        isEveryone: true,
        weightBasisPoints: 3800,
        bumpedCents: -1,
      }),
      "Discount",
      "USD"
    );
    expect(r.bump).toBe("−1¢ rounding");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/breakdownFormat.test.ts`
Expected: module not found (file doesn't exist yet).

- [ ] **Step 3: Create the formatter**

Create `src/lib/breakdownFormat.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/breakdownFormat.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/breakdownFormat.ts src/lib/breakdownFormat.test.ts
git commit -m "$(cat <<'EOF'
feat(split): add breakdownFormat helper for formula strings

Pure function that turns a ShareLine into { main, bump }. One branch per
line type — solo item, subset item, everyone item, proportional with and
without weight, tip — plus the ±1¢ rounding suffix when applicable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire the formatter into `SplitTotalsTable` and Tailwind cleanup

**Files:**
- Modify: `src/components/SplitTotalsTable.tsx`
- Create: `src/components/SplitTotalsTable.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `src/components/SplitTotalsTable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplitTotalsTable } from "./SplitTotalsTable";
import type { ShareLine, SplitResult } from "../lib/types";

const line = (
  o: Partial<ShareLine> & Pick<ShareLine, "itemId" | "itemKind">
): ShareLine => ({
  shareCents: 0,
  itemPriceCents: 0,
  sharerCount: 1,
  isEveryone: false,
  bumpedCents: 0,
  ...o,
});

function renderTable() {
  const split: SplitResult = {
    totalCents: 971,
    perPerson: [
      {
        personId: "p0",
        totalCents: 971,
        itemBreakdown: [
          line({
            itemId: "i1",
            shareCents: 600,
            itemKind: "item",
            itemPriceCents: 1200,
            sharerCount: 2,
          }),
          line({
            itemId: "tax",
            shareCents: 171,
            itemKind: "tax",
            itemPriceCents: 450,
            sharerCount: 2,
            isEveryone: true,
            weightBasisPoints: 3800,
          }),
          line({
            itemId: "tip",
            shareCents: 200,
            itemKind: "tip",
            itemPriceCents: 600,
            sharerCount: 3,
            isEveryone: true,
            bumpedCents: 1,
          }),
        ],
      },
    ],
  };
  const { container } = render(
    <SplitTotalsTable
      split={split}
      personNames={{ p0: "Alice" }}
      itemNames={{ i1: "Caesar Salad", tax: "Tax", tip: "Tip" }}
      currency="USD"
    />
  );
  // Open every <details> so its children are guaranteed visible regardless of
  // jsdom's handling of the collapsed state.
  container.querySelectorAll("details").forEach((d) => {
    (d as HTMLDetailsElement).open = true;
  });
}

describe("SplitTotalsTable", () => {
  it("renders formula lines for each share kind", () => {
    renderTable();
    expect(
      screen.getByText("Caesar Salad: $12.00 ÷ 2 = $6.00")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tax (proportional): $4.50 × 38% = $1.71")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tip (split evenly): $6.00 ÷ 3 = $2.00")
    ).toBeInTheDocument();
  });

  it("renders the rounding bump suffix when bumpedCents != 0", () => {
    renderTable();
    expect(screen.getByText("+1¢ rounding")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/components/SplitTotalsTable.test.tsx`
Expected: fails — current `SplitTotalsTable` renders the raw `name: amount` format, not the new formulas.

- [ ] **Step 3: Rewrite `SplitTotalsTable.tsx`**

Replace the entire contents of `src/components/SplitTotalsTable.tsx` with:

```tsx
import type { SplitResult } from "../lib/splitMath";
import { formatCents } from "../lib/formatCurrency";
import { formatBreakdown } from "../lib/breakdownFormat";
import { SplitMathHelpDialog } from "./SplitMathHelpDialog";

interface Props {
  split: SplitResult;
  personNames: Record<string, string>;
  itemNames: Record<string, string>;
  currency: string;
}

export function SplitTotalsTable({ split, personNames, itemNames, currency }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between pb-1 text-sm text-muted-foreground">
        <span>Per-person totals</span>
        <SplitMathHelpDialog />
      </div>
      {split.perPerson.map((p) => (
        <details
          key={p.personId}
          className="border-b border-border py-2 [&_summary]:cursor-pointer"
        >
          <summary className="flex justify-between hover:opacity-80">
            <span>{personNames[p.personId] ?? "?"}</span>
            <strong>{formatCents(p.totalCents, currency)}</strong>
          </summary>
          <ul className="mt-2 ml-4 space-y-1 text-sm text-muted-foreground">
            {p.itemBreakdown.map((b, i) => {
              const itemName = itemNames[b.itemId] ?? b.itemId;
              const { main, bump } = formatBreakdown(b, itemName, currency);
              return (
                <li key={i}>
                  {main}
                  {bump && (
                    <span className="ml-2 text-xs text-muted-foreground/70">
                      {bump}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      <div className="flex justify-between pt-3 text-sm text-muted-foreground">
        <span>Total</span>
        <span>{formatCents(split.totalCents, currency)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm test -- src/components/SplitTotalsTable.test.tsx`
Expected: both render tests pass.

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test`
Expected: every test passes. No regressions in `splitMath.test.ts`, `breakdownFormat.test.ts`, or anything that consumed `itemBreakdown` (only `Step5Result.copy` and `TransactionView.copy`, both of which read `itemId` only — still present).

- [ ] **Step 6: Run typecheck and frontend build**

Run: `pnpm build`
Expected: `tsc` clean, Vite build succeeds.

- [ ] **Step 7: Smoke-test in the desktop app**

Run: `pnpm tauri:dev`

In the running app:
1. Scan or paste a receipt with at least 3 items, tax, and tip.
2. Assign items so subtotals differ between people (this guarantees proportional weights ≠ 50/50 and likely produces a ±1¢ bump somewhere).
3. On Step 5, expand a person row. Confirm each line shows the formula in the format from the spec's rule table.
4. Save the transaction, open it from the home list. Expand a person row again. Same formulas should appear (both surfaces share `SplitTotalsTable`).
5. If any line shows `+1¢ rounding` or `−1¢ rounding`, confirm it's in muted color (smaller, lower contrast than the formula).

If anything looks wrong, fix and re-run before committing.

- [ ] **Step 8: Commit**

```bash
git add src/components/SplitTotalsTable.tsx src/components/SplitTotalsTable.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): show per-line formula inside person breakdown

Each line in an expanded person row now renders the actual formula
(item ÷ N, proportional × %, tip ÷ N) plus a faded ±1¢ rounding
annotation when a leftover cent was absorbed. Both wizard Step 5 and
the saved-transaction view pick this up via the shared component.

Tailwind classes replace the inline style props that were already in
this file; the <details> summary now shows a pointer cursor on hover so
the expand affordance is obvious.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After Task 5 is committed:

- [ ] `pnpm test` — all unit tests green.
- [ ] `pnpm build` — typecheck + frontend build clean.
- [ ] `cd src-tauri && cargo test` — Rust suite still green (no backend change, but worth confirming).
- [ ] `git log --oneline -3` — three new commits in order: `feat(split): emit per-share formula metadata…`, `feat(split): add breakdownFormat helper…`, `feat(ui): show per-line formula inside person breakdown`.
