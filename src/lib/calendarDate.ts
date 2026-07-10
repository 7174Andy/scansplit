// Convert between the app's YYYY-MM-DD string dates and JS Date objects using
// LOCAL date parts only, so no UTC off-by-one ever occurs. Mirrors the formatting
// used by todayIso() (wizard store) and formatDate() (display).

export function isoToDate(iso: string): Date | undefined {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
