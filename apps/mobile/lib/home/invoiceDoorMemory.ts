// What this phone last learnt about the driver's invoices, for the Invoices
// shortcut on Home. A driver with no invoice in 90 days is only asked again
// every 30 minutes (invoiceDoorFreshMs), so making an invoice in the app
// forgets that answer, and the cached list it came from: the next Home visit
// asks the server and the shortcut shows straight away.
//
// Pure TypeScript (the request cache is too), so it is tested without a phone.

import { insightsCache, type RequestCache } from "../insights/requestCache";

/** The request cache key Home and More share for the invoices list. */
export const INVOICES_CACHE_KEY = "more|invoices";

let lastAnswer: { usesInvoices: boolean } | null = null;
// Bumped on every forget, so an answer to a request sent before the invoice
// was made can't put the old "no invoices" back.
let generation = 0;

export function lastInvoiceAnswer(): { usesInvoices: boolean } | null {
  return lastAnswer;
}

/** Taken before asking the server; handed back with its answer. */
export function invoiceAnswerGeneration(): number {
  return generation;
}

export function rememberInvoiceAnswer(answer: { usesInvoices: boolean }, askedAt: number): void {
  if (askedAt === generation) lastAnswer = answer;
}

/** An invoice was just made: forget what we knew so Home asks again. */
export function forgetInvoiceAnswer(cache: Pick<RequestCache, "forget"> = insightsCache): void {
  generation++;
  lastAnswer = null;
  cache.forget(INVOICES_CACHE_KEY);
}
