"use client";

import { useState, type FormEvent } from "react";
import { MISSING_BANK_MAX_LENGTH, OPEN_BANKING_BANKS, OPEN_BANKING_BUSINESS_BANKS } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, Card, TextField } from "@/components/dashboard/kit";
import s from "./money.module.css";

/**
 * Which banks the bank link works with, and "My bank isn't listed". Shown
 * before the Pro gate too, so nobody pays to find their bank missing
 * (Jason Clarke, Co-operative Bank, 24 Oct 2026).
 */
export function BanksThatWork() {
  const [bank, setBank] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const name = bank.trim();
    if (name.length < 2) {
      setProblem("Type your bank's name.");
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await api.post("/earnings/open-banking/missing-bank", { bank: name });
      setSent(name);
      setBank("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn't send. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Banks that work">
      <p className={s.totalLine}>
        You can link a personal account at {OPEN_BANKING_BANKS.join(", ")}. Business accounts work too at{" "}
        {OPEN_BANKING_BUSINESS_BANKS.join(", ")}.
      </p>
      {sent ? (
        <p className={s.totalLine} role="status">
          Thanks, we&apos;ve noted {sent}. We&apos;ll ask our banking partner, TrueLayer, to add it. Until then you can
          add earnings by hand, or import a platform&apos;s earnings file, on the Earnings page.
        </p>
      ) : (
        <form onSubmit={send} className={s.stack}>
          <TextField
            label="My bank isn't listed"
            hint="Tell us which bank and we'll ask TrueLayer to add it."
            value={bank}
            onChange={(v) => {
              setBank(v);
              if (problem) setProblem(null);
            }}
            placeholder="e.g. Co-operative Bank"
            maxLength={MISSING_BANK_MAX_LENGTH}
            error={problem ?? undefined}
          />
          <div className={s.actions}>
            <Button type="submit" variant="secondary" loading={sending} disabled={bank.trim().length < 2}>
              Send
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
