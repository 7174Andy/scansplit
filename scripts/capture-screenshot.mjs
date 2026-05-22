// One-off helper: drive the dev:test server through the wizard and capture Step 5
// for site/screenshot.png. Requires `pnpm dev:test` already running on :1420.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1100, height: 760 },
  colorScheme: 'dark',
});
const page = await context.newPage();

await page.goto('http://localhost:1420/transaction/new', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  window.__scansplit_seed__('seed-1', {
    items: [
      { name: 'Margherita pizza', priceCents: 1850, kind: 'item' },
      { name: 'Caesar salad',     priceCents: 1450, kind: 'item' },
      { name: 'Sparkling water',  priceCents: 600,  kind: 'item' },
      { name: 'Tax',              priceCents: 320,  kind: 'tax' },
      { name: 'Tip',              priceCents: 600,  kind: 'tip' },
    ],
  });
});

await page.getByRole('button', { name: /^Next/ }).click(); // Step 1 → 2
await page.getByRole('button', { name: /^Next/ }).click(); // Step 2 → 3

for (const name of ['Alex', 'Jordan', 'Sam']) {
  await page.getByPlaceholder('Name').fill(name);
  await page.getByRole('button', { name: /^Add/ }).click();
}
await page.getByRole('button', { name: /^Next/ }).click(); // Step 3 → 4

// PersonChip renders as <span>, not <button> — match by exact text.
// Each name appears 3 times (one chip per item row): index 0 = Margherita,
// 1 = Caesar, 2 = Sparkling water.
await page.getByText('Sam', { exact: true }).nth(1).click();    // Caesar: remove Sam
await page.getByText('Alex', { exact: true }).nth(2).click();   // Sparkling: remove Alex
await page.getByText('Jordan', { exact: true }).nth(2).click(); // Sparkling: remove Jordan

await page.getByRole('button', { name: /^Next/ }).click(); // Step 4 → 5
await page.waitForLoadState('networkidle');

await page.screenshot({ path: 'site/screenshot.png', fullPage: false });

await browser.close();
console.log('site/screenshot.png written');
