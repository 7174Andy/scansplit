import { test, expect } from "@playwright/test";
import sample from "./fixtures/sample.json" with { type: "json" };

test("happy path: scan → confirm → people → assign → copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();
  await expect(page.getByRole("button", { name: "Add receipt files" })).toBeVisible();

  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-1", parsed);
  }, sample);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("button", { name: "Add row" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: /Copy/ }).click();
  await expect(page.getByRole("button", { name: /Copied/ })).toBeVisible();

  // $14 + $32 = $46 subtotal + $4.14 tax = $50.14 split 2 = $25.07 each.
  await expect(page.getByText("Alice").first()).toBeVisible();
  await expect(page.getByText(/\$25\.07/).first()).toBeVisible();
});

test("fix OCR mistake: edit a name and price in step 2", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-2", parsed);
  }, {
    merchant: "Trader Joe's",
    items: [
      { raw: "GV WHL MLK 2%", name: null, priceCents: 349, kind: "item" },
    ],
  });
  await page.getByRole("button", { name: "Next" }).click();

  const nameInput = page.locator("input").first();
  await nameInput.fill("Whole Milk 2%");
  const priceInput = page.locator("input").nth(1);
  await priceInput.fill("4.00");
  await priceInput.blur();

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText(/\$4\.00/).first()).toBeVisible();
});

test("subset assignment: one person excluded from an item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-3", parsed);
  }, {
    merchant: null,
    items: [
      { raw: "WINE", name: "Wine", priceCents: 3000, kind: "item" },
    ],
  });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByPlaceholder("Name").fill("Cara");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 4: assignment starts empty (= everyone, with all chips active).
  // Clicking an active chip deselects that person — click Cara to exclude her.
  // Resulting assignment: [Alice, Bob].
  await page.getByText("Cara", { exact: true }).first().click();

  await page.getByRole("button", { name: "Next" }).click();

  // $30 split 2 = $15 each for Alice and Bob; Cara owes $0.
  await expect(page.getByText(/\$15\.00/).first()).toBeVisible();
  const cara = page.locator("summary", { hasText: /^Cara/ });
  await expect(cara).toContainText(/\$0\.00/);
});

test("empty OCR: user adds items by hand", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();
  await page.evaluate(() => (window as any).__scansplit_seed_empty__("r-empty"));
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Add row" }).click();
  const inputs = page.locator("input");
  await inputs.first().fill("Manual item");
  await inputs.nth(1).fill("10.00");
  await inputs.nth(1).blur();

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText(/\$10\.00/).first()).toBeVisible();
});

test("OCR retry: failed scan can be retried", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();
  await page.evaluate(() =>
    (window as any).__scansplit_seed_error__("r-fail", "network unreachable")
  );

  // Error now surfaces in the non-modal dialog, not inline on the thumbnail.
  await expect(page.getByRole("heading", { name: "Scan failed" })).toBeVisible();
  await expect(page.getByText(/network unreachable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  // Simulate retry succeeding via a fresh seed call.
  await page.evaluate(() => {
    (window as any).__scansplit_seed_empty__("r-fail-retry");
  });
  // Remove the failed receipt via the dialog's Remove button.
  const errorDialog = page.locator("[data-state=open]").filter({ hasText: "Scan failed" });
  await errorDialog.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("button", { name: "Add row" })).toBeVisible();
});

test("payment status: tick checkboxes, reload, see settled / partial on home", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();

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

  // Switch payer from Alice (auto-selected) to Bob, so Alice + Cara are debtors
  // and their "Mark X paid" checkboxes remain interactive.
  // Radix Select: click the trigger, then click the option in the portal.
  const trigger = page.getByLabel("Paid by");
  await trigger.click();
  await page.getByRole("option", { name: "Bob" }).click();

  await page.getByRole("button", { name: "Next" }).click(); // 3 -> 4
  await page.getByRole("button", { name: "Next" }).click(); // 4 -> 5
  await page.getByRole("button", { name: /^Save/ }).click();
  await page.waitForURL(/\/transaction\/[^/]+$/);

  // Bob is the payer — his row is locked. Alice and Cara are debtor checkboxes.
  const aliceBox = page.getByRole("checkbox", { name: /Mark Alice paid/ });
  await aliceBox.check();
  await expect(aliceBox).toBeChecked();
  await expect(page.getByText(/Paid · /).first()).toBeVisible();

  // Bob (payer) is counted as paid in the home aggregate.
  await page.getByRole("button", { name: /Home/ }).click();
  await expect(page.getByText("2 of 3 paid")).toBeVisible();

  // Reopen via the list, confirm persistence, then tick Cara too.
  await page.getByRole("link", { name: /Wine|Split/ }).first().click();
  await expect(page.getByRole("checkbox", { name: /Mark Alice paid/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /Mark Cara paid/ }).check();
  await page.getByRole("button", { name: /Home/ }).click();
  await expect(page.getByText("Settled")).toBeVisible();
});

test("view receipt button opens the receipt image in a modal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();

  await page.evaluate(() => {
    (window as any).__scansplit_seed__("r-viewer", {
      merchant: "Trader Joe's",
      items: [
        { raw: "MILK", name: "Milk", priceCents: 349, kind: "item" },
      ],
    });
  });

  // Step 1 -> 2
  await page.getByRole("button", { name: "Next" }).click();
  // Step 2 -> 3
  await page.getByRole("button", { name: "Next" }).click();
  // Step 3: add one person
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Step 4 -> 5
  await page.getByRole("button", { name: "Next" }).click();

  // Step 5: Save -> navigates to /transaction/:id
  await page.getByRole("button", { name: /^Save/ }).click();
  await page.waitForURL(/\/transaction\/[^/]+$/);

  // View receipt button visible (1 receipt -> singular label).
  const viewBtn = page.getByRole("button", { name: /^View receipt$/ });
  await expect(viewBtn).toBeVisible();
  await viewBtn.click();

  const img = page.getByRole("img", { name: /seed\.jpg/i });
  await expect(img).toBeVisible();
  const src = await img.getAttribute("src");
  expect(src ?? "").toMatch(/^data:image\/jpeg;base64,/);

  // ESC closes.
  await page.keyboard.press("Escape");
  await expect(img).not.toBeVisible();
});

test("payer is auto-selected, can be changed, and the payer row is locked at Step 5", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-payer", parsed);
  }, {
    merchant: null,
    items: [{ raw: "PIZZA", name: "Pizza", priceCents: 2000, kind: "item" }],
  });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "Add" }).click();

  // Auto-selected to the first person (Alice). The SelectTrigger's text content
  // reflects the selected SelectItem.
  const trigger = page.getByLabel("Paid by");
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("Alice");

  // Switch payer to Bob.
  await trigger.click();
  await page.getByRole("option", { name: "Bob" }).click();
  await expect(trigger).toContainText("Bob");

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText(/Bob paid\. Splitting the rest:/i)).toBeVisible();

  // Bob's row checkbox: aria-label is "Bob paid this bill" (from Task 12 cleanup).
  const bobBox = page.getByRole("checkbox", { name: /Bob paid this bill/i });
  await expect(bobBox).toBeChecked();
  await expect(bobBox).toBeDisabled();

  // Alice's row in Step 5 — readOnlyPayerMode hides her checkbox entirely
  // (only the payer's checkbox renders when there's no settle handler).
  await expect(page.getByRole("checkbox", { name: /Mark Alice paid/i })).toHaveCount(0);
});

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
