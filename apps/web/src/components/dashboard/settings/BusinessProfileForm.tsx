"use client";

// Business profile for the invoice builder: trading name, logo, colour, VAT,
// bank details (stored encrypted by the API), payment terms and numbering.
// The logo is resized in the browser to 600px or less before upload; the API
// accepts PNG or JPEG up to 1 MB and checks the file type itself.

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardError,
  NumberField,
  SelectField,
  TextField,
  Toggle,
  useToast,
} from "../kit";
import { api, fetchWithAuth } from "../../../lib/api";
import { errMsg } from "./util";
import styles from "./settings.module.css";

interface BusinessProfile {
  tradingName: string | null;
  businessAddress: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  invoiceAccentColor: string | null;
  invoicePaymentTermsDays: number;
  nextInvoiceNumber: number;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
}

const ACCENTS = [
  { value: "", label: "MileClear amber (default)" },
  { value: "#f5a623", label: "Amber" },
  { value: "#10b981", label: "Emerald" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ef4444", label: "Red" },
  { value: "#030712", label: "Navy" },
];

async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 512 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/png"));
}

export function BusinessProfileForm() {
  const { show } = useToast();
  const [loaded, setLoaded] = useState(false);
  // A failed load must not show an empty form: saving it would wipe the profile.
  const [loadFailed, setLoadFailed] = useState(false);
  const [tradingName, setTradingName] = useState("");
  const [address, setAddress] = useState("");
  const [vat, setVat] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [accent, setAccent] = useState("");
  const [terms, setTerms] = useState("30");
  const [nextNumber, setNextNumber] = useState("1");
  const [bankName, setBankName] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadLogo() {
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
  }

  function loadProfile() {
    setLoaded(false);
    setLoadFailed(false);
    api
      .get<{ data: BusinessProfile }>("/user/profile")
      .then(({ data }) => {
        setTradingName(data.tradingName ?? "");
        setAddress(data.businessAddress ?? "");
        setVat(data.vatRegistered ?? false);
        setVatNumber(data.vatNumber ?? "");
        setAccent(data.invoiceAccentColor ?? "");
        setTerms(String(data.invoicePaymentTermsDays ?? 30));
        setNextNumber(String(data.nextInvoiceNumber ?? 1));
        setBankName(data.bankAccountName ?? "");
        setSortCode(data.bankSortCode ?? "");
        setAccountNumber(data.bankAccountNumber ?? "");
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoaded(true));
  }

  useEffect(() => {
    loadProfile();
    void loadLogo();
    return () => setLogoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = parseInt(nextNumber, 10);
      await api.patch("/user/profile", {
        tradingName: tradingName.trim() || null,
        businessAddress: address.trim() || null,
        vatRegistered: vat,
        vatNumber: vat ? vatNumber.trim() || null : null,
        invoiceAccentColor: accent || null,
        invoicePaymentTermsDays: Math.min(90, Math.max(1, parseInt(terms, 10) || 30)),
        ...(next > 0 ? { nextInvoiceNumber: next } : {}),
        bankAccountName: bankName.trim() || null,
        bankSortCode: sortCode.trim() || null,
        bankAccountNumber: accountNumber.trim() || null,
      });
      show("Saved");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      form.append("file", blob, "logo.png");
      const res = await fetchWithAuth("/user/logo", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't upload that file. Use a PNG or JPEG.");
      }
      await loadLogo();
      show("Logo uploaded");
    } catch (e) {
      setLogoError(errMsg(e, "Couldn't upload that file."));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await api.delete("/user/logo");
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      show("Logo removed");
    } catch (e) {
      setLogoError(errMsg(e, "Couldn't remove the logo."));
    } finally {
      setLogoBusy(false);
    }
  }

  if (!loaded) return null;
  if (loadFailed) return <CardError onRetry={loadProfile} />;

  return (
    <div className={styles.page}>
      <Card title="Logo">
        <div className={styles.fields}>
          <div className={styles.avatarRow}>
            <div className={styles.logoBox}>
              {logoUrl ? (
                <img src={logoUrl} alt="Your business logo" />
              ) : (
                <span>No logo</span>
              )}
            </div>
            <input
              ref={fileRef}
              className={styles.hidden}
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Choose a logo file"
              onChange={(e) => void pickLogo(e.target.files?.[0])}
            />
            <div className={styles.actions}>
              <Button variant="secondary" size="sm" loading={logoBusy} onClick={() => fileRef.current?.click()}>
                {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" disabled={logoBusy} onClick={() => void removeLogo()}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          {logoError && <p className={styles.inlineError} role="alert">{logoError}</p>}
          <p className={styles.muted}>PNG or JPEG. It appears on your invoices.</p>
        </div>
      </Card>

      <Card title="Details">
        <div className={styles.fields}>
          <div className={styles.pair}>
            <TextField label="Trading name" value={tradingName} onChange={setTradingName} maxLength={120} placeholder="e.g. Sam's Couriers" />
            <SelectField label="Invoice accent colour" value={accent} onChange={setAccent} options={ACCENTS} />
          </div>
          <TextField label="Business address" value={address} onChange={setAddress} maxLength={600} placeholder="1 High Street, Slough, SL1 1AA" />
          <Toggle label="VAT registered" value={vat} onChange={setVat} />
          {vat && <TextField label="VAT number" value={vatNumber} onChange={setVatNumber} maxLength={20} placeholder="GB123456789" />}
        </div>
      </Card>

      <Card title="Bank details">
        <div className={styles.fields}>
          <p className={styles.muted}>Clients pay into this account. It&apos;s stored encrypted.</p>
          <TextField label="Account name" value={bankName} onChange={setBankName} autoComplete="off" />
          <div className={styles.pair}>
            <TextField label="Sort code" value={sortCode} onChange={setSortCode} placeholder="12-34-56" autoComplete="off" />
            <TextField label="Account number" value={accountNumber} onChange={setAccountNumber} placeholder="12345678" autoComplete="off" />
          </div>
        </div>
      </Card>

      <Card title="Invoice numbers and terms">
        <div className={styles.fields}>
          <div className={styles.pair}>
            <NumberField label="Payment terms" suffix="days" decimals={false} value={terms} onChange={setTerms} />
            <NumberField
              label="Next invoice number"
              decimals={false}
              value={nextNumber}
              onChange={setNextNumber}
              hint="Coming from another system? Set this to carry on your numbering."
            />
          </div>
        </div>
      </Card>

      {error && <p className={styles.inlineError} role="alert">{error}</p>}
      <div className={styles.actions}>
        <Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button>
      </div>
    </div>
  );
}
