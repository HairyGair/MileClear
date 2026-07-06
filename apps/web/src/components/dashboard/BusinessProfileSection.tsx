"use client";

// Business profile for the invoice builder (Get Paid, Jul 2026).
// Self-contained settings section: loads its own fields from /user/profile,
// saves via PATCH, and manages the logo (canvas-resized to ≤600px before
// upload; server accepts PNG/JPEG ≤1MB and sniffs magic bytes).

import { useState, useEffect, useRef } from "react";
import { api, fetchWithAuth } from "../../lib/api";
import { useToast } from "../ui/Toast";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

interface BusinessProfile {
  tradingName: string | null;
  businessAddress: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  invoiceAccentColor: string | null;
  invoicePaymentTermsDays: number;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
}

const ACCENT_SWATCHES = [
  { value: "", label: "MileClear amber (default)" },
  { value: "#f5a623", label: "Amber" },
  { value: "#10b981", label: "Emerald" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ef4444", label: "Red" },
  { value: "#030712", label: "Navy" },
];

/** Downscale to ≤600px longest edge and re-encode as PNG. Keeps every
 *  upload comfortably under the server's 1MB stored cap. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 512 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/png")
  );
}

export function BusinessProfileSection() {
  const { toast } = useToast();
  const [tradingName, setTradingName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [termsDays, setTermsDays] = useState("30");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<{ data: BusinessProfile }>("/user/profile")
      .then(({ data }) => {
        setTradingName(data.tradingName ?? "");
        setBusinessAddress(data.businessAddress ?? "");
        setVatRegistered(data.vatRegistered ?? false);
        setVatNumber(data.vatNumber ?? "");
        setAccentColor(data.invoiceAccentColor ?? "");
        setTermsDays(String(data.invoicePaymentTermsDays ?? 30));
        setBankAccountName(data.bankAccountName ?? "");
        setBankSortCode(data.bankSortCode ?? "");
        setBankAccountNumber(data.bankAccountNumber ?? "");
      })
      .catch(() => {});
    loadLogo();
  }, []);

  const loadLogo = async () => {
    try {
      const res = await fetchWithAuth("/user/logo");
      if (!res.ok) {
        setLogoUrl(null);
        return;
      }
      const blob = await res.blob();
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setLogoUrl(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/user/profile", {
        tradingName: tradingName.trim() || null,
        businessAddress: businessAddress.trim() || null,
        vatRegistered,
        vatNumber: vatRegistered ? vatNumber.trim() || null : null,
        invoiceAccentColor: accentColor || null,
        invoicePaymentTermsDays: Math.min(90, Math.max(1, parseInt(termsDays, 10) || 30)),
        bankAccountName: bankAccountName.trim() || null,
        bankSortCode: bankSortCode.trim() || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
      });
      toast("Business profile saved");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoPick = async (file: File | undefined) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      form.append("file", blob, "logo.png");
      const res = await fetchWithAuth("/user/logo", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
      await loadLogo();
      toast("Logo uploaded");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogoDelete = async () => {
    setLogoBusy(true);
    try {
      await api.delete("/user/logo");
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      toast("Logo removed");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section__title">Business Profile</h2>
      <p className="settings-section__desc">
        Appears on your generated invoices: your trading name, logo, colours and
        the bank details clients pay into. Bank details are stored encrypted.
      </p>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <div
          style={{
            width: 120,
            height: 56,
            borderRadius: 8,
            border: "1px dashed var(--border-subtle, rgba(255,255,255,0.15))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Business logo" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : (
            <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>No logo</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => handleLogoPick(e.target.files?.[0])}
        />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={logoBusy}>
          {logoBusy ? "Working…" : logoUrl ? "Replace logo" : "Upload logo"}
        </Button>
        {logoUrl && (
          <Button variant="ghost" onClick={handleLogoDelete} disabled={logoBusy}>
            Remove
          </Button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <Input
          id="bp-trading-name"
          label="Trading name"
          placeholder="e.g. L Joyce Bookkeeping"
          value={tradingName}
          onChange={(e) => setTradingName(e.target.value)}
        />
        <Select
          id="bp-accent"
          label="Invoice accent colour"
          value={accentColor}
          onChange={(e) => setAccentColor(e.target.value)}
          options={ACCENT_SWATCHES}
        />
      </div>
      <div style={{ margin: "0.75rem 0" }}>
        <Input
          id="bp-address"
          label="Business address"
          placeholder="1 High Street, Slough, SL1 1AA"
          value={businessAddress}
          onChange={(e) => setBusinessAddress(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={vatRegistered}
            onChange={(e) => setVatRegistered(e.target.checked)}
          />
          VAT registered
        </label>
        {vatRegistered && (
          <Input
            id="bp-vat-number"
            label="VAT number"
            placeholder="GB123456789"
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
          />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <Input
          id="bp-bank-name"
          label="Account name"
          placeholder="L Joyce"
          value={bankAccountName}
          onChange={(e) => setBankAccountName(e.target.value)}
        />
        <Input
          id="bp-sort-code"
          label="Sort code"
          placeholder="12-34-56"
          value={bankSortCode}
          onChange={(e) => setBankSortCode(e.target.value)}
        />
        <Input
          id="bp-account-number"
          label="Account number"
          placeholder="12345678"
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", alignItems: "end", marginBottom: "1rem" }}>
        <Input
          id="bp-terms"
          label="Default payment terms (days)"
          type="number"
          value={termsDays}
          onChange={(e) => setTermsDays(e.target.value)}
        />
        <div>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save business profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}
