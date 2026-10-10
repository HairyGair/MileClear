// What the invoice PDF prints about the driver, and what is missing.
//
// Server side (services/export.ts generateInvoicePdf) never refuses an
// invoice: it falls back to full name / display name / "Sole trader" for the
// heading and simply leaves out the address, VAT line and "How to pay" block
// when they are empty. So "required" here means "needed for an invoice a
// client can act on": a name, an address, bank details to pay into, and the
// VAT number if the driver says they are VAT registered.

export interface InvoiceDetailsSource {
  tradingName?: string | null;
  fullName?: string | null;
  businessAddress?: string | null;
  vatRegistered?: boolean | null;
  vatNumber?: string | null;
  bankAccountName?: string | null;
  bankSortCode?: string | null;
  bankAccountNumber?: string | null;
}

export interface InvoiceDetailsSummary {
  name: string | null;
  address: string | null;
  /** Account number masked to its last four digits, e.g. "••••5678". */
  bankMasked: string | null;
  vat: string | null;
  /** Plain-English names of what is missing, in the order to ask for it. */
  missing: string[];
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

export function maskAccountNumber(n: string | null | undefined): string | null {
  const digits = clean(n).replace(/\D/g, "");
  if (!digits) return null;
  return `••••${digits.slice(-4)}`;
}

export function summariseInvoiceDetails(p: InvoiceDetailsSource | null | undefined): InvoiceDetailsSummary {
  const name = clean(p?.tradingName) || clean(p?.fullName) || null;
  const address = clean(p?.businessAddress) || null;
  const bankMasked = maskAccountNumber(p?.bankAccountNumber);
  const hasBank = !!clean(p?.bankAccountName) && clean(p?.bankSortCode).length > 0 && bankMasked !== null;
  const vatRegistered = p?.vatRegistered === true;
  const vatNumber = clean(p?.vatNumber) || null;

  const missing: string[] = [];
  if (!name) missing.push("your name");
  if (!address) missing.push("your address");
  if (!hasBank) missing.push("your bank details");
  if (vatRegistered && !vatNumber) missing.push("your VAT number");

  return {
    name,
    address,
    bankMasked,
    vat: vatRegistered ? vatNumber : null,
    missing,
  };
}

/** "your name, your address and your bank details" */
export function listMissing(missing: string[]): string {
  if (missing.length <= 1) return missing[0] ?? "";
  return `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
}
