// Reading the in-app validate body. The Apple billing plugin swaps the JSON
// parser for a raw-buffer one (the webhook verifies its signature), so its
// body can arrive as a Buffer; the Google route gets a parsed object.

/** The validate body as an object, whether it arrived parsed, as a string or as a Buffer. */
function readBody(body: unknown): Record<string, unknown> | null {
  let value: unknown = body;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function readTransactionId(body: unknown): string | undefined {
  const id = readBody(body)?.transactionId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * What led to the purchase, sent by the app with the validate call: the Pro
 * screen's source ("exports", "Journey Map"), "restore", or "store" when the
 * store delivered a purchase with no Pro screen open. Logged on the
 * validated event so a purchase can be traced to the feature that sold it.
 * Anything not a short plain label is dropped.
 */
export function readPurchaseSource(body: unknown): string | null {
  const src = readBody(body)?.source;
  return typeof src === "string" && /^[\w .-]{1,64}$/.test(src) ? src : null;
}
