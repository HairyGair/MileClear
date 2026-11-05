/**
 * Pure rule for spoken error messages, kept free of react-native so it can be
 * unit tested. Returns the text to announce, or null when nothing should be said.
 * A message is announced when it appears or changes, never when it is cleared
 * or repeated unchanged.
 */
export function nextAnnouncement(previous: string | null | undefined, next: string | null | undefined): string | null {
  const text = (next ?? "").trim();
  if (!text) return null;
  if (text === (previous ?? "").trim()) return null;
  return text;
}
