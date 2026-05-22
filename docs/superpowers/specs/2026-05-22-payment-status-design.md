# Payment status per person — Design

**Status:** Approved
**Date:** 2026-05-22

## Goal

Let the user mark each person on a saved split as paid or unpaid. Surface progress at a glance from the home list, and offer per-person toggling from the transaction detail page.

This turns the result screen from a one-shot calculator into a small tracker — answering "who still owes me?" without leaving the app.

## Scope

In scope:

- Boolean paid/unpaid per person, captured as a nullable timestamp.
- Checkbox UI on the transaction detail page (`TransactionView`).
- "Settled" or "X of N paid" indicator on each row of the home transaction list.
- Persistence across reloads, edits, and app restarts.

Explicitly out of scope (possible future work):

- Partial payments / amount tracking.
- "Paid via Venmo / cash / Zelle" labels.
- Aggregated outstanding-balance view across all transactions.
- Notifications or reminders.
- Marking paid during the wizard before saving.

## Data model

New migration: `src-tauri/migrations/0002_payment_status.sql`

```sql
ALTER TABLE transaction_people ADD COLUMN paid_at INTEGER NULL;
```

Semantics:

- `paid_at IS NULL` → person has not paid.
- `paid_at` is a unix milliseconds timestamp representing the moment the user marked them paid.

Migrations are append-only and run by `sqlx::migrate!` at startup, so existing DBs upgrade in place with every existing row defaulting to `NULL`.

## Backend changes

### Model

`src-tauri/src/db/models.rs` — extend `Person`:

```rust
pub struct Person {
    pub id: String,
    pub transaction_id: String,
    pub name: String,
    pub position: i64,
    pub paid_at: Option<i64>,
}
```

Serde already uses `rename_all = "camelCase"` on the bridge structs, so this surfaces as `paidAt` on the wire.

### Queries

`src-tauri/src/db/queries.rs`:

- `get_full` — `SELECT … , paid_at` and populate `Person.paid_at`.
- `insert_full` — `INSERT INTO transaction_people (id, transaction_id, name, position, paid_at) VALUES (?, ?, ?, ?, ?)`.
- `replace_full` — same column list. Wizard edits round-trip `paid_at` through `loadFrom → toFull → update_transaction`, preserving status across edits.
- `list_summaries` — extend the SQL to compute paid count:

  ```sql
  SUM(CASE WHEN tp.paid_at IS NOT NULL THEN 1 ELSE 0 END) AS paid_count
  ```

  Add `paid_count: i64` to the returned `TransactionSummary` struct.

### New command

`src-tauri/src/commands/transactions.rs`:

```rust
#[tauri::command]
pub async fn set_person_paid(
    state: State<'_, AppState>,
    person_id: String,
    paid: bool,
) -> AppResult<()>
```

Behavior:

- If `paid == true`: `UPDATE transaction_people SET paid_at = ? WHERE id = ?` with current unix-ms.
- If `paid == false`: `UPDATE transaction_people SET paid_at = NULL WHERE id = ?`.
- In the same SQL transaction, `UPDATE transactions SET updated_at = ? WHERE id = (SELECT transaction_id FROM transaction_people WHERE id = ?)` so the home list re-sorts to put recently-updated splits first.
- Returns `NotFound` if the person id doesn't exist (use existing `AppError::NotFound`).
- Register in the `invoke_handler!` macro in `lib.rs`.

**Why a dedicated command rather than reusing `update_transaction`:** the existing edit path calls `replace_full`, which DELETE+INSERTs items and people. Toggling a single checkbox should be a one-row UPDATE — cheaper, atomic, and it doesn't race with an in-progress wizard edit on the same transaction.

## Frontend changes

### Types

`src/lib/types.ts`:

```ts
export interface PersonRecord {
  id: string;
  transactionId: string;
  name: string;
  position: number;
  paidAt: number | null;
}

export interface TransactionSummary {
  // … existing fields
  paidCount: number;
}
```

### API surface

`src/lib/tauri.ts`:

```ts
interface TauriApi {
  // … existing
  setPersonPaid: (personId: string, paid: boolean) => Promise<void>;
}
```

- `realApi.setPersonPaid = (personId, paid) => invoke<void>("set_person_paid", { personId, paid })`
- `stubApi.setPersonPaid` mutates `lastSaved`: find the person in `lastSaved.people`, set `paidAt` to `Date.now()` or `null`. This keeps test-mode reads of `getTransaction` and `listTransactions` consistent across a Playwright reload.

### `SplitTotalsTable`

`src/components/SplitTotalsTable.tsx` — extend props:

```ts
interface Props {
  // … existing
  paidByPersonId?: Record<string, number | null>;
  onTogglePaid?: (personId: string, nextPaid: boolean) => void;
}
```

For each person row's `<summary>`:

- When `paidByPersonId` is provided: render a shadcn `Checkbox` at the left, checked when `paidByPersonId[personId]` is non-null.
- Checkbox `onClick` calls `e.stopPropagation()` so it doesn't toggle the `<details>` disclosure, then invokes `onTogglePaid(personId, nextPaid)`.
- When paid: apply `text-muted-foreground line-through` to the amount only; the name stays normal-weight and readable. A small "Paid · {date}" label appears beside the name in muted text, where `{date}` is `new Date(paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })`.
- When `paidByPersonId` is not provided (e.g. wizard Step 5), behavior is unchanged from today — no checkboxes, no styling.

### `TransactionView`

`src/pages/TransactionView.tsx`:

- Build `paidByPersonId` from `full.people` and pass to `SplitTotalsTable`.
- Implement `onTogglePaid`: optimistic local update (mutate `full.people` via `setFull`), then `await api.setPersonPaid(personId, nextPaid)`. On error, revert local state and surface the error in the existing `err` slot.

### Home list

`src/pages/Home.tsx`:

For each row, render after the existing `${total} · ${peopleCount} people` text:

- If `peopleCount > 0 && paidCount === peopleCount`: a small green dot (`bg-green-500 rounded-full size-2`) followed by "Settled" in muted text.
- Else if `peopleCount > 0`: muted text `"{paidCount} of {peopleCount} paid"`.
- Else: nothing (preserves current empty-state).

## Edit-flow semantics

The wizard's edit flow (`loadFrom(full)` → mutate → `update_transaction` → `replace_full`) round-trips `PersonRecord` by stable id. With `paidAt` included in the type, the wizard carries it through unchanged.

Policy on edits that change amounts owed: **keep `paid_at`**. Rationale: only the user knows whether a friend's earlier payment still settles the new total. Auto-clearing on amount changes would silently destroy information; auto-keeping is recoverable (one click to untick). This is opinionated but deliberate.

## Edge cases

- **Person removed during edit:** FK cascade on `transaction_people` drops the row and any rows referencing it. Nothing to do.
- **Person added during edit:** new id → no row in old DB → after `replace_full`, `paid_at` is `NULL`. Correct.
- **Wizard Step 5 (pre-save):** no paid UI. Marking paid before the transaction exists in the DB is meaningless. `SplitTotalsTable` falls back to its existing behavior because Step5Result does not pass `paidByPersonId`.
- **Zero-people transaction:** Home shows neither "Settled" nor "X of N paid" — the divisor would be zero and the state is meaningless.
- **Test mode:** the stub api keeps `paidAt` in `lastSaved.people` consistent so reloads in Playwright preserve the toggled state.

## Testing

### Vitest (`src/`)

- `TransactionView` renders a checkbox per person; clicking it calls `api.setPersonPaid` with the right args; the row gains paid styling.
- Optimistic update: if `api.setPersonPaid` rejects, the row reverts to unpaid and the error message renders.
- `SplitTotalsTable` without `paidByPersonId` renders unchanged (regression guard for Step 5).
- `Home` renders "Settled" when `paidCount === peopleCount` (and `peopleCount > 0`), otherwise "X of N paid", otherwise nothing.

### Rust (`src-tauri/`)

- Migration `0002` applies cleanly to a v1-schema DB and leaves all existing rows with `paid_at = NULL`.
- `set_person_paid(id, true)` writes a non-null `paid_at` and bumps `transactions.updated_at`. `set_person_paid(id, false)` writes back `NULL`.
- `set_person_paid` on an unknown id returns `NotFound`.
- `list_summaries` returns the correct `paid_count` for mixed-status transactions.
- `replace_full` round-trip: insert a transaction with some `paid_at` values set, run `replace_full` with the same `paid_at` values in the payload, verify they persist.

### Playwright (`src/test/e2e/wizard.spec.ts`)

- Save a transaction with 3 people. On detail page, tick the first person's checkbox. Reload. Checkbox is still ticked, row shows "Paid · {date}" styling.
- Navigate to home. Row shows "1 of 3 paid".
- Untick all of them in detail view, return to home. Row shows "0 of 3 paid".
- Tick all of them. Row shows "Settled" with green dot.

## Files touched

- `src-tauri/migrations/0002_payment_status.sql` (new)
- `src-tauri/src/db/models.rs`
- `src-tauri/src/db/queries.rs`
- `src-tauri/src/commands/transactions.rs`
- `src-tauri/src/lib.rs` (register `set_person_paid`)
- `src/lib/types.ts`
- `src/lib/tauri.ts`
- `src/components/SplitTotalsTable.tsx`
- `src/pages/TransactionView.tsx`
- `src/pages/Home.tsx`
- Vitest + Playwright test files
