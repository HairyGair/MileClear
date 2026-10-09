"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatPence } from "@/lib/dashboard/format";
import { Button, Dialog, useToast } from "../kit";
import { dayLabel, platformLabel } from "./format";
import type { EarningMatch } from "./invoiceTypes";
import s from "./money.module.css";

/**
 * Stops one payment being counted twice: link the invoice to the earning you
 * already added for it. Used after marking paid and from "Link a payment".
 */
export function LinkEarningDialog({
  open,
  invoiceId,
  matches,
  title = "Is one of these the same payment?",
  onClose,
  onLinked,
}: {
  open: boolean;
  invoiceId: string;
  matches: EarningMatch[];
  title?: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function link(id: string) {
    setBusy(id);
    setProblem(null);
    try {
      await api.post(`/invoices/${invoiceId}/link-earning`, { earningId: id });
      toast.show("Linked");
      onLinked();
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't link that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} title={title} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Keep them separate</Button>}>
      {matches.length === 0 ? (
        <p className={s.totalLine}>No earnings to link yet. Add the payment under Earnings first.</p>
      ) : (
        <>
          <p className={s.totalLine}>Linking stops the payment counting twice in your income.</p>
          {matches.map((m) => (
            <div key={m.id} className={s.kv}>
              <span className={s.rowMain}>
                <span className={s.rowTitle}>
                  {platformLabel(m.platform)}, {formatPence(m.amountPence)}
                </span>
                <span className={s.rowSub}>{dayLabel(m.periodStart)}</span>
              </span>
              <Button variant="secondary" size="sm" loading={busy === m.id} onClick={() => link(m.id)}>
                Link
              </Button>
            </div>
          ))}
        </>
      )}
      {problem && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}
