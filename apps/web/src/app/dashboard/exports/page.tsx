"use client";

import { useState, useCallback } from "react";
import { getTaxYear } from "@mileclear/shared";
import { fetchWithAuth } from "../../../lib/api";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
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
  const { user } = useAuth();
  const taxYears = generateTaxYears(4);
  const [selectedYear, setSelectedYear] = useState(taxYears[0]);
  const [premiumError, setPremiumError] = useState(false);

  if (!(user?.isPremium)) {
    return (
      <>
        <PageHeader title="Exports" subtitle="Download trip reports and tax documents" />
        <div className="premium-gate">
          <div className="premium-gate__icon">&#9888;</div>
          <h2 className="premium-gate__title">Upgrade to Pro</h2>
          <p className="premium-gate__text">
            CSV exports, PDF trip reports, and HMRC self-assessment documents are available with a MileClear Pro subscription.
          </p>
          <a href="/dashboard/settings" className="btn btn--primary">Manage Subscription</a>
        </div>
      </>
    );
  }

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
        subtitle="Professional HMRC-compliant reports with branded trip data, vehicle breakdowns, and tax deduction summaries."
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
        {/* Self-Assessment — featured */}
        <div className="export-card" style={{ borderColor: "rgba(16, 185, 129, 0.3)" }}>
          <div className="export-card__title">
            HMRC Self-Assessment
            <Badge variant="success">HMRC COMPLIANT</Badge>
          </div>
          <p className="export-card__desc">
            Complete tax report with vehicle breakdown, monthly summary, HMRC rate explanation, and unique report reference. Ready for your accountant.
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

        {/* PDF */}
        <div className="export-card">
          <div className="export-card__title">Trip Report (PDF)</div>
          <p className="export-card__desc">
            Branded trip-by-trip report with summary statistics and unique audit reference. Professional record keeping.
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

        {/* CSV */}
        <div className="export-card">
          <div className="export-card__title">Trip Data (CSV)</div>
          <p className="export-card__desc">
            Raw trip data with HMRC rates and deductions. Import into Excel, Google Sheets, or accounting software.
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
