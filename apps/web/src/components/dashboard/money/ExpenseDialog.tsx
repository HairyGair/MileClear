"use client";

import { useState } from "react";
import type { Expense, Vehicle } from "@mileclear/shared";
import { EXPENSE_CATEGORIES } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, ConfirmDialog, DateField, Dialog, MoneyField, SelectField, TextArea, TextField, useData, useToast } from "../kit";
import { isoDay, todayIso } from "./format";
import s from "./money.module.css";

export type ExpenseRow = Expense & { projectLabel?: string | null };

interface Props {
  open: boolean;
  expense: ExpenseRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const MILEAGE_NOTE =
  "This is a vehicle running cost. If you claim the mileage rate for this vehicle, the rate already covers it, so it won't lower your tax on top.";

function Form({ expense, onClose, onSaved }: Omit<Props, "open">) {
  const toast = useToast();
  const vehicles = useData<Vehicle[]>("vehicles-for-expense", () => api.get<{ data: Vehicle[] }>("/vehicles").then((r) => r.data));
  const [category, setCategory] = useState(expense?.category ?? "");
  const [amount, setAmount] = useState<number | null>(expense?.amountPence ?? null);
  const [date, setDate] = useState(expense ? isoDay(expense.date) : todayIso());
  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [vehicleId, setVehicleId] = useState(expense?.vehicleId ?? "");
  const [project, setProject] = useState(expense?.projectLabel ?? "");
  const [note, setNote] = useState(expense?.notes ?? "");
  const [errors, setErrors] = useState<{ category?: string; amount?: string; date?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cat = EXPENSE_CATEGORIES.find((c) => c.value === category);

  async function save() {
    const next: typeof errors = {};
    if (!category) next.category = "Pick a category.";
    if (amount === null || amount <= 0) next.amount = "Enter an amount above £0.";
    if (!date) next.date = "Pick a date.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        category,
        amountPence: amount,
        date,
        vendor: vendor.trim() || undefined,
        vehicleId: vehicleId || undefined,
        projectLabel: project.trim() || undefined,
        notes: note.trim() || undefined,
      };
      if (expense) await api.patch(`/expenses/${expense.id}`, body);
      else await api.post("/expenses", body);
      toast.show("Saved");
      onSaved();
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const vehicleOptions = [
    { value: "", label: "No vehicle" },
    ...(vehicles.data ?? []).map((v) => ({ value: v.id, label: `${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle" })),
  ];

  return (
    <>
      <Dialog
        open
        title={expense ? "Edit expense" : "Add expense"}
        onClose={onClose}
        footer={
          <>
            {expense && (
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
          <SelectField
            label="Category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setErrors((e) => ({ ...e, category: undefined }));
            }}
            error={errors.category}
            options={[{ value: "", label: "Choose a category" }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]}
          />
          {cat && !cat.deductibleWithMileage && <p className={s.hint}>{MILEAGE_NOTE}</p>}
          <div className={s.formRow}>
            <MoneyField label="Amount" value={amount} onChange={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: undefined })); }} error={errors.amount} />
            <DateField label="Date" value={date} onChange={(v) => { setDate(v); setErrors((e) => ({ ...e, date: undefined })); }} error={errors.date} />
          </div>
          <TextField label="Vendor" value={vendor} onChange={setVendor} required={false} maxLength={200} />
          <div className={s.formRow}>
            <SelectField label="Vehicle" value={vehicleId} onChange={setVehicleId} required={false} options={vehicleOptions} />
            <TextField label="Project" value={project} onChange={setProject} required={false} maxLength={100} />
          </div>
          <TextArea label="Note" value={note} onChange={setNote} required={false} rows={3} maxLength={2000} />
          {formError && (
            <p className={s.formError} role="alert">
              {formError}
            </p>
          )}
        </div>
      </Dialog>
      {expense && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this expense?"
          body="It goes from your records and any totals. This can't be undone."
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.delete(`/expenses/${expense.id}`);
            toast.show("Deleted");
            onSaved();
            onClose();
          }}
        />
      )}
    </>
  );
}

/** Add or edit an expense with the 15 SA103S-mapped categories. */
export function ExpenseDialog({ open, expense, onClose, onSaved }: Props) {
  if (!open) return null;
  return <Form key={expense?.id ?? "new"} expense={expense} onClose={onClose} onSaved={onSaved} />;
}
