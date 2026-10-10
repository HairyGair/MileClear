import { describe, it, expect } from "vitest";
import { summariseInvoiceDetails, maskAccountNumber, listMissing } from "../details";

describe("invoice details", () => {
  it("masks all but the last four digits", () => {
    expect(maskAccountNumber("12345678")).toBe("••••5678");
    expect(maskAccountNumber("")).toBeNull();
    expect(maskAccountNumber(null)).toBeNull();
  });

  it("reports everything missing for an empty profile", () => {
    const s = summariseInvoiceDetails({});
    expect(s.missing).toEqual(["your name", "your address", "your bank details"]);
  });

  it("is complete with name, address and bank details", () => {
    const s = summariseInvoiceDetails({
      tradingName: "A Gair Deliveries",
      businessAddress: "1 High Street",
      bankAccountName: "A Gair",
      bankSortCode: "123456",
      bankAccountNumber: "12345678",
    });
    expect(s.missing).toEqual([]);
    expect(s.bankMasked).toBe("••••5678");
  });

  it("falls back to the full name when there is no trading name", () => {
    expect(summariseInvoiceDetails({ fullName: "Anthony Gair" }).name).toBe("Anthony Gair");
  });

  it("wants a VAT number only when VAT registered", () => {
    const base = { tradingName: "x", businessAddress: "y", bankAccountName: "z", bankSortCode: "123456", bankAccountNumber: "12345678" };
    expect(summariseInvoiceDetails({ ...base, vatRegistered: false }).missing).toEqual([]);
    expect(summariseInvoiceDetails({ ...base, vatRegistered: true }).missing).toEqual(["your VAT number"]);
    expect(summariseInvoiceDetails({ ...base, vatRegistered: true, vatNumber: "GB123" }).vat).toBe("GB123");
  });

  it("treats partial bank details as missing", () => {
    expect(summariseInvoiceDetails({ bankAccountNumber: "12345678" }).missing).toContain("your bank details");
  });

  it("lists missing items in plain English", () => {
    expect(listMissing(["a"])).toBe("a");
    expect(listMissing(["a", "b", "c"])).toBe("a, b and c");
  });
});
