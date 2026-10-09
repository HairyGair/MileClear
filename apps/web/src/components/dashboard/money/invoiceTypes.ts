export type InvoiceStatus = "sent" | "paid" | "overdue" | "written_off";

export interface Invoice {
  id: string;
  company: string;
  clientId: string | null;
  clientEmail: string | null;
  reference: string | null;
  invoiceNumber: number | null;
  amountPence: number;
  subtotalPence: number | null;
  vatRate: number | null;
  vatPence: number | null;
  sentAt: string;
  dueAt: string;
  paidAt: string | null;
  status: InvoiceStatus;
  notes: string | null;
  emailedAt: string | null;
  autoChaseEnabled: boolean;
  nextChaseAt: string | null;
  lineItems?: Array<{ id?: string; description: string; quantity: string | number; unitPricePence: number }>;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  notes?: string | null;
  archivedAt: string | null;
  _count?: { invoices: number };
}

export interface EarningMatch {
  id: string;
  platform: string;
  amountPence: number;
  periodStart: string;
  notes: string | null;
  daysFromAnchor: number;
}

export interface InvoiceMutation {
  data: Invoice;
  potentialEarningMatches?: EarningMatch[];
}

export const STATUS_META: Record<InvoiceStatus, { label: string; tone: "neutral" | "amber" | "green" | "red" }> = {
  sent: { label: "Awaiting payment", tone: "amber" },
  overdue: { label: "Overdue", tone: "red" },
  paid: { label: "Paid", tone: "green" },
  written_off: { label: "Written off", tone: "neutral" },
};

export const FREE_INVOICES_PER_MONTH = 3;

/** How many invoices were sent in the same UTC month as `now` (the API counts by sent date). */
export function sentThisMonth(invoices: Pick<Invoice, "sentAt">[], now: Date = new Date()): number {
  return invoices.filter((i) => {
    const d = new Date(i.sentAt);
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }).length;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
