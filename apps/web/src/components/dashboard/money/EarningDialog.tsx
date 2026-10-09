"use client";

import { useState } from "react";
import type { Earning } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, ConfirmDialog, DateField, Dialog, MoneyField, SelectField, TextField, useToast } from "../kit";
import { isoDay, todayIso } from "./format";
import s from "./money.module.css";

interface Props {
  open: boolean;
  /** Null adds a new earning. */
  earning: (Earning & { projectLabel?: string | null }) | null;
  onClose: () => void;
  onSaved: () => void;
}

function Form({ earning, onClose, onSaved }: Omit<Props, "open">) {
  const toast = useToast();
  const [platform, setPlatform] = useState(earning?.platform ?? "uber");
  const [amount, setAmount] = useState<number | null>(earning?.amountPence ?? null);
  const [start, setStart] = useState(earning ? isoDay(earning.periodStart) : todayIso());
  const [end, setEnd] = useState(earning ? isoDay(earning.periodEnd) : "");
  const [project, setProject] = useState(earning?.projectLabel ?? "");
  const [errors, setErrors] = useState<{ amount?: string; start?: string; end?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const next: typeof errors = {};
    if (amount === null || amount <= 0) next.amount = "Enter an amount above £0.";
    if (!start) next.start = "Pick a date.";
    const finish = end || start;
    if (start && finish < start) next.end = "The end date can't be before the start.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = { platform, amountPence: amount, periodStart: start, periodEnd: finish };
      if (earning) await api.patch(`/earnings/${earning.id}`, { ...body, projectLabel: project.trim() || null });
      else await api.post("/earnings", { ...body, projectLabel: project.trim() || undefined });
      toast.show("Saved");
      onSaved();
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog
        open
        title={earning ? "Edit earning" : "Add earning"}
        onClose={onClose}
        footer={
          <>
            {earning && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className={s.form}>
          <SelectField label="Platform" value={platform} onChange={setPlatform} options={GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))} />
          <MoneyField label="Amount" value={amount} onChange={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: undefined })); }} error={errors.amount} />
          <div className={s.formRow}>
            <DateField label="Date, or period start" value={start} onChange={setStart} error={errors.start} />
            <DateField label="Period end" value={end} onChange={setEnd} error={errors.end} required={false} hint="Leave blank for a single day." />
          </div>
          <TextField label="Project" value={project} onChange={setProject} required={false} maxLength={100} />
          {formError && (
            <p className={s.formError} role="alert">
              {formError}
            </p>
          )}
        </div>
      </Dialog>
      {earning && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this earning?"
          body="It goes from your records and any totals. This can't be undone."
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.delete(`/earnings/${earning.id}`);
            toast.show("Deleted");
            onSaved();
            onClose();
          }}
        />
      )}
    </>
  );
}

/** Add or edit an earning. Mounts its form only while open so every opening starts clean. */
export function EarningDialog({ open, earning, onClose, onSaved }: Props) {
  if (!open) return null;
  return <Form key={earning?.id ?? "new"} earning={earning} onClose={onClose} onSaved={onSaved} />;
}
