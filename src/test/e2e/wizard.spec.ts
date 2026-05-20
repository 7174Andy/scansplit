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
