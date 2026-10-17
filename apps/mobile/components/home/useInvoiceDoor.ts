// The Invoices shortcut on Home: whether this driver uses invoices (made one
// in the last 90 days) and the line it says. One small request, the same one
// More > Invoices makes and shared with it through the Insights request cache
// (fresh for a minute, like More, or 30 minutes for a driver with no recent
// invoice), and only for Work drivers who could see the shortcut at all.

import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchInvoices, type InvoiceListResponse } from "../../lib/api/invoices";
import { insightsCache } from "../../lib/insights/requestCache";
import { invoiceDoorFreshMs, usesInvoicesRecently } from "../../lib/home/doors";
import { invoicesDoorText } from "../../lib/home/doorText";
import type { HomePersona } from "../../lib/home/persona";

// The last answer on this phone, so a driver who never invoices is not asked
// again on every Home visit.
let lastAnswer: { usesInvoices: boolean } | null = null;

/** Work drivers the shortcut could ever be for (the personas with a Tax row). */
export function couldUseInvoiceDoor(mode: "work" | "personal", persona: HomePersona): boolean {
  return mode === "work" && (persona === "gig" || persona === "both" || persona === "employee");
}

export function useInvoiceDoor(args: {
  mode: "work" | "personal";
  persona: HomePersona;
  refreshKey?: number;
}): { usesInvoices: boolean; text: string | null } {
  const want = couldUseInvoiceDoor(args.mode, args.persona);
  const [res, setRes] = useState<InvoiceListResponse | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocusTick((n) => n + 1);
    }, [])
  );

  useEffect(() => {
    if (!want) {
      setRes(null);
      return;
    }
    let cancelled = false;
    insightsCache
      .get("more|invoices", () => fetchInvoices({ pageSize: 1 }), invoiceDoorFreshMs(lastAnswer))
      .then((r) => {
        lastAnswer = { usesInvoices: usesInvoicesRecently(r.lastCreatedAt, new Date()) };
        if (!cancelled) setRes(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [want, args.refreshKey, focusTick]);

  const usesInvoices = want && usesInvoicesRecently(res?.lastCreatedAt, new Date());
  return { usesInvoices, text: usesInvoices ? invoicesDoorText(res?.summary) : null };
}
