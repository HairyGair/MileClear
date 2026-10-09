import { BUSINESS_PURPOSES, GIG_PLATFORMS, TRIP_CATEGORY_META } from "@mileclear/shared";

export const PLATFORM_OPTIONS: { value: string; label: string }[] = GIG_PLATFORMS.map((p) => ({
  value: p.value,
  label: p.label,
}));
export const PURPOSE_OPTIONS: { value: string; label: string }[] = BUSINESS_PURPOSES.map((p) => ({
  value: p.value,
  label: p.label,
}));
export const CATEGORY_OPTIONS: { value: string; label: string }[] = TRIP_CATEGORY_META.map((c) => ({
  value: c.value,
  label: c.label,
}));

export function platformLabel(v: string | null | undefined): string {
  return PLATFORM_OPTIONS.find((p) => p.value === v)?.label ?? "";
}
export function purposeLabel(v: string | null | undefined): string {
  return PURPOSE_OPTIONS.find((p) => p.value === v)?.label ?? "";
}
export function categoryLabel(v: string | null | undefined): string {
  return CATEGORY_OPTIONS.find((p) => p.value === v)?.label ?? "";
}

/** Undo for an automatic sort is offered for 7 days. */
export const AUTO_UNDO_DAYS = 7;

export function canUndoAuto(t: { classification: string; autoClassifiedAt?: string | null }, now = Date.now()): boolean {
  if (t.classification === "unclassified" || !t.autoClassifiedAt) return false;
  return now - new Date(t.autoClassifiedAt).getTime() < AUTO_UNDO_DAYS * 86_400_000;
}

/** An API error as one sentence for inline display. */
export function errorText(e: unknown, fallback = "Couldn't save. Try again."): string {
  return e instanceof Error && e.message && e.message !== "Request failed" ? e.message : fallback;
}
