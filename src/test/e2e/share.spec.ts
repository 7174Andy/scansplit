import { test, expect } from "@playwright/test";
import { toSharePayload } from "../../lib/shareFromTransaction";
import { encodeSharePayload } from "../../lib/sharePayload";

const PAGE = "http://localhost:4173/share.html";

const FRAGMENT = encodeSharePayload(
  toSharePayload({
    title: "Dinner at Luigi's",
    currency: "USD",
    date: "2026-07-29",
    people: [
      { id: "a", name: "Andy" },
      { id: "b", name: "Ben" },
    ],
    items: [
      { id: "1", name: "Pizza", priceCents: 2000, kind: "item", assignedPersonIds: [] },
    ],
  })
);

test("renders a shared split from the fragment", async ({ page }) => {
  await page.goto(`${PAGE}#${FRAGMENT}`);
  await expect(page.getByText("Dinner at Luigi's")).toBeVisible();
  await expect(page.getByText("Andy")).toBeVisible();
  await expect(page.getByText("Ben")).toBeVisible();
  // 2000 split evenly between two people
  await expect(page.getByText("$10.00").first()).toBeVisible();
});

test("shows the corrupted message for junk", async ({ page }) => {
  await page.goto(`${PAGE}#!!!junk!!!`);
  await expect(page.getByText(/corrupted or incomplete/i)).toBeVisible();
});

test("makes no network requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost:4173")) external.push(r.url());
  });
  await page.goto(`${PAGE}#${FRAGMENT}`);
  await expect(page.getByText("Dinner at Luigi's")).toBeVisible();
  expect(external).toEqual([]);
});
