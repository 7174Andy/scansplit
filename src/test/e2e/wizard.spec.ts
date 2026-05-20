import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "sample.json"), "utf-8")
);

test("happy path: scan → confirm → people → assign → copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await expect(page.getByRole("heading", { name: /Step 1 of 5/ })).toBeVisible();

  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-1", parsed);
  }, sample);

  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByRole("heading", { name: /Step 2 of 5/ })).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByRole("button", { name: /Copy/ }).click();
  await expect(page.getByRole("button", { name: /Copied ✓/ })).toBeVisible();

  // $14 + $32 = $46 subtotal + $4.14 tax = $50.14 split 2 = $25.07 each.
  await expect(page.getByText("Alice")).toBeVisible();
  await expect(page.getByText(/\$25\.07/).first()).toBeVisible();
});

test("fix OCR mistake: edit a name and price in step 2", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-2", parsed);
  }, {
    merchant: "Trader Joe's",
    items: [
      { raw: "GV WHL MLK 2%", name: null, priceCents: 349, kind: "item" },
    ],
  });
  await page.getByRole("button", { name: "Next →" }).click();

  const nameInput = page.locator("input").first();
  await nameInput.fill("Whole Milk 2%");
  const priceInput = page.locator("input").nth(1);
  await priceInput.fill("4.00");
  await priceInput.blur();

  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  await expect(page.getByText(/\$4\.00/).first()).toBeVisible();
});

test("subset assignment: one person excluded from an item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-3", parsed);
  }, {
    merchant: null,
    items: [
      { raw: "WINE", name: "Wine", priceCents: 3000, kind: "item" },
    ],
  });
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByPlaceholder("Name").fill("Cara");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 4: assignment starts empty (= everyone). Click Alice and Bob to make
  // the assignment explicit [Alice, Bob]; Cara is now excluded.
  await page.getByText("Alice", { exact: true }).first().click();
  await page.getByText("Bob", { exact: true }).first().click();

  await page.getByRole("button", { name: "Next →" }).click();

  // $30 split 2 = $15 each for Alice and Bob; Cara owes $0.
  await expect(page.getByText(/\$15\.00/).first()).toBeVisible();
  const cara = page.locator("summary", { hasText: /^Cara/ });
  await expect(cara).toContainText(/\$0\.00/);
});
