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
  await expect(page.getByText("Alice")).toBeVisible();
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

  // Step 4: assignment starts empty (= everyone). Click Alice and Bob to make
  // the assignment explicit [Alice, Bob]; Cara is now excluded.
  await page.getByText("Alice", { exact: true }).first().click();
  await page.getByText("Bob", { exact: true }).first().click();

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
