# Payment Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-person paid/unpaid tracking to saved transactions, with a checkbox on the detail page and a "Settled / X of N paid" indicator on the home list.

**Architecture:** A nullable `paid_at` timestamp on `transaction_people`, written by a dedicated `set_person_paid` Tauri command (atomic single-row UPDATE), preserved through wizard edits because it round-trips with the existing `Person` model. Frontend optimistically toggles and reverts on failure.

**Tech Stack:** Tauri 2, Rust (sqlx/tokio), SQLite, React 18, TypeScript, Zustand, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-22-payment-status-design.md`

---

## Task 1: DB migration and `Person.paid_at` field

Add the column and extend the Rust model. Update existing queries and tests so the field round-trips.

**Files:**
- Create: `src-tauri/migrations/0002_payment_status.sql`
- Modify: `src-tauri/src/db/models.rs` (`Person` struct)
- Modify: `src-tauri/src/db/queries.rs` (`insert_full`, `replace_full`, `get_full`)
- Modify: `src-tauri/tests/transactions_test.rs` (extend `sample_full`, add a round-trip test)

### Steps

- [ ] **Step 1: Create the migration file**

Create `src-tauri/migrations/0002_payment_status.sql`:

```sql
ALTER TABLE transaction_people ADD COLUMN paid_at INTEGER NULL;
```

- [ ] **Step 2: Add the field to the `Person` struct**

In `src-tauri/src/db/models.rs`, change the `Person` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub transaction_id: String,
    pub name: String,
    pub position: i64,
    pub paid_at: Option<i64>,
}
```

- [ ] **Step 3: Update `sample_full` and existing tests to construct `Person` with the new field**

In `src-tauri/tests/transactions_test.rs`, update both `Person` literals in `sample_full`:

```rust
people: vec![
    Person { id: "p1".into(), transaction_id: id.into(), name: "Alice".into(), position: 0, paid_at: None },
    Person { id: "p2".into(), transaction_id: id.into(), name: "Bob".into(), position: 1, paid_at: None },
],
```

- [ ] **Step 4: Run Rust tests to verify they still compile and existing ones pass**

Run: `cd src-tauri && cargo test --test transactions_test`
Expected: tests compile; existing ones (`create_then_get_roundtrips`, `delete_cascades`, `replace_overwrites_children`, the three byte-handling tests) all PASS. The new field is `None` in every test but isn't asserted yet.

- [ ] **Step 5: Add failing round-trip test for `paid_at`**

Append to `src-tauri/tests/transactions_test.rs`:

```rust
#[tokio::test]
async fn paid_at_roundtrips_through_insert_get_replace() {
    let pool = fresh_pool().await;
    let mut f = sample_full("t-paid");
    f.people[0].paid_at = Some(1_700_000_000_000);
    queries::insert_full(&pool, &f).await.unwrap();

    let got = queries::get_full(&pool, "t-paid").await.unwrap();
    assert_eq!(got.people[0].paid_at, Some(1_700_000_000_000));
    assert_eq!(got.people[1].paid_at, None);

    // Edit and save: paid_at should persist for unchanged people.
    let mut f2 = got.clone();
    f2.receipts[0].image_bytes_base64 = String::new();
    f2.items[0].name = "Skim Milk".into();
    queries::replace_full(&pool, &f2).await.unwrap();

    let got2 = queries::get_full(&pool, "t-paid").await.unwrap();
    assert_eq!(got2.people[0].paid_at, Some(1_700_000_000_000));
    assert_eq!(got2.people[1].paid_at, None);
}
```

- [ ] **Step 6: Run the new test, verify it fails**

Run: `cd src-tauri && cargo test --test transactions_test paid_at_roundtrips`
Expected: FAIL — `got.people[0].paid_at` is `None` because queries don't read/write the column yet.

- [ ] **Step 7: Update `insert_full` to write `paid_at`**

In `src-tauri/src/db/queries.rs`, change the people INSERT inside `insert_full`:

```rust
for p in &full.people {
    sqlx::query(
        "INSERT INTO transaction_people (id, transaction_id, name, position, paid_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position).bind(p.paid_at)
    .execute(&mut *tx).await?;
}
```

- [ ] **Step 8: Update `replace_full` to write `paid_at`**

In `src-tauri/src/db/queries.rs`, change the people INSERT inside `replace_full` (the one in `tx2`):

```rust
for p in &full.people {
    sqlx::query("INSERT INTO transaction_people (id, transaction_id, name, position, paid_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position).bind(p.paid_at)
        .execute(&mut *tx2).await?;
}
```

- [ ] **Step 9: Update `get_full` to read `paid_at`**

In `src-tauri/src/db/queries.rs`, change the people SELECT inside `get_full`:

```rust
let people: Vec<Person> = sqlx::query(
    "SELECT id, transaction_id, name, position, paid_at FROM transaction_people
     WHERE transaction_id = ? ORDER BY position",
)
.bind(id)
.fetch_all(pool).await?
.into_iter()
.map(|r| Person {
    id: r.get("id"), transaction_id: r.get("transaction_id"),
    name: r.get("name"), position: r.get("position"),
    paid_at: r.get("paid_at"),
})
.collect();
```

- [ ] **Step 10: Run the new test, verify it passes**

Run: `cd src-tauri && cargo test --test transactions_test paid_at_roundtrips`
Expected: PASS

- [ ] **Step 11: Run the full Rust test suite to catch regressions**

Run: `cd src-tauri && cargo test`
Expected: all tests PASS.

- [ ] **Step 12: Commit**

```bash
git add src-tauri/migrations/0002_payment_status.sql src-tauri/src/db/models.rs src-tauri/src/db/queries.rs src-tauri/tests/transactions_test.rs
git commit -m "feat(db): add paid_at column to transaction_people"
```

---

## Task 2: `set_person_paid` Tauri command

A single-row UPDATE that toggles paid status and bumps the parent transaction's `updated_at`.

**Files:**
- Modify: `src-tauri/src/db/queries.rs` (new `set_person_paid` function)
- Modify: `src-tauri/src/commands/transactions.rs` (new `#[tauri::command]`)
- Modify: `src-tauri/src/lib.rs` (register handler)
- Modify: `src-tauri/tests/transactions_test.rs` (new tests)

### Steps

- [ ] **Step 1: Write the failing test for the happy path**

Append to `src-tauri/tests/transactions_test.rs`:

```rust
#[tokio::test]
async fn set_person_paid_sets_and_clears_timestamp() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t-set")).await.unwrap();

    queries::set_person_paid(&pool, "p1", true).await.unwrap();
    let got = queries::get_full(&pool, "t-set").await.unwrap();
    let p1 = got.people.iter().find(|p| p.id == "p1").unwrap();
    assert!(p1.paid_at.is_some(), "p1 should have paid_at after set_person_paid(true)");
    let p2 = got.people.iter().find(|p| p.id == "p2").unwrap();
    assert!(p2.paid_at.is_none(), "p2 untouched");

    queries::set_person_paid(&pool, "p1", false).await.unwrap();
    let got = queries::get_full(&pool, "t-set").await.unwrap();
    assert!(got.people.iter().find(|p| p.id == "p1").unwrap().paid_at.is_none());
}

#[tokio::test]
async fn set_person_paid_bumps_transaction_updated_at() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t-bump")).await.unwrap();

    // Force a known starting updated_at.
    sqlx::query("UPDATE transactions SET updated_at = 1 WHERE id = ?")
        .bind("t-bump").execute(&pool).await.unwrap();

    queries::set_person_paid(&pool, "p1", true).await.unwrap();

    let row = sqlx::query("SELECT updated_at FROM transactions WHERE id = ?")
        .bind("t-bump").fetch_one(&pool).await.unwrap();
    let updated: i64 = row.get("updated_at");
    assert!(updated > 1, "updated_at must be bumped above 1");
}

#[tokio::test]
async fn set_person_paid_returns_not_found_for_unknown_id() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t-nf")).await.unwrap();

    let err = queries::set_person_paid(&pool, "no-such-person", true).await.unwrap_err();
    assert!(matches!(err, scansplit_lib::error::AppError::NotFound));
}
```

- [ ] **Step 2: Run the tests, verify they fail (function not defined)**

Run: `cd src-tauri && cargo test --test transactions_test set_person_paid`
Expected: FAIL — `queries::set_person_paid` does not exist.

- [ ] **Step 3: Implement `set_person_paid` in `queries.rs`**

Append to `src-tauri/src/db/queries.rs`:

```rust
pub async fn set_person_paid(
    pool: &SqlitePool,
    person_id: &str,
    paid: bool,
) -> AppResult<()> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let new_paid_at: Option<i64> = if paid { Some(now_ms) } else { None };

    let mut tx = pool.begin().await?;

    let result = sqlx::query(
        "UPDATE transaction_people SET paid_at = ? WHERE id = ?",
    )
    .bind(new_paid_at)
    .bind(person_id)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(crate::error::AppError::NotFound);
    }

    sqlx::query(
        "UPDATE transactions SET updated_at = ?
         WHERE id = (SELECT transaction_id FROM transaction_people WHERE id = ?)",
    )
    .bind(now_ms)
    .bind(person_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `cd src-tauri && cargo test --test transactions_test set_person_paid`
Expected: PASS (all three).

- [ ] **Step 5: Add the Tauri command**

Append to `src-tauri/src/commands/transactions.rs`:

```rust
#[tauri::command]
pub async fn set_person_paid(
    state: State<'_, AppState>,
    person_id: String,
    paid: bool,
) -> AppResult<()> {
    queries::set_person_paid(&state.pool, &person_id, paid).await
}
```

- [ ] **Step 6: Register the handler in `lib.rs`**

In `src-tauri/src/lib.rs`, add to the `invoke_handler!` list (after `delete_transaction`):

```rust
commands::transactions::delete_transaction,
commands::transactions::set_person_paid,
```

- [ ] **Step 7: Run the full Rust build to make sure nothing's broken**

Run: `cd src-tauri && cargo test`
Expected: all tests PASS, no compile warnings about the new command.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/db/queries.rs src-tauri/src/commands/transactions.rs src-tauri/src/lib.rs src-tauri/tests/transactions_test.rs
git commit -m "feat(commands): add set_person_paid Tauri command"
```

---

## Task 3: `list_summaries` returns `paid_count`

Aggregate per-transaction paid count so the home list can show progress without fetching every transaction.

**Files:**
- Modify: `src-tauri/src/db/queries.rs` (`TransactionSummary` struct + `list_summaries` SQL)
- Modify: `src-tauri/tests/transactions_test.rs` (new test)

### Steps

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/tests/transactions_test.rs`:

```rust
#[tokio::test]
async fn list_summaries_returns_paid_count() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t-sum")).await.unwrap();

    let before = queries::list_summaries(&pool).await.unwrap();
    let row = before.iter().find(|r| r.id == "t-sum").unwrap();
    assert_eq!(row.paid_count, 0);
    assert_eq!(row.people_count, 2);

    queries::set_person_paid(&pool, "p1", true).await.unwrap();

    let after = queries::list_summaries(&pool).await.unwrap();
    let row = after.iter().find(|r| r.id == "t-sum").unwrap();
    assert_eq!(row.paid_count, 1);
    assert_eq!(row.people_count, 2);
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test --test transactions_test list_summaries_returns_paid_count`
Expected: FAIL — `paid_count` is not a field of `TransactionSummary`.

- [ ] **Step 3: Add `paid_count` to the struct**

In `src-tauri/src/db/queries.rs`, update the `TransactionSummary` struct:

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionSummary {
    pub id: String,
    pub title: String,
    pub currency: String,
    pub updated_at: i64,
    pub people_count: i64,
    pub paid_count: i64,
    pub total_cents: i64,
}
```

- [ ] **Step 4: Update the SQL and population in `list_summaries`**

In `src-tauri/src/db/queries.rs`, replace the body of `list_summaries`:

```rust
pub async fn list_summaries(pool: &SqlitePool) -> AppResult<Vec<TransactionSummary>> {
    let rows = sqlx::query(
        "SELECT t.id, t.title, t.currency, t.updated_at,
                COUNT(DISTINCT tp.id) AS people_count,
                COALESCE(SUM(CASE WHEN tp.paid_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS paid_count,
                COALESCE(SUM(i.price_cents), 0) AS total_cents
         FROM transactions t
         LEFT JOIN transaction_people tp ON tp.transaction_id = t.id
         LEFT JOIN items i ON i.transaction_id = t.id
         GROUP BY t.id
         ORDER BY t.updated_at DESC",
    )
    .fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| TransactionSummary {
        id: r.get("id"),
        title: r.get("title"),
        currency: r.get("currency"),
        updated_at: r.get("updated_at"),
        people_count: r.get("people_count"),
        paid_count: r.get("paid_count"),
        total_cents: r.get("total_cents"),
    }).collect())
}
```

The `r.get("paid_count")` call infers `i64` from the struct field type, matching the existing `people_count` pattern.

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test --test transactions_test list_summaries_returns_paid_count`
Expected: PASS.

- [ ] **Step 6: Run the full Rust suite**

Run: `cd src-tauri && cargo test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/queries.rs src-tauri/tests/transactions_test.rs
git commit -m "feat(db): include paid_count in transaction summaries"
```

---

## Task 4: Frontend types and API surface

Add `paidAt` to `PersonRecord`, `paidCount` to `TransactionSummary`, `setPersonPaid` to the api wrapper, and stub-mode behavior so tests work.

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/store/wizardStore.ts` (`addPerson` initializes `paidAt: null`)

### Steps

- [ ] **Step 1: Add `paidAt` to `PersonRecord` and `paidCount` to `TransactionSummary`**

In `src/lib/types.ts`, update:

```ts
export interface PersonRecord {
  id: string;
  transactionId: string;
  name: string;
  position: number;
  paidAt: number | null;
}

export interface TransactionSummary {
  id: string;
  title: string;
  currency: string;
  updatedAt: number;
  peopleCount: number;
  paidCount: number;
  totalCents: number;
}
```

- [ ] **Step 2: Add `setPersonPaid` to the `TauriApi` interface and `realApi`**

In `src/lib/tauri.ts`, update the `TauriApi` interface:

```ts
interface TauriApi {
  createTransaction: (full: FullTransaction) => Promise<void>;
  updateTransaction: (full: FullTransaction) => Promise<void>;
  getTransaction: (id: string) => Promise<FullTransaction>;
  listTransactions: () => Promise<TransactionSummary[]>;
  deleteTransaction: (id: string) => Promise<void>;
  setPersonPaid: (personId: string, paid: boolean) => Promise<void>;
  getApiKey: () => Promise<string | null>;
  setApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;
  scanReceipt: (sourcePath: string) => Promise<ScanResult>;
  recordCodeCorrections: (
    merchant: string | null,
    corrections: Array<[string, string]>
  ) => Promise<void>;
  getReceiptImage: (receiptId: string) => Promise<ReceiptImagePayload>;
}
```

Add the real implementation to `realApi`:

```ts
setPersonPaid: (personId, paid) =>
  invoke<void>("set_person_paid", { personId, paid }),
```

- [ ] **Step 3: Add `setPersonPaid` to the stub api**

In `src/lib/tauri.ts`, add to `stubApi`:

```ts
setPersonPaid: async (personId, paid) => {
  if (!lastSaved) return;
  const person = lastSaved.people.find((p) => p.id === personId);
  if (!person) return;
  person.paidAt = paid ? Date.now() : null;
  lastSaved.transaction.updatedAt = Math.floor(Date.now() / 1000);
},
```

Also update the `listTransactions` stub to include `paidCount`:

```ts
listTransactions: async () =>
  lastSaved
    ? [{
        id: lastSaved.transaction.id,
        title: lastSaved.transaction.title,
        currency: lastSaved.transaction.currency,
        updatedAt: lastSaved.transaction.updatedAt,
        peopleCount: lastSaved.people.length,
        paidCount: lastSaved.people.filter((p) => p.paidAt != null).length,
        totalCents: lastSaved.items.reduce((s, i) => s + i.priceCents, 0),
      }]
    : [],
```

- [ ] **Step 4: Update `addPerson` in the wizard store to initialize `paidAt: null`**

In `src/store/wizardStore.ts`, change `addPerson`:

```ts
addPerson: (name) => set((st) => ({
  people: [
    ...st.people,
    { id: newId(), transactionId: st.transaction.id, name, position: st.people.length, paidAt: null },
  ],
})),
```

- [ ] **Step 5: Run typecheck + frontend tests**

Run: `pnpm build && pnpm test`
Expected: `tsc` passes; existing Vitest suite still PASSES. (No new tests yet — the existing `wizardStore.test.ts` still passes because `paidAt` is initialized via `addPerson`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/tauri.ts src/store/wizardStore.ts
git commit -m "feat(types): expose paidAt and paidCount on the frontend bridge"
```

---

## Task 5: Checkbox UI in `SplitTotalsTable`

Add the optional paid-state props and render a checkbox + paid styling when they're supplied. When the props are omitted (wizard Step 5), behavior is unchanged.

**Files:**
- Modify: `src/components/SplitTotalsTable.tsx`
- Modify: `src/components/SplitTotalsTable.test.tsx`

### Steps

- [ ] **Step 1: Write a failing test for the checkbox rendering and click callback**

Append to `src/components/SplitTotalsTable.test.tsx`:

```ts
import { fireEvent } from "@testing-library/react";

describe("SplitTotalsTable paid status", () => {
  afterEach(() => cleanup());

  function renderWithPaid(opts: {
    paidByPersonId?: Record<string, number | null>;
    onTogglePaid?: (id: string, next: boolean) => void;
  }) {
    const split: SplitResult = {
      totalCents: 1000,
      perPerson: [
        {
          personId: "p1",
          totalCents: 500,
          itemBreakdown: [
            line({ itemId: "i1", shareCents: 500, itemKind: "item", itemPriceCents: 1000, sharerCount: 2 }),
          ],
        },
        {
          personId: "p2",
          totalCents: 500,
          itemBreakdown: [
            line({ itemId: "i1", shareCents: 500, itemKind: "item", itemPriceCents: 1000, sharerCount: 2 }),
          ],
        },
      ],
    };
    return render(
      <SplitTotalsTable
        split={split}
        personNames={{ p1: "Alice", p2: "Bob" }}
        itemNames={{ i1: "Pizza" }}
        currency="USD"
        paidByPersonId={opts.paidByPersonId}
        onTogglePaid={opts.onTogglePaid}
      />
    );
  }

  it("renders a checkbox per person when paidByPersonId is provided", () => {
    renderWithPaid({ paidByPersonId: { p1: null, p2: null } });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
  });

  it("checkbox reflects paid state via paidByPersonId", () => {
    renderWithPaid({ paidByPersonId: { p1: 1_700_000_000_000, p2: null } });
    const boxes = screen.getAllByRole("checkbox");
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it("clicking a checkbox invokes onTogglePaid with the next value", () => {
    const calls: Array<[string, boolean]> = [];
    renderWithPaid({
      paidByPersonId: { p1: null, p2: null },
      onTogglePaid: (id, next) => calls.push([id, next]),
    });
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    expect(calls).toEqual([["p1", true]]);
  });

  it("renders no checkbox when paidByPersonId is omitted (Step 5 fallback)", () => {
    renderWithPaid({});
    expect(screen.queryAllByRole("checkbox").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test -- src/components/SplitTotalsTable.test.tsx`
Expected: FAIL — props don't exist and no checkbox is rendered.

- [ ] **Step 3: Implement the checkbox in `SplitTotalsTable`**

Replace `src/components/SplitTotalsTable.tsx` with:

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
  paidByPersonId?: Record<string, number | null>;
  onTogglePaid?: (personId: string, nextPaid: boolean) => void;
}

function formatPaidDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function SplitTotalsTable({
  split,
  personNames,
  itemNames,
  currency,
  paidByPersonId,
  onTogglePaid,
}: Props) {
  const showPaid = paidByPersonId !== undefined;
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Per-person totals</span>
        <SplitMathHelpDialog />
      </div>
      <p className="pb-1 text-xs text-muted-foreground/70">
        Click a name to see how it's calculated.
      </p>
      {split.perPerson.map((p) => {
        const paidAt = showPaid ? paidByPersonId![p.personId] ?? null : null;
        const isPaid = paidAt != null;
        return (
          <details
            key={p.personId}
            className="border-b border-border py-2 [&_summary]:cursor-pointer"
          >
            <summary className="flex items-center justify-between hover:opacity-80">
              <span className="flex items-center gap-2">
                {showPaid && (
                  <input
                    type="checkbox"
                    aria-label={`Mark ${personNames[p.personId] ?? "person"} paid`}
                    checked={isPaid}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onTogglePaid?.(p.personId, e.target.checked)}
                    className="size-4 cursor-pointer accent-primary"
                  />
                )}
                <span>{personNames[p.personId] ?? "?"}</span>
                {isPaid && paidAt != null && (
                  <span className="text-xs text-muted-foreground">
                    Paid · {formatPaidDate(paidAt)}
                  </span>
                )}
              </span>
              <strong className={isPaid ? "text-muted-foreground line-through" : undefined}>
                {formatCents(p.totalCents, currency)}
              </strong>
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
        );
      })}
      <div className="flex justify-between pt-3 text-sm text-muted-foreground">
        <span>Total</span>
        <span>{formatCents(split.totalCents, currency)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm test -- src/components/SplitTotalsTable.test.tsx`
Expected: PASS — all four new tests pass, plus the two original ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/SplitTotalsTable.tsx src/components/SplitTotalsTable.test.tsx
git commit -m "feat(ui): add per-person paid checkbox to SplitTotalsTable"
```

---

## Task 6: Wire `TransactionView` to toggle paid state

Build `paidByPersonId` from the loaded transaction and implement the optimistic-with-revert toggle handler.

**Files:**
- Modify: `src/pages/TransactionView.tsx`
- Create: `src/pages/TransactionView.test.tsx`

### Steps

- [ ] **Step 1: Write failing tests for optimistic toggle and revert-on-error**

Create `src/pages/TransactionView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TransactionView from "./TransactionView";
import { api } from "@/lib/tauri";
import type { FullTransaction } from "@/lib/types";

function sampleFull(): FullTransaction {
  return {
    transaction: { id: "t1", title: "Dinner", currency: "USD", createdAt: 0, updatedAt: 0 },
    people: [
      { id: "p1", transactionId: "t1", name: "Alice", position: 0, paidAt: null },
      { id: "p2", transactionId: "t1", name: "Bob", position: 1, paidAt: null },
    ],
    receipts: [],
    items: [
      {
        id: "i1", transactionId: "t1", name: "Pizza", priceCents: 1000,
        kind: "item", position: 0, assignedPersonIds: [],
      },
    ],
  };
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/transaction/t1"]}>
      <Routes>
        <Route path="/transaction/:id" element={<TransactionView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TransactionView paid toggle", () => {
  beforeEach(() => {
    vi.spyOn(api, "getTransaction").mockResolvedValue(sampleFull());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("toggles paid optimistically and calls api.setPersonPaid", async () => {
    const setSpy = vi.spyOn(api, "setPersonPaid").mockResolvedValue();
    renderView();

    const aliceBox = await screen.findByRole("checkbox", { name: /Mark Alice paid/ });
    expect((aliceBox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(aliceBox);

    await waitFor(() => {
      expect((aliceBox as HTMLInputElement).checked).toBe(true);
    });
    expect(setSpy).toHaveBeenCalledWith("p1", true);
  });

  it("reverts when api.setPersonPaid rejects", async () => {
    vi.spyOn(api, "setPersonPaid").mockRejectedValue(new Error("boom"));
    renderView();

    const aliceBox = await screen.findByRole("checkbox", { name: /Mark Alice paid/ });
    fireEvent.click(aliceBox);

    await waitFor(() => {
      expect((aliceBox as HTMLInputElement).checked).toBe(false);
    });
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm test -- src/pages/TransactionView.test.tsx`
Expected: FAIL — no checkboxes are rendered yet (TransactionView doesn't pass `paidByPersonId` to the table).

- [ ] **Step 3: Implement the toggle handler in `TransactionView.tsx`**

In `src/pages/TransactionView.tsx`, replace the component body to thread paid state and the handler through to the table. Replace the existing default export with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy as CopyIcon, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "@/lib/tauri";
import { computeSplit } from "@/lib/splitMath";
import { SplitTotalsTable } from "@/components/SplitTotalsTable";
import { ReceiptViewerDialog } from "@/components/ReceiptViewerDialog";
import { formatCents } from "@/lib/formatCurrency";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import type { FullTransaction } from "@/lib/types";

export default function TransactionView() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [full, setFull] = useState<FullTransaction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });
  const loadFrom = useWizardStore((s) => s.loadFrom);

  useEffect(() => {
    api.getTransaction(id).then(setFull).catch((e) => setErr(String(e?.message ?? e)));
  }, [id]);

  const split = useMemo(() => {
    if (!full) return null;
    return computeSplit(
      full.items.map((i) => ({
        id: i.id, name: i.name, priceCents: i.priceCents,
        kind: i.kind, assignedPersonIds: i.assignedPersonIds,
      })),
      full.people.map((p) => ({ id: p.id, name: p.name }))
    );
  }, [full]);

  if (err && !full) return <div className="p-6 text-destructive">Error: {err}</div>;
  if (!full || !split) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const personNames = Object.fromEntries(full.people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(full.items.map((i) => [i.id, i.name]));
  const paidByPersonId = Object.fromEntries(full.people.map((p) => [p.id, p.paidAt]));

  async function togglePaid(personId: string, nextPaid: boolean) {
    if (!full) return;
    const prev = full;
    const optimistic: FullTransaction = {
      ...full,
      people: full.people.map((p) =>
        p.id === personId ? { ...p, paidAt: nextPaid ? Date.now() : null } : p
      ),
    };
    setFull(optimistic);
    setErr(null);
    try {
      await api.setPersonPaid(personId, nextPaid);
    } catch (e: any) {
      setFull(prev);
      setErr(String(e?.message ?? e));
    }
  }

  async function copy() {
    if (!full || !split) return;
    const lines = [
      full.transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, full.transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, full.transaction.currency)}`,
    ];
    try {
      await writeText(lines.join("\n"));
    } catch {
      // ignore in test mode
    }
  }

  async function del() {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    try {
      await api.deleteTransaction(id);
      navigate("/");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  function edit() {
    if (!full) return;
    loadFrom(full);
    navigate("/transaction/new");
  }

  const hasReceipts = full.receipts.length > 0;
  const viewLabel = full.receipts.length > 1 ? "View receipts" : "View receipt";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button variant="ghost" onClick={() => navigate("/")}>
        <ArrowLeft className="size-4" /> Home
      </Button>
      <h1 className="mt-4 mb-3 text-3xl font-bold">{full.transaction.title}</h1>
      <div className="mb-4 flex gap-2">
        <Button variant="outline" onClick={copy}>
          <CopyIcon className="size-4" /> Copy
        </Button>
        {hasReceipts && (
          <Button variant="outline" onClick={() => setViewer({ open: true, index: 0 })}>
            <ImageIcon className="size-4" /> {viewLabel}
          </Button>
        )}
        <Button variant="outline" onClick={edit}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button variant="destructive" onClick={del}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
      {err && <p className="mb-2 text-destructive">{err}</p>}
      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={full.transaction.currency}
        paidByPersonId={paidByPersonId}
        onTogglePaid={togglePaid}
      />

      <ReceiptViewerDialog
        receipts={full.receipts}
        initialIndex={viewer.index}
        open={viewer.open}
        onOpenChange={(o) => setViewer((v) => ({ ...v, open: o }))}
      />
    </div>
  );
}
```

Note the small adjustment to the error guard: `if (err && !full)` so the error message can also display below the action bar after a failed toggle while the page is loaded.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm test -- src/pages/TransactionView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite to catch regressions**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/TransactionView.tsx src/pages/TransactionView.test.tsx
git commit -m "feat(ui): toggle paid status from the transaction detail page"
```

---

## Task 7: Home list "Settled / X of N paid" indicator

Render aggregate paid status next to each row on the home page.

**Files:**
- Modify: `src/pages/Home.tsx`
- Create: `src/pages/Home.test.tsx`

### Steps

- [ ] **Step 1: Write failing tests**

Create `src/pages/Home.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Home";
import { api } from "@/lib/tauri";

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe("Home paid indicator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows 'Settled' when paidCount equals peopleCount", async () => {
    vi.spyOn(api, "listTransactions").mockResolvedValue([
      {
        id: "t1", title: "Dinner", currency: "USD", updatedAt: 0,
        peopleCount: 3, paidCount: 3, totalCents: 9000,
      },
    ]);
    renderHome();
    expect(await screen.findByText("Settled")).toBeTruthy();
  });

  it("shows 'X of N paid' when partial", async () => {
    vi.spyOn(api, "listTransactions").mockResolvedValue([
      {
        id: "t2", title: "Lunch", currency: "USD", updatedAt: 0,
        peopleCount: 3, paidCount: 1, totalCents: 4000,
      },
    ]);
    renderHome();
    expect(await screen.findByText("1 of 3 paid")).toBeTruthy();
  });

  it("shows nothing when peopleCount is zero", async () => {
    vi.spyOn(api, "listTransactions").mockResolvedValue([
      {
        id: "t3", title: "Empty", currency: "USD", updatedAt: 0,
        peopleCount: 0, paidCount: 0, totalCents: 0,
      },
    ]);
    renderHome();
    expect(await screen.findByText("Empty")).toBeTruthy();
    expect(screen.queryByText(/paid/)).toBeNull();
    expect(screen.queryByText("Settled")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm test -- src/pages/Home.test.tsx`
Expected: FAIL — no "Settled" / "paid" text rendered.

- [ ] **Step 3: Update `Home.tsx` to render the indicator**

In `src/pages/Home.tsx`, replace the `<li>` body for each row:

```tsx
<ul className="m-0 list-none p-0">
  {rows?.map((r) => {
    const allPaid = r.peopleCount > 0 && r.paidCount === r.peopleCount;
    const someTracked = r.peopleCount > 0;
    return (
      <li
        key={r.id}
        className="flex items-center justify-between border-b border-border py-3.5"
      >
        <Link to={`/transaction/${r.id}`} className="text-primary hover:underline">
          {r.title}
        </Link>
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {formatCents(r.totalCents, r.currency)} · {r.peopleCount} people
          </span>
          {allPaid && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full bg-green-500" />
              <span>Settled</span>
            </span>
          )}
          {!allPaid && someTracked && (
            <span>{r.paidCount} of {r.peopleCount} paid</span>
          )}
        </span>
      </li>
    );
  })}
</ul>
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm test -- src/pages/Home.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Home.tsx src/pages/Home.test.tsx
git commit -m "feat(ui): show settled / partial paid indicator on the home list"
```

---

## Task 8: End-to-end Playwright coverage

A single flow that exercises the new feature from save through reload, both on the detail page and the home list.

**Files:**
- Modify: `src/test/e2e/wizard.spec.ts`

### Steps

- [ ] **Step 1: Add a failing E2E test for the paid checkbox flow**

Append to `src/test/e2e/wizard.spec.ts`:

```ts
test("payment status: tick checkbox, reload, see settled / partial on home", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();

  // Single $30 wine item, three people will split it.
  await page.evaluate(() => {
    (window as any).__scansplit_seed__("r-paid", {
      merchant: null,
      items: [{ raw: "WINE", name: "Wine", priceCents: 3000, kind: "item" }],
    });
  });

  await page.getByRole("button", { name: "Next" }).click(); // 1 -> 2
  await page.getByRole("button", { name: "Next" }).click(); // 2 -> 3
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByPlaceholder("Name").fill("Cara");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click(); // 3 -> 4
  await page.getByRole("button", { name: "Next" }).click(); // 4 -> 5
  await page.getByRole("button", { name: /^Save/ }).click();
  await page.waitForURL(/\/transaction\/[^/]+$/);

  // On the detail page, tick Alice paid.
  const aliceBox = page.getByRole("checkbox", { name: /Mark Alice paid/ });
  await aliceBox.check();
  await expect(aliceBox).toBeChecked();
  await expect(page.getByText(/Paid · /).first()).toBeVisible();

  // Reload and confirm persistence.
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Mark Alice paid/ })).toBeChecked();

  // Navigate home: row shows "1 of 3 paid".
  await page.getByRole("button", { name: /Home/ }).click();
  await expect(page.getByText("1 of 3 paid")).toBeVisible();

  // Open the transaction again, tick Bob and Cara.
  await page.getByRole("link", { name: /Wine|Split/ }).first().click();
  await page.getByRole("checkbox", { name: /Mark Bob paid/ }).check();
  await page.getByRole("checkbox", { name: /Mark Cara paid/ }).check();
  await page.getByRole("button", { name: /Home/ }).click();
  await expect(page.getByText("Settled")).toBeVisible();
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm e2e -- --grep "payment status"`
Expected: FAIL the first time because nothing else has been deployed yet — *unless Tasks 1–7 are already committed*, in which case it should pass cleanly. If you're running this after the other tasks landed, expect PASS here too.

- [ ] **Step 3: If failing, diagnose**

Common pitfalls:
- The default transaction title is `"Split — <date>"`, so the home row's `Link` text includes "Split". The `getByRole("link", { name: /Wine|Split/ })` regex covers both.
- The home button on the detail page has label `Home`. Confirmed in `TransactionView.tsx`.

If the test still fails, log the page source with `console.log(await page.content())` to inspect actual rendering before adjusting selectors.

- [ ] **Step 4: Once green, commit**

```bash
git add src/test/e2e/wizard.spec.ts
git commit -m "test(e2e): cover paid checkbox toggle, persistence, and home indicator"
```

---

## Task 9: Manual verification in the live app

Run the real Tauri app and exercise the feature end-to-end. Catches anything the test seam misses (real OCR / real keychain / real SQLite path).

**Files:** none

### Steps

- [ ] **Step 1: Start the app**

Run: `pnpm tauri:dev`
Expected: app opens; no migration errors in the terminal output. On first launch with this branch, migration `0002_payment_status.sql` should run silently.

- [ ] **Step 2: Use the feature**

- Create a new split (or open an existing saved one).
- On the detail page, tick a person's checkbox.
- Confirm: row dims with strikethrough on the amount, "Paid · <Mmm D>" appears next to the name.
- Close and reopen the app. Re-open the same transaction.
- Confirm: the checkbox is still ticked and the styling is preserved.
- Go to the home list.
- Confirm: that transaction shows "1 of N paid" (or "Settled" if all are ticked).

- [ ] **Step 3: Edit-flow regression check**

- Open a transaction where one person is marked paid.
- Click "Edit", land on the wizard step 2, change an item name or price, save.
- Reopen the transaction.
- Confirm: the paid status survived the edit (still ticked, still shows "Paid · …").

- [ ] **Step 4: If everything works, no commit needed.**

This task is verification only. If you find a bug, file it as a follow-up rather than patching in this plan — the plan as written should be functionally complete.

---

## Notes for the implementer

- **Wire format reminder:** Rust uses `paid_at: Option<i64>`; TS sees `paidAt: number | null` thanks to `serde(rename_all = "camelCase")`.
- **Don't auto-clear `paid_at` when totals change during edits.** That's an intentional policy from the spec (see section "Edit-flow semantics") — the user is the only one who knows whether an earlier payment still covers a new amount.
- **`set_person_paid` is intentionally a separate command** from `update_transaction`. It runs even when the wizard is open, and it doesn't DELETE+INSERT children. Don't be tempted to fold it into the edit flow.
- **No shadcn `Checkbox` is installed** in this project; a native `<input type="checkbox">` with `accent-primary` matches the existing minimal component set. Don't pull in a new dep unless other rows of UI work justify it.
