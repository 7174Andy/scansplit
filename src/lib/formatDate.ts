// Format a calendar date stored as YYYY-MM-DD for display.
// Parse the parts and build a *local* Date so that `new Date("2026-07-15")`
// (which is interpreted as UTC midnight and can shift a day) never applies.
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
