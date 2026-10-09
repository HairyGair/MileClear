import { fetchWithAuth } from "@/lib/api";
import { parseApiError } from "@/lib/apiError";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2027-01-31" -> "31 January 2027". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "31 Jan 2028" from an ISO instant, in UK time. */
export function shortDateYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export function messageOf(err: unknown, fallback = "Something went wrong. Try again."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Reads a file download from the API and saves it. Throws an Error carrying the API's message. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetchWithAuth(path);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw parseApiError(body, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
