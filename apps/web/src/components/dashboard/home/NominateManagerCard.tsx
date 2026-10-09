"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { safeGet, safeSet } from "../../../lib/dashboard/mode";
import { useData } from "../../../lib/dashboard/useData";
import { useMe } from "../../../lib/dashboard/useMe";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Dialog } from "../kit/Dialog";
import { TextField } from "../kit/Fields";
import { useToast } from "../kit/Toast";
import type { GamificationStats } from "@mileclear/shared";

const KEY = "mc_nominate_dismissed";

/** Employees with business miles can nominate their manager for Milesheet. */
export function NominateManagerCard() {
  const { isEmployee, isCompanyDriver, teamReady } = useMe();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = isEmployee && !isCompanyDriver && teamReady;
  const { data } = useData(eligible ? "gamification-stats" : null, () =>
    api.get<{ data: GamificationStats }>("/gamification/stats").then((r) => r.data)
  );

  useEffect(() => {
    setDismissed(safeGet(KEY) === "1");
  }, []);

  if (!eligible || dismissed || !data || data.businessMiles <= 0) return null;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/team/nominate-manager", { managerEmail: email.trim(), companyName: company.trim() });
      toast.show("We've emailed your manager");
      safeSet(KEY, "1");
      setDismissed(true);
      setOpen(false);
    } catch (e) {
      // A waiting-list answer comes back as an error with a friendly message.
      setError(e instanceof Error ? e.message : "Couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title="Does your employer pay for your mileage?">
        <p className="mc-mode-note">Name your manager and we&apos;ll tell them about Milesheet, the team portal for company drivers.</p>
        <div className="mc-pagehead__actions mc-pagehead__actions--spaced">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Nominate my manager
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              safeSet(KEY, "1");
              setDismissed(true);
            }}
          >
            No
          </Button>
        </div>
      </Card>
      <Dialog
        open={open}
        title="Nominate your manager"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={!email.includes("@") || company.trim().length < 2} onClick={send}>
              Send
            </Button>
          </>
        }
      >
        <TextField label="Manager's email" type="email" value={email} onChange={setEmail} />
        <TextField label="Company name" value={company} onChange={setCompany} />
        {error && <p className="mc-field__error" role="alert">{error}</p>}
      </Dialog>
    </>
  );
}
