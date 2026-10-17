import type { OpenBankingReturnTo } from "../../lib/openBankingState.js";

// The page a driver sees when their bank sends them back to MileClear.
// It never shows anything from the query string: every word on it is ours.

export const APP_RETURN_LINK = "mileclear://open-banking";
export const WEB_RETURN_LINK = "https://mileclear.com/dashboard/bank";

/**
 * The page has no script, image, font or form: only its own inline styles
 * and plain links.
 */
export const CALLBACK_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export type CallbackOutcome =
  | "connected"
  | "too_many"
  | "cancelled"
  | "expired"
  | "replayed"
  | "bad_state"
  | "not_premium"
  | "unavailable"
  | "exchange_failed";

const COPY: Record<CallbackOutcome, { title: string; body: string }> = {
  connected: {
    title: "Bank linked",
    body: "Your bank is now linked to MileClear. You can sync your transactions from the Bank screen.",
  },
  cancelled: {
    title: "Bank not linked",
    body: "Your bank didn't give permission, so nothing was linked. You can try again from MileClear whenever you like.",
  },
  expired: {
    title: "This link has run out",
    body: "Linking a bank has to be finished within 15 minutes of starting. Nothing was linked. Please start again from MileClear.",
  },
  replayed: {
    title: "This link has already been used",
    body: "Nothing new was linked. Please start again from MileClear.",
  },
  bad_state: {
    title: "We couldn't check this link",
    body: "Nothing was linked. Please start again from MileClear.",
  },
  too_many: {
    title: "Too many banks linked today",
    body: "You've linked 5 banks in the last 24 hours, so this one was not linked. Please try again tomorrow, or email support@mileclear.com if you need a hand.",
  },
  not_premium: {
    title: "MileClear Pro needed",
    body: "Linking a bank is part of MileClear Pro, so your bank was not linked.",
  },
  unavailable: {
    title: "Bank linking is unavailable",
    body: "Nothing was linked. Please try again later.",
  },
  exchange_failed: {
    title: "Your bank wasn't linked",
    body: "Something went wrong saving the link with your bank. Please start again from MileClear. If it keeps happening, email support@mileclear.com.",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Which MileClear account a bank was linked to, without giving the email
 * away: "a•••@icloud.com". Shown on the success page so a driver who was
 * talked into approving someone else's link can see it is not their own
 * account. Apple's hidden addresses mean nothing to the driver, so those
 * say "signed in with Apple" instead.
 */
export function linkedAccountLabel(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (domain === "privaterelay.appleid.com") {
    return "your MileClear account signed in with Apple";
  }
  return `${email[0]}•••@${domain}`;
}

/**
 * `returnTo` is null when the state could not be read, so we don't know
 * whether the driver started in the app or on the website: offer both.
 */
export function renderCallbackPage(
  outcome: CallbackOutcome,
  returnTo: OpenBankingReturnTo | null,
  linkedTo: string | null = null
): string {
  const { title, body } = COPY[outcome];
  const ok = outcome === "connected";
  const account =
    ok && linkedTo ? `
  <p class="account">Linked to ${escapeHtml(linkedTo)}</p>` : "";

  let actions: string;
  if (returnTo === "web") {
    actions = `<p class="hint">You can close this tab and go back to MileClear.</p>
    <a class="btn" href="${WEB_RETURN_LINK}">Back to MileClear</a>`;
  } else if (returnTo === "app") {
    actions = `<a class="btn" href="${APP_RETURN_LINK}">Open MileClear</a>
    <p class="hint">Or close this window and return to the MileClear app.</p>`;
  } else {
    actions = `<a class="btn" href="${APP_RETURN_LINK}">Open the MileClear app</a>
    <p class="hint">Started on the website? <a href="${WEB_RETURN_LINK}">Go back to MileClear</a>.</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en-GB"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} - MileClear</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #030712; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
  .container { text-align: center; max-width: 400px; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  p { color: #9ca3af; font-size: 15px; margin-bottom: 24px; }
  .hint { margin: 16px 0; }
  .hint a { color: #f5a623; }
  .btn { display: inline-block; background: #f5a623; color: #030712; font-weight: 700; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-size: 16px; }
  .success { color: #10b981; }
  .account { color: #fff; font-weight: 600; }
</style>
</head><body>
<div class="container" data-outcome="${outcome}">
  <h1${ok ? ' class="success"' : ""}>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>${account}
  ${actions}
</div>
</body></html>`;
}
