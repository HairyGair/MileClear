"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorState, PageHeader, TextArea, TextField, useData, useToast, type Column } from "@/components/dashboard/kit";
import { SelfEmployedOnly } from "@/components/dashboard/money/Company";
import type { Client } from "@/components/dashboard/money/invoiceTypes";
import s from "@/components/dashboard/money/money.module.css";

const BACK = { href: "/dashboard/invoices", label: "Invoices" };

type Draft = { name: string; email: string; phone: string; addressLine1: string; addressLine2: string; city: string; postcode: string; notes: string };
const blank: Draft = { name: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", postcode: "", notes: "" };

function ClientForm({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(
    client
      ? { name: client.name, email: client.email ?? "", phone: client.phone ?? "", addressLine1: client.addressLine1 ?? "", addressLine2: client.addressLine2 ?? "", city: client.city ?? "", postcode: client.postcode ?? "", notes: client.notes ?? "" }
      : blank
  );
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setD((p) => ({ ...p, [k]: v }));

  async function save() {
    const next: typeof errors = {};
    if (!d.name.trim()) next.name = "Enter a name.";
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) next.email = "That doesn't look like an email address.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" && k !== "name" ? null : v.trim()]));
      if (client) await api.patch(`/clients/${client.id}`, body);
      else await api.post("/clients", body);
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
        title={client ? "Edit client" : "Add client"}
        onClose={onClose}
        footer={
          <>
            {client && (
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
          <TextField label="Name" value={d.name} onChange={set("name")} error={errors.name} maxLength={200} />
          <TextField label="Email" type="email" value={d.email} onChange={set("email")} required={false} error={errors.email} />
          <TextField label="Phone" type="tel" value={d.phone} onChange={set("phone")} required={false} />
          <TextField label="Address line 1" value={d.addressLine1} onChange={set("addressLine1")} required={false} />
          <TextField label="Address line 2" value={d.addressLine2} onChange={set("addressLine2")} required={false} />
          <div className={s.formRow}>
            <TextField label="Town or city" value={d.city} onChange={set("city")} required={false} />
            <TextField label="Postcode" value={d.postcode} onChange={set("postcode")} required={false} />
          </div>
          <TextArea label="Notes" value={d.notes} onChange={set("notes")} required={false} rows={3} />
          {formError && (
            <p className={s.formError} role="alert">
              {formError}
            </p>
          )}
        </div>
      </Dialog>
      {client && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this client?"
          body={(client._count?.invoices ?? 0) > 0 ? "Their invoices stay. The client is hidden from your list." : "It goes from your records. This can't be undone."}
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.delete(`/clients/${client.id}`);
            toast.show("Deleted");
            onSaved();
            onClose();
          }}
        />
      )}
    </>
  );
}

function Clients() {
  const { data, error, loading, reload } = useData<Client[]>("clients", () => api.get<{ data: Client[] }>("/clients").then((r) => r.data));
  const [dialog, setDialog] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });
  const isEmpty = !!data && data.length === 0;
  const add = () => setDialog({ open: true, client: null });

  const columns: Column<Client>[] = [
    { key: "name", label: "Name", render: (c) => c.name },
    { key: "email", label: "Email", render: (c) => c.email ?? "No email" },
    { key: "invoices", label: "Invoices", align: "right", render: (c) => String(c._count?.invoices ?? 0) },
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        back={BACK}
        primary={
          isEmpty ? undefined : (
            <Button variant="primary" icon="add" onClick={add}>
              Add client
            </Button>
          )
        }
      />
      {error && !data && <ErrorState title="Couldn't load your clients" onRetry={reload} />}
      {isEmpty ? (
        <EmptyState icon="people-outline" title="No clients yet" body="Add the people you bill and their details fill in on each invoice." action={{ label: "Add client", onClick: add }} />
      ) : (
        !(error && !data) && <DataTable columns={columns} rows={data ?? []} rowKey={(c) => c.id} loading={loading && !data} onRowClick={(c) => setDialog({ open: true, client: c })} />
      )}
      {dialog.open && <ClientForm key={dialog.client?.id ?? "new"} client={dialog.client} onClose={() => setDialog({ open: false, client: null })} onSaved={reload} />}
    </>
  );
}

export default function Page() {
  return (
    <SelfEmployedOnly title="Clients" back={BACK}>
      <Clients />
    </SelfEmployedOnly>
  );
}
