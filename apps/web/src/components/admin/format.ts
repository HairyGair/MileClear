// Formatting helpers shared by every admin section page. Money is always
// stored in pence; these two functions are the only place that should ever
// call toLocaleString for it.

export function formatPence(pence: number): string {
  return (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}
