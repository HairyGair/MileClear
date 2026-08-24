// Validates a `next`/`return path` query param before it's used to
// navigate the browser. An open redirect on the login flow is a real
// vulnerability, not a nicety - only same-origin relative paths pass.
//
// Used by /login, /register, /verify and anything else that wants to send
// a user back to where they came from after auth (introduced for the
// Teams invite flow, 24 Aug 2026 - see /team/invite/[token]).

export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Browsers strip tab, newline and carriage return from a URL BEFORE
  // parsing it, so "/\t/evil.com" is read as "//evil.com" and escapes the
  // checks below. Reject control characters outright rather than trying to
  // out-guess that normalisation. Backslash goes too: several browsers
  // still treat it as a path separator.
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  if (decoded.includes("\\")) return null;
  // Must be a root-relative path: exactly one leading slash, no scheme,
  // no protocol-relative "//host" trick.
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  if (decoded.includes("://")) return null;
  return decoded;
}
