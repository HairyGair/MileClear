import { describe, it, expect, beforeEach } from "vitest";
import { RequestCache } from "../../insights/requestCache";
import { invoiceDoorFreshMs, INVOICE_DOOR_FRESH_MS, NO_INVOICES_FRESH_MS } from "../doors";
import {
  INVOICES_CACHE_KEY,
  forgetInvoiceAnswer,
  invoiceAnswerGeneration,
  lastInvoiceAnswer,
  rememberInvoiceAnswer,
} from "../invoiceDoorMemory";

describe("forgetting the invoices answer when an invoice is made", () => {
  let clock = 0;
  let cache: RequestCache;
  let loads = 0;
  const load = async () => {
    loads++;
    return { lastCreatedAt: null };
  };

  beforeEach(() => {
    clock = 0;
    loads = 0;
    cache = new RequestCache(() => clock);
    forgetInvoiceAnswer(cache);
  });

  it("a driver with no recent invoices is asked again straight after making one", async () => {
    await cache.get(INVOICES_CACHE_KEY, load);
    rememberInvoiceAnswer({ usesInvoices: false }, invoiceAnswerGeneration());
    expect(invoiceDoorFreshMs(lastInvoiceAnswer())).toBe(NO_INVOICES_FRESH_MS);

    clock = 5 * 60_000;
    await cache.get(INVOICES_CACHE_KEY, load, invoiceDoorFreshMs(lastInvoiceAnswer()));
    expect(loads).toBe(1);

    forgetInvoiceAnswer(cache);
    expect(lastInvoiceAnswer()).toBeNull();
    expect(invoiceDoorFreshMs(lastInvoiceAnswer())).toBe(INVOICE_DOOR_FRESH_MS);
    await cache.get(INVOICES_CACHE_KEY, load, invoiceDoorFreshMs(lastInvoiceAnswer()));
    expect(loads).toBe(2);
  });

  it("an answer to a request sent before the invoice was made is not kept", () => {
    const askedAt = invoiceAnswerGeneration();
    forgetInvoiceAnswer(cache);
    rememberInvoiceAnswer({ usesInvoices: false }, askedAt);
    expect(lastInvoiceAnswer()).toBeNull();

    rememberInvoiceAnswer({ usesInvoices: true }, invoiceAnswerGeneration());
    expect(lastInvoiceAnswer()).toEqual({ usesInvoices: true });
  });
});

describe("RequestCache.forget", () => {
  it("drops one answer and leaves the rest", async () => {
    const cache = new RequestCache(() => 0);
    let a = 0;
    let b = 0;
    await cache.get("a", async () => ++a);
    await cache.get("b", async () => ++b);
    cache.forget("a");
    expect(await cache.get("a", async () => ++a)).toBe(2);
    expect(await cache.get("b", async () => ++b)).toBe(1);
  });
});
