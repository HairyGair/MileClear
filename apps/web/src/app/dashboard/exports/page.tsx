"use client";

import { useState, useCallback } from "react";
import { getTaxYear } from "@mileclear/shared";
import { fetchWithAuth } from "../../../lib/api";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";

function generateTaxYears(count: number): string[] {
  const current = getTaxYear(new Date());
  const startYear = parseInt(current.split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

type DownloadState = "idle" | "loading" | "done" | "error";

export default function ExportsPage() {
  const taxYears = generateTaxYears(4);
  const [selectedYear, setSelectedYear] = useState(taxYears[0]);
  const [premiumError, setPremiumError] = useState(false);

  const [csvState, setCsvState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");
  const [saState, setSaState] = useState<DownloadState>("idle");

  const [xeroPreview, setXeroPreview] = useState<string | null>(null);
  const [freeAgentPreview, setFreeAgentPreview] = useState<string | null>(null);
  const [quickBooksPreview, setQuickBooksPreview] = useState<string | null>(null);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof Error && err.message === "premium_required") {
      setPremiumError(true);
    }
  }, []);

  const handleDownload = useCallback(
    async (
      type: "csv" | "pdf" | "self-assessment",
      setState: (s: DownloadState) => void
    ) => {
      setState("loading");
      setPremiumError(false);
      try {
        const param = `taxYear=${selectedYear}`;
        const ext = type === "csv" ? "csv" : "pdf";
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const filename = `mileclear-${type}-${selectedYear}-${date}.${ext}`;

        const res = await fetchWithAuth(`/exports/${type}?${param}`);

        if (res.status === 403) throw new Error("premium_required");
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Download failed" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setState("done");
        setTimeout(() => setState("idle"), 2000);
      } catch (err) {
        handleError(err);
        setState("error");
        setTimeout(() => setState("idle"), 3000);
      }
    },
    [selectedYear, handleError]
  );

  const handlePreview = useCallback(
    async (
      provider: "xero" | "freeagent" | "quickbooks",
      setPreview: (p: string | null) => void
    ) => {
      setPremiumError(false);
      try {
        const result = await api.post<{ status: string; message: string; preview: unknown }>(
          `/exports/${provider}`,
          { taxYear: selectedYear }
        );
        setPreview(JSON.stringify(result.preview, null, 2));
      } catch (err) {
        handleError(err);
      }
    },
    [selectedYear, handleError]
  );

  const btnVariant = (state: DownloadState) => {
    if (state === "done") return "btn--primary";
    if (state === "error") return "btn--danger";
    return "btn--primary";
  };

  const stateLabel = (state: DownloadState, defaultLabel: string) => {
    switch (state) {
      case "loading": return "Downloading...";
      case "done": return "Downloaded!";
      case "error": return "Failed";
      default: return defaultLabel;
    }
  };

  return (
    <>
      <PageHeader
        title="Tax Exports"
        subtitle="Download your mileage data for HMRC self-assessment or your accountant."
      />

      {premiumError && (
        <div className="alert alert--error" style={{ marginBottom: "1.25rem" }}>
          Premium subscription required. Upgrade to access tax exports.
        </div>
      )}

      {/* Tax Year Selector */}
      <div style={{ marginBottom: "2rem", maxWidth: 200 }}>
        <Select
          id="taxYear"
          label="Tax Year"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          options={taxYears.map((y) => ({ value: y, label: y }))}
        />
      </div>

      {/* Downloads */}
      <h2 className="section-title">Downloads</h2>
      <div className="grid-auto" style={{ marginBottom: "2.5rem" }}>
        {/* CSV */}
        <div className="export-card">
          <div className="export-card__title">Trip Data (CSV)</div>
          <p className="export-card__desc">
            All trips with HMRC rates and deductions. Import into Excel or Google Sheets.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleDownload("csv", setCsvState)}
            disabled={csvState === "loading"}
            className={btnVariant(csvState)}
            style={{ marginTop: "auto" }}
          >
            {stateLabel(csvState, "Download CSV")}
          </Button>
        </div>

        {/* PDF */}
        <div className="export-card">
          <div className="export-card__title">Trip Report (PDF)</div>
          <p className="export-card__desc">
            Formatted trip report with summary stats. Great for record keeping.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleDownload("pdf", setPdfState)}
            disabled={pdfState === "loading"}
            style={{ marginTop: "auto" }}
          >
            {stateLabel(pdfState, "Download PDF")}
          </Button>
        </div>

        {/* Self-Assessment */}
        <div className="export-card">
          <div className="export-card__title">Self-Assessment (PDF)</div>
          <p className="export-card__desc">
            HMRC mileage summary with vehicle breakdown and rate tiers.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleDownload("self-assessment", setSaState)}
            disabled={saState === "loading"}
            style={{ marginTop: "auto" }}
          >
            {stateLabel(saState, "Download PDF")}
          </Button>
        </div>
      </div>

      {/* Accounting Integrations */}
      <h2 className="section-title">Accounting Integrations</h2>
      <div className="grid-auto">
        {/* Xero */}
        <div className="export-card export-card--muted">
          <div className="export-card__title">
            Xero
            <Badge variant="coming-soon">Coming Soon</Badge>
          </div>
          <p className="export-card__desc">
            Auto-create mileage expense invoices in Xero.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePreview("xero", setXeroPreview)}
            style={{ marginTop: "auto" }}
          >
            Preview Export
          </Button>
          {xeroPreview && (
            <pre className="export-card__preview">{xeroPreview}</pre>
          )}
        </div>

        {/* FreeAgent */}
        <div className="export-card export-card--muted">
          <div className="export-card__title">
            FreeAgent
            <Badge variant="coming-soon">Coming Soon</Badge>
          </div>
          <p className="export-card__desc">
            Push mileage expenses directly to FreeAgent.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePreview("freeagent", setFreeAgentPreview)}
            style={{ marginTop: "auto" }}
          >
            Preview Export
          </Button>
          {freeAgentPreview && (
            <pre className="export-card__preview">{freeAgentPreview}</pre>
          )}
        </div>

        {/* QuickBooks */}
        <div className="export-card export-card--muted">
          <div className="export-card__title">
            QuickBooks
            <Badge variant="coming-soon">Coming Soon</Badge>
          </div>
          <p className="export-card__desc">
            Sync mileage purchases to QuickBooks Online.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePreview("quickbooks", setQuickBooksPreview)}
            style={{ marginTop: "auto" }}
          >
            Preview Export
          </Button>
          {quickBooksPreview && (
            <pre className="export-card__preview">{quickBooksPreview}</pre>
          )}
        </div>
      </div>
    </>
  );
}
