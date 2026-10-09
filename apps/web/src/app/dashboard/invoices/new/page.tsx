"use client";

import { PageHeader } from "@/components/dashboard/kit";
import { SelfEmployedOnly } from "@/components/dashboard/money/Company";
import { InvoiceForm } from "@/components/dashboard/money/InvoiceForm";

const BACK = { href: "/dashboard/invoices", label: "Invoices" };

export default function Page() {
  return (
    <SelfEmployedOnly title="New invoice" back={BACK}>
      <PageHeader title="New invoice" back={BACK} />
      <InvoiceForm />
    </SelfEmployedOnly>
  );
}
