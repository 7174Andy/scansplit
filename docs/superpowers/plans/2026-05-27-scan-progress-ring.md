# Scan Progress Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a circular SVG progress ring around the receipt thumbnail's X (remove) button while a receipt is being scanned. The ring snaps to 25% / 75% / 100% as the scan transitions through real backend stages (image prep → Anthropic call → post-process).

**Architecture:** Frontend renders the ring inside `ReceiptThumbnail` whenever `scanStatus === "scanning"`. Stage transitions are driven by Tauri events emitted from `scan_receipt` at three points: the `prepare` stage is set by the frontend itself when the scan starts, while `anthropic` and `finalize` arrive as `scan-progress` events from Rust. The frontend listens via `@tauri-apps/api/event` and filters by `receiptId`. The `Scanner` trait gains a `scan_prepared` method so image prep can happen *before* the `anthropic` event fires.

**Tech Stack:** Tauri 2 (`tauri::Emitter`), Rust async traits, React + TypeScript, Zustand, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-27-scan-progress-ring-design.md`

---

## Task 1: Add the new types

Shared TypeScript types for the stage value and Tauri event payload, used by every later task.

**Files:**
- Modify: `src/lib/types.ts`

### Steps

- [ ] **Step 1: Append the new types to `src/lib/types.ts`**

At the bottom of the file (after the `AppErrorPayload` interface), add:

```ts
export type ScanStage = "prepare" | "anthropic" | "finalize";

export interface ScanProgressEvent {
  receiptId: string;
  stage: ScanStage;
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `pnpm build`
Expected: build completes without errors. (The new types are exported but not yet imported anywhere — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add ScanStage and ScanProgressEvent"
```

---

## Task 2: Extend the wizard store with `scanStage`

Add the stage map to the store, with an action to set it and automatic clearing when scan status reaches a terminal value. TDD: failing tests first.

**Files:**
- Modify: `src/store/wizardStore.ts`
- Test: `src/store/wizardStore.test.ts`

### Steps

- [ ] **Step 1: Add failing tests to `src/store/wizardStore.test.ts`**

Append these tests inside the existing `describe("wizardStore", ...)` block (just before its closing `});`):

```ts
  it("setScanStage records the current stage for a receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r1", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r1", "anthropic");
    expect(useWizardStore.getState().scanStage["r1"]).toBe("anthropic");
  });

  it("setScanStatus('ok') clears scanStage for the receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r2", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r2", "finalize");
    useWizardStore.getState().setScanStatus("r2", "ok");
    expect(useWizardStore.getState().scanStage["r2"]).toBeUndefined();
  });

  it("setScanStatus('error') clears scanStage for the receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r3", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r3", "anthropic");
    useWizardStore.getState().setScanStatus("r3", "error", "boom");
    expect(useWizardStore.getState().scanStage["r3"]).toBeUndefined();
  });

  it("removeReceipt clears scanStage for the receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r4", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r4", "anthropic");
    useWizardStore.getState().removeReceipt("r4");
    expect(useWizardStore.getState().scanStage["r4"]).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test -- src/store/wizardStore.test.ts`
Expected: the four new tests fail (likely with "setScanStage is not a function" and "Cannot read properties of undefined").

- [ ] **Step 3: Update the `ScanStage` import block in `src/store/wizardStore.ts`**

Find the existing `import type { ... } from "../lib/types";` block and add `ScanStage` to it:

```ts
import type {
  FullTransaction,
  ItemRecord,
  ParsedReceipt,
  PersonRecord,
  ReceiptRecord,
  ScanStage,
  TransactionMeta,
} from "../lib/types";
```

- [ ] **Step 4: Add `scanStage` and `setScanStage` to the `WizardState` interface**

In the `interface WizardState { ... }` block, add `scanStage` next to `scanStatus`, and add `setScanStage` next to `setScanStatus`:

```ts
  scanStatus: Record<string, "pending" | "scanning" | "ok" | "error">;
  scanStage: Record<string, ScanStage>;
  scanErrors: Record<string, string>;
```

```ts
  setScanStatus: (id: string, status: WizardState["scanStatus"][string], err?: string) => void;
  setScanStage: (id: string, stage: ScanStage) => void;
```

- [ ] **Step 5: Initialize `scanStage` in the store state and in `reset`**

In the `create` callback's returned object, add `scanStage: {}` right after `scanStatus: {}`:

```ts
      scanStatus: {},
      scanStage: {},
      scanErrors: {},
```

In the `reset` action, add `scanStage: {}` to the `set({...})` call right after `scanStatus: {}`:

```ts
      reset: (id) => set({
        transaction: emptyMeta(id),
        receipts: [],
        scanStatus: {},
        scanStage: {},
        scanErrors: {},
        items: [],
```

In the `loadFrom` action, add `scanStage: {}` right after `scanStatus: ...`:

```ts
      loadFrom: (full) => set({
        transaction: full.transaction,
        receipts: full.receipts,
        scanStatus: Object.fromEntries(full.receipts.map((r) => [r.id, "ok"])),
        scanStage: {},
        scanErrors: {},
```

- [ ] **Step 6: Modify `setScanStatus` to clear `scanStage` on terminal status**

Replace the existing `setScanStatus` implementation:

```ts
      setScanStatus: (id, status, err) => set((st) => {
        const isTerminal = status === "ok" || status === "error";
        let nextStage = st.scanStage;
        if (isTerminal && st.scanStage[id] !== undefined) {
          const { [id]: _, ...rest } = st.scanStage;
          nextStage = rest;
        }
        return {
          scanStatus: { ...st.scanStatus, [id]: status },
          scanStage: nextStage,
          scanErrors: err ? { ...st.scanErrors, [id]: err } : st.scanErrors,
        };
      }),
```

- [ ] **Step 7: Add the `setScanStage` action**

Immediately after the new `setScanStatus`, add:

```ts
      setScanStage: (id, stage) => set((st) => ({
        scanStage: { ...st.scanStage, [id]: stage },
      })),
```

- [ ] **Step 8: Clear `scanStage` in `removeReceipt`**

Replace the existing `removeReceipt` implementation:

```ts
      removeReceipt: (id) => set((st) => {
        const { [id]: _status, ...remStatus } = st.scanStatus;
        const { [id]: _err, ...remErrors } = st.scanErrors;
        const { [id]: _stage, ...remStage } = st.scanStage;
        return {
          receipts: st.receipts.filter((r) => r.id !== id),
          items: st.items.filter((i) => i.receiptId !== id),
          scanStatus: remStatus,
          scanStage: remStage,
          scanErrors: remErrors,
        };
      }),
```

- [ ] **Step 9: Run tests and verify they pass**

Run: `pnpm test -- src/store/wizardStore.test.ts`
Expected: all wizardStore tests pass (existing + four new).

- [ ] **Step 10: Commit**

```bash
git add src/store/wizardStore.ts src/store/wizardStore.test.ts
git commit -m "feat(wizard): add scanStage state with auto-clear on terminal status"
```

---

## Task 3: Create the `ScanProgressRing` component

Pure presentational component. TDD: write the test, then the component.

**Files:**
- Create: `src/components/ScanProgressRing.tsx`
- Create: `src/components/ScanProgressRing.test.tsx`

### Steps

- [ ] **Step 1: Write the failing tests in `src/components/ScanProgressRing.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScanProgressRing } from "./ScanProgressRing";

const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function offsetFor(fraction: number): string {
  return (CIRCUMFERENCE * (1 - fraction)).toFixed(3);
}

describe("ScanProgressRing", () => {
  it("renders the foreground arc at 25% fill for stage 'prepare'", () => {
    render(<ScanProgressRing stage="prepare" onRemove={() => {}} />);
    const arc = screen.getByTestId("scan-progress-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(offsetFor(0.25));
  });

  it("renders the foreground arc at 75% fill for stage 'anthropic'", () => {
    render(<ScanProgressRing stage="anthropic" onRemove={() => {}} />);
    const arc = screen.getByTestId("scan-progress-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(offsetFor(0.75));
  });

  it("renders the foreground arc at 100% fill for stage 'finalize'", () => {
    render(<ScanProgressRing stage="finalize" onRemove={() => {}} />);
    const arc = screen.getByTestId("scan-progress-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(offsetFor(1));
  });

  it("clicking the X calls onRemove", () => {
    const onRemove = vi.fn();
    render(<ScanProgressRing stage="prepare" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove receipt/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test -- src/components/ScanProgressRing.test.tsx`
Expected: tests fail with "Failed to resolve import './ScanProgressRing'" or similar.

- [ ] **Step 3: Create `src/components/ScanProgressRing.tsx`**

```tsx
import { X } from "lucide-react";
import type { ScanStage } from "@/lib/types";

interface Props {
  stage: ScanStage;
  onRemove: () => void;
}

const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STAGE_FRACTION: Record<ScanStage, number> = {
  prepare: 0.25,
  anthropic: 0.75,
  finalize: 1,
};

export function ScanProgressRing({ stage, onRemove }: Props) {
  const offset = CIRCUMFERENCE * (1 - STAGE_FRACTION[stage]);
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label="Remove receipt"
      className="relative inline-flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        <circle
          data-testid="scan-progress-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE.toFixed(3)}
          strokeDashoffset={offset.toFixed(3)}
          className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <X className="size-3.5 relative" />
    </button>
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `pnpm test -- src/components/ScanProgressRing.test.tsx`
Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ScanProgressRing.tsx src/components/ScanProgressRing.test.tsx
git commit -m "feat(ui): add ScanProgressRing component"
```

---

## Task 4: Integrate the ring into `ReceiptThumbnail`

Swap the bare X button for the ring whenever `status === "scanning"`, and replace the `"scanning…"` text with a per-stage label.

**Files:**
- Modify: `src/components/ReceiptThumbnail.tsx`

### Steps

- [ ] **Step 1: Replace the contents of `src/components/ReceiptThumbnail.tsx`**

```tsx
import { Receipt, Check, AlertCircle, X } from "lucide-react";
import type { ReceiptRecord, ScanStage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScanProgressRing } from "@/components/ScanProgressRing";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  stage?: ScanStage;
  onRemove: () => void;
  onErrorClick?: () => void;
}

const STAGE_LABEL: Record<ScanStage, string> = {
  prepare: "Preparing…",
  anthropic: "Analyzing receipt…",
  finalize: "Finalizing…",
};

export function ReceiptThumbnail({ receipt, status, stage, onRemove, onErrorClick }: Props) {
  const clickable = status === "error" && !!onErrorClick;
  const scanning = status === "scanning";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onErrorClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onErrorClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "relative flex w-28 flex-col items-center gap-1.5 rounded-lg border bg-card p-2.5",
        status === "error"
          ? "cursor-pointer border-destructive hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          : "border-border",
      )}
    >
      <Receipt className="size-8" />
      <div className="break-all text-center text-[11px] text-muted-foreground">
        {receipt.imagePath.split("/").pop()}
      </div>
      {scanning && (
        <div className="text-xs text-muted-foreground">
          {STAGE_LABEL[stage ?? "prepare"]}
        </div>
      )}
      {status === "ok" && (
        <div className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="size-3" /> done
        </div>
      )}
      {status === "error" && (
        <div className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" /> error
        </div>
      )}
      {scanning ? (
        <ScanProgressRing
          stage={stage ?? "prepare"}
          onRemove={() => {
            // ScanProgressRing's button click bubbles to the thumbnail's
            // error-click handler in error state; we are in scanning state here
            // so it is safe to just call onRemove.
            onRemove();
          }}
        />
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove receipt"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full frontend unit suite**

Run: `pnpm test`
Expected: all tests pass. Existing `ScanProgressRing` and `wizardStore` tests should pass; no thumbnail tests should regress.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReceiptThumbnail.tsx
git commit -m "feat(ui): render ScanProgressRing in ReceiptThumbnail during scanning"
```

---

## Task 5: Wire stage plumbing and seed hook in `Step1Scan`

Set stage to `"prepare"` when a scan starts, pass `stage` down to the thumbnail, and add a `__scansplit_seed_scanning__` hook for the E2E test in Task 6. Tauri-event subscription is added later in Task 9.

**Files:**
- Modify: `src/pages/Wizard/Step1Scan.tsx`

### Steps

- [ ] **Step 1: Pull `scanStage` and `setScanStage` from the store**

In `Step1Scan.tsx`, locate the existing destructure:

```ts
  const {
    transaction, receipts, scanStatus, scanErrors,
    addReceipt, setScanStatus, mergeParsed, removeReceipt,
  } = useWizardStore();
```

Replace it with:

```ts
  const {
    transaction, receipts, scanStatus, scanStage, scanErrors,
    addReceipt, setScanStatus, setScanStage, mergeParsed, removeReceipt,
  } = useWizardStore();
```

- [ ] **Step 2: Set the `prepare` stage at the top of `scanOne`**

In the `scanOne` function, immediately after `setScanStatus(id, "scanning");`, add:

```ts
    setScanStage(id, "prepare");
```

So the start of `scanOne` becomes:

```ts
  async function scanOne(id: string, sourcePath: string) {
    setScanStatus(id, "scanning");
    setScanStage(id, "prepare");
    try {
      const started = performance.now();
      const result = await api.scanReceipt(sourcePath);
      // ... rest unchanged
```

- [ ] **Step 3: Pass `stage` to `ReceiptThumbnail`**

In the JSX where `<ReceiptThumbnail ... />` is rendered, add a `stage` prop:

```tsx
            <ReceiptThumbnail
              receipt={r}
              status={scanStatus[r.id] ?? "pending"}
              stage={scanStage[r.id]}
              onRemove={() => removeReceipt(r.id)}
              onErrorClick={() => setErrorDialog({ receiptId: r.id })}
            />
```

- [ ] **Step 4: Add the `__scansplit_seed_scanning__` test hook**

Inside the existing `if (import.meta.env.MODE === "test" && typeof window !== "undefined") { ... }` block, after the existing `__scansplit_seed_empty__` definition (before the closing `}`), add:

```ts
    (window as any).__scansplit_seed_scanning__ = (
      receiptId: string,
      stage: "prepare" | "anthropic" | "finalize",
    ) => {
      // Idempotent: the E2E test calls this multiple times for the same
      // receipt to walk through stages without producing duplicate thumbnails.
      const exists = useWizardStore.getState().receipts.some((r) => r.id === receiptId);
      if (!exists) {
        addReceipt({
          id: receiptId, transactionId: transaction.id, imagePath: "seed.jpg",
          position: receipts.length, scannedAt: 0,
        });
      }
      setScanStatus(receiptId, "scanning");
      setScanStage(receiptId, stage);
    };
```

(`useWizardStore` is already imported at the top of `Step1Scan.tsx`, so no new import is needed.)

- [ ] **Step 5: Run the frontend unit tests**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Wizard/Step1Scan.tsx
git commit -m "feat(wizard): plumb scanStage prop and seed hook for scanning state"
```

---

## Task 6: E2E test for the progress ring

End-to-end test that drives the new seed hook through all three stages and asserts the arc's `stroke-dashoffset` snaps correctly.

**Files:**
- Modify: `src/test/e2e/wizard.spec.ts`

### Steps

- [ ] **Step 1: Append the new test at the bottom of `src/test/e2e/wizard.spec.ts`**

```ts
test("scan progress ring snaps through stages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();

  // Seed the scanning state at stage "prepare".
  await page.evaluate(() =>
    (window as any).__scansplit_seed_scanning__("r-ring-1", "prepare"),
  );

  const SIZE = 32;
  const STROKE = 3;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const offsetFor = (fraction: number) =>
    (CIRCUMFERENCE * (1 - fraction)).toFixed(3);

  const arc = page.getByTestId("scan-progress-arc");
  await expect(arc).toHaveAttribute("stroke-dashoffset", offsetFor(0.25));
  await expect(page.getByText("Preparing…")).toBeVisible();

  // Transition to "anthropic".
  await page.evaluate(() =>
    (window as any).__scansplit_seed_scanning__ &&
    (window as any).__scansplit_seed_scanning__("r-ring-1", "anthropic"),
  );
  await expect(arc).toHaveAttribute("stroke-dashoffset", offsetFor(0.75));
  await expect(page.getByText("Analyzing receipt…")).toBeVisible();

  // Transition to "finalize".
  await page.evaluate(() =>
    (window as any).__scansplit_seed_scanning__("r-ring-1", "finalize"),
  );
  await expect(arc).toHaveAttribute("stroke-dashoffset", offsetFor(1));
  await expect(page.getByText("Finalizing…")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm e2e`
Expected: the new test passes along with all preexisting tests. If `pnpm e2e` cannot start the dev server because of an existing process on port 1420, free it first.

- [ ] **Step 3: Commit**

```bash
git add src/test/e2e/wizard.spec.ts
git commit -m "test(e2e): assert ring snaps through scan stages"
```

---

## Task 7: Refactor the `Scanner` trait to split prep from API

The frontend needs `prepare` to be done by the time the `anthropic` event fires. Split image preparation out of `Scanner::scan` into a new `scan_prepared` method on the trait.

**Files:**
- Modify: `src-tauri/src/ocr/mod.rs`
- Modify: `src-tauri/src/ocr/claude.rs`

### Steps

- [ ] **Step 1: Update the `Scanner` trait in `src-tauri/src/ocr/mod.rs`**

Replace the existing trait block:

```rust
#[async_trait::async_trait]
pub trait Scanner: Send + Sync {
    async fn scan(&self, image_bytes: &[u8]) -> crate::error::AppResult<ParsedReceipt>;
}
```

with:

```rust
#[async_trait::async_trait]
pub trait Scanner: Send + Sync {
    async fn scan_prepared(
        &self,
        prepared_bytes: &[u8],
        media_type: &'static str,
    ) -> crate::error::AppResult<ParsedReceipt>;

    /// Default: prepare the image then delegate to `scan_prepared`.
    async fn scan(&self, image_bytes: &[u8]) -> crate::error::AppResult<ParsedReceipt> {
        let (prepared, media_type) = crate::ocr::claude::prepare_image(image_bytes)?;
        self.scan_prepared(&prepared, media_type).await
    }
}
```

- [ ] **Step 2: Replace `ClaudeScanner::scan` with `scan_prepared` in `src-tauri/src/ocr/claude.rs`**

Find the existing impl block:

```rust
#[async_trait::async_trait]
impl Scanner for ClaudeScanner {
    async fn scan(&self, image_bytes: &[u8]) -> AppResult<ParsedReceipt> {
        let (prepared, media_type) = prepare_image(image_bytes)?;
        let b64 = B64.encode(&prepared);
        // ... body
    }
}
```

Replace the method body and signature so the impl becomes:

```rust
#[async_trait::async_trait]
impl Scanner for ClaudeScanner {
    async fn scan_prepared(
        &self,
        prepared_bytes: &[u8],
        media_type: &'static str,
    ) -> AppResult<ParsedReceipt> {
        let b64 = B64.encode(prepared_bytes);
        let body = json!({
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": PROMPT}
                ]
            }]
        });

        let res = self.http
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::InvalidApiKey);
        }
        if !res.status().is_success() {
            return Err(AppError::Other(format!(
                "anthropic status {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            )));
        }

        let parsed: AnthropicResponse = res.json().await?;
        let text = parsed.content.into_iter()
            .find(|b| b.block_type == "text")
            .and_then(|b| b.text)
            .ok_or_else(|| AppError::OcrParse("no text block".into()))?;

        let cleaned = strip_fences(&text);
        let receipt: ParsedReceipt = serde_json::from_str(&cleaned)
            .map_err(|e| AppError::OcrParse(format!("{e}: payload was: {cleaned}")))?;
        Ok(receipt)
    }
}
```

(The default `scan` method on the trait calls `prepare_image` + `scan_prepared`, so existing callers like `ocr_test.rs` keep working without changes.)

- [ ] **Step 3: Add a structural test for the trait's default `scan` in `src-tauri/src/ocr/mod.rs`**

The spec asks for a test that proves `scan_prepared` does not re-run `prepare_image`. A real test of `ClaudeScanner::scan_prepared` would have to hit the Anthropic API, which isn't appropriate for unit tests. The valuable structural check is: the trait's default `scan` correctly prepares the image and forwards prepared bytes + media type to `scan_prepared`. A small fake `Scanner` in the test module captures the forwarded media type.

Append this to the bottom of `src-tauri/src/ocr/mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppResult;
    use std::sync::Mutex;

    struct CaptureScanner {
        captured_media_type: Mutex<Option<&'static str>>,
        captured_first_byte: Mutex<Option<u8>>,
    }

    #[async_trait::async_trait]
    impl Scanner for CaptureScanner {
        async fn scan_prepared(
            &self,
            prepared_bytes: &[u8],
            media_type: &'static str,
        ) -> AppResult<ParsedReceipt> {
            *self.captured_media_type.lock().unwrap() = Some(media_type);
            *self.captured_first_byte.lock().unwrap() = prepared_bytes.first().copied();
            Ok(ParsedReceipt { merchant: None, items: vec![] })
        }
    }

    fn encode_png(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbImage::from_pixel(width, height, image::Rgb([200, 200, 200]));
        let mut out = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .expect("encode png");
        out
    }

    #[tokio::test]
    async fn default_scan_prepares_image_then_calls_scan_prepared() {
        let scanner = CaptureScanner {
            captured_media_type: Mutex::new(None),
            captured_first_byte: Mutex::new(None),
        };
        let png = encode_png(400, 300);
        scanner.scan(&png).await.expect("default scan delegates");
        assert_eq!(*scanner.captured_media_type.lock().unwrap(), Some("image/png"));
        // PNG signature first byte is 0x89.
        assert_eq!(*scanner.captured_first_byte.lock().unwrap(), Some(0x89));
    }
}
```

- [ ] **Step 4: Run the Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: every test passes including the new `default_scan_prepares_image_then_calls_scan_prepared`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ocr/mod.rs src-tauri/src/ocr/claude.rs
git commit -m "refactor(ocr): split Scanner trait into prepare_image + scan_prepared"
```

---

## Task 8: Emit `scan-progress` events from `scan_receipt`

The Rust command runs image prep, fires an `anthropic` event, runs the API call, then fires a `finalize` event. The frontend `receiptId` is threaded through.

**Files:**
- Modify: `src-tauri/src/commands/ocr.rs`
- Modify: `src/lib/tauri.ts`

### Steps

- [ ] **Step 1: Add a small event-emission helper at the bottom of `src-tauri/src/commands/ocr.rs`**

After the existing `record_code_corrections` command (at end of file), add:

```rust
fn emit_progress(app: &tauri::AppHandle, receipt_id: &str, stage: &str) {
    use tauri::Emitter;
    let _ = app.emit("scan-progress", serde_json::json!({
        "receiptId": receipt_id,
        "stage": stage,
    }));
}
```

- [ ] **Step 2: Update `scan_receipt` to accept `AppHandle` and `receipt_id`, and emit events**

Replace the existing `scan_receipt` function:

```rust
#[tauri::command]
pub async fn scan_receipt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    source_path: String,
    receipt_id: String,
) -> AppResult<ScanResult> {
    let key = crate::commands::settings::read_api_key()?
        .ok_or(AppError::MissingApiKey)?;
    let scanner: Box<dyn Scanner> = Box::new(ClaudeScanner::new(key));

    let bytes = std::fs::read(&source_path)?;
    let (prepared, media_type) = crate::ocr::claude::prepare_image(&bytes)?;
    emit_progress(&app, &receipt_id, "anthropic");

    let mut parsed: ParsedReceipt = scanner.scan_prepared(&prepared, media_type).await?;
    emit_progress(&app, &receipt_id, "finalize");

    code_expansions::apply_learned(&state.pool, &mut parsed).await?;

    let processed = process_for_storage(&bytes)?;
    let image_bytes_base64 =
        base64::engine::general_purpose::STANDARD.encode(&processed.bytes);
    let byte_size = processed.bytes.len() as i64;
    let filename = std::path::Path::new(&source_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("receipt")
        .to_string();

    Ok(ScanResult {
        image_path: filename,
        image_bytes_base64,
        mime: processed.mime.to_string(),
        byte_size,
        parsed,
    })
}
```

- [ ] **Step 3: Update the frontend Tauri bridge to pass `receiptId`**

In `src/lib/tauri.ts`, update the `TauriApi` interface:

```ts
  scanReceipt: (sourcePath: string, receiptId: string) => Promise<ScanResult>;
```

Update the real implementation:

```ts
  scanReceipt: (sourcePath, receiptId) =>
    invoke<ScanResult>("scan_receipt", { sourcePath, receiptId }),
```

Update the stub implementation:

```ts
  scanReceipt: async (_sourcePath, _receiptId) => {
    throw new Error("scan_receipt is not available in test mode; use the window seed hook");
  },
```

- [ ] **Step 4: Pass `receiptId` from `Step1Scan.tsx`**

In `src/pages/Wizard/Step1Scan.tsx`, in `scanOne`, update the API call to pass the id:

```ts
      const result = await api.scanReceipt(sourcePath, id);
```

- [ ] **Step 5: Build the Rust side**

Run: `cd src-tauri && cargo build`
Expected: build succeeds. Resolve any compile errors before moving on.

- [ ] **Step 6: Run the Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: all tests pass.

- [ ] **Step 7: Run the frontend build + tests**

Run: `pnpm build && pnpm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/ocr.rs src/lib/tauri.ts src/pages/Wizard/Step1Scan.tsx
git commit -m "feat(scan): emit scan-progress events with receiptId from Rust"
```

---

## Task 9: Subscribe to `scan-progress` events in `Step1Scan`

The last piece: register a `listen("scan-progress", ...)` subscription on mount so the ring actually advances during real scans.

**Files:**
- Modify: `src/pages/Wizard/Step1Scan.tsx`

### Steps

- [ ] **Step 1: Import the Tauri event listener at the top of `src/pages/Wizard/Step1Scan.tsx`**

Add this import alongside the other top-level imports:

```ts
import { listen } from "@tauri-apps/api/event";
```

And add the type import:

```ts
import type { ScanProgressEvent } from "../../lib/types";
```

- [ ] **Step 2: Register the listener in a new `useEffect` inside `Step1Scan`**

Add this `useEffect` immediately after the existing `prevErrorIds`/error-tracking effect:

```ts
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    let unlisten: (() => void) | undefined;
    listen<ScanProgressEvent>("scan-progress", (e) => {
      setScanStage(e.payload.receiptId, e.payload.stage);
    })
      .then((fn) => { unlisten = fn; })
      .catch((err) => { console.warn("scan-progress listen failed:", err); });
    return () => { unlisten?.(); };
  }, [setScanStage]);
```

The `import.meta.env.MODE === "test"` guard prevents Vitest/Playwright (which don't have a Tauri runtime) from hitting the `listen` call — those environments rely on the seed hooks instead.

- [ ] **Step 3: Run frontend unit tests and the E2E suite**

Run: `pnpm test && pnpm e2e`
Expected: all tests pass. The new effect is skipped in test mode, so the suite should be unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Wizard/Step1Scan.tsx
git commit -m "feat(wizard): subscribe to scan-progress events for live stage updates"
```

---

## Task 10: Manual verification with the real Tauri runtime

Tauri's `listen`/`emit` round trip is a framework primitive that is not exercised by unit or E2E tests. Verify it works end-to-end before declaring the feature done.

**Files:**
- (no code changes)

### Steps

- [ ] **Step 1: Start the desktop app**

Run: `pnpm tauri:dev`
Expected: the app window opens. Ensure the Anthropic API key is set in Settings if it isn't already (the dev keychain entry persists across runs).

- [ ] **Step 2: Drive a real scan**

Click **New Split → Add receipt files**, pick any local JPEG or PNG receipt image (a screenshot of a receipt is fine).

- [ ] **Step 3: Observe the ring**

Watch the thumbnail. Expected sequence:
- Ring appears at 25% with the label **"Preparing…"** (visible briefly — often just one paint frame).
- Ring snaps to 75% with the label **"Analyzing receipt…"** and stays there for the bulk of the scan (3–10 s).
- Ring snaps to 100% with the label **"Finalizing…"** for a flash.
- Ring is replaced by the green check mark and the **"✓ Scanned in X.X s"** line.

If the ring skips a stage or stays stuck, check the browser devtools console for warnings, and verify the Rust side actually emitted both events by adding a temporary `eprintln!` near each `emit_progress` call in `commands/ocr.rs` (revert once verified).

- [ ] **Step 4: Test cancellation mid-scan**

Pick another receipt, then click the X (inside the ring) while it's still in the `anthropic` stage. Expected: the receipt disappears immediately. The in-flight Anthropic request continues in the background (preexisting behavior); no error dialog appears.

- [ ] **Step 5: Test error path**

Temporarily clear the API key in Settings, run another scan. Expected: ring appears briefly at 25%, then the receipt flips to the error treatment (red border + "error" label) and the `ScanErrorDialog` auto-opens. Restore the API key afterwards.

- [ ] **Step 6: Final commit if any tweaks were needed**

If you made any non-cosmetic changes during verification, commit them with a descriptive message. Otherwise this task is complete with no commit.

---

## Done

All ten tasks complete. The progress ring renders during scans, snaps through three real backend stages, and is covered by unit, E2E, and manual verification.
