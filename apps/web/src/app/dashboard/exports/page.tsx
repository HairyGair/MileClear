"use client";

import { useState, useCallback } from "react";
import { getTaxYear } from "@mileclear/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

function generateTaxYears(count: number): string[] {
  const current = getTaxYear(new Date());
  const startYear = parseInt(current.split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });

  if (res.status === 403) {
    throw new Error("premium_required");
  }
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
}

async function postPreview(
  path: string,
  taxYear: string
): Promise<{ status: string; message: string; preview: unknown }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taxYear }),
  });

  if (res.status === 403) {
    throw new Error("premium_required");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
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
        const ext = type === "csv" ? "csv" : "pdf";
        const param =
          type === "self-assessment"
            ? `taxYear=${selectedYear}`
            : `taxYear=${selectedYear}`;
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const filename = `mileclear-${type}-${selectedYear}-${date}.${ext}`;
        await downloadFile(`/exports/${type}?${param}`, filename);
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
        const result = await postPreview(`/exports/${provider}`, selectedYear);
        setPreview(JSON.stringify(result.preview, null, 2));
      } catch (err) {
        handleError(err);
      }
    },
    [selectedYear, handleError]
  );

  function stateLabel(state: DownloadState, defaultLabel: string) {
    switch (state) {
      case "loading":
        return "Downloading...";
      case "done":
        return "Downloaded!";
      case "error":
        return "Failed";
      default:
        return defaultLabel;
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#030712",
        color: "#fff",
        fontFamily: "var(--font-sora), sans-serif",
        padding: "40px 24px",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Tax Exports
        </h1>
        <p style={{ color: "#9ca3af", marginBottom: 32, fontSize: 15 }}>
          Download your mileage data for HMRC self-assessment or your
          accountant.
        </p>

        {premiumError && (
          <div
            style={{
              backgroundColor: "#7c2d12",
              border: "1px solid #ea580c",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            Premium subscription required. Upgrade to access tax exports.
          </div>
        )}

        {/* Tax Year Selector */}
        <div style={{ marginBottom: 32 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "#9ca3af",
              marginBottom: 8,
            }}
          >
            Tax Year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              backgroundColor: "#111827",
              color: "#fff",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 15,
              cursor: "pointer",
              outline: "none",
              width: 180,
            }}
          >
            {taxYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Download Cards */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Downloads
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {/* CSV */}
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Trip Data (CSV)
            </div>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              All trips with HMRC rates and deductions. Import into Excel or
              Google Sheets.
            </p>
            <button
              onClick={() => handleDownload("csv", setCsvState)}
              disabled={csvState === "loading"}
              style={{
                backgroundColor:
                  csvState === "done"
                    ? "#16a34a"
                    : csvState === "error"
                      ? "#dc2626"
                      : "#f59e0b",
                color: "#030712",
                border: "none",
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: csvState === "loading" ? "wait" : "pointer",
                marginTop: "auto",
              }}
            >
              {stateLabel(csvState, "Download CSV")}
            </button>
          </div>

          {/* PDF */}
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Trip Report (PDF)
            </div>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              Formatted trip report with summary stats. Great for record
              keeping.
            </p>
            <button
              onClick={() => handleDownload("pdf", setPdfState)}
              disabled={pdfState === "loading"}
              style={{
                backgroundColor:
                  pdfState === "done"
                    ? "#16a34a"
                    : pdfState === "error"
                      ? "#dc2626"
                      : "#f59e0b",
                color: "#030712",
                border: "none",
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: pdfState === "loading" ? "wait" : "pointer",
                marginTop: "auto",
              }}
            >
              {stateLabel(pdfState, "Download PDF")}
            </button>
          </div>

          {/* Self-Assessment */}
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Self-Assessment (PDF)
            </div>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              HMRC mileage summary with vehicle breakdown and rate tiers.
            </p>
            <button
              onClick={() =>
                handleDownload("self-assessment", setSaState)
              }
              disabled={saState === "loading"}
              style={{
                backgroundColor:
                  saState === "done"
                    ? "#16a34a"
                    : saState === "error"
                      ? "#dc2626"
                      : "#f59e0b",
                color: "#030712",
                border: "none",
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: saState === "loading" ? "wait" : "pointer",
                marginTop: "auto",
              }}
            >
              {stateLabel(saState, "Download PDF")}
            </button>
          </div>
        </div>

        {/* Accounting Integrations */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Accounting Integrations
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {/* Xero */}
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: 12,
              padding: 20,
              opacity: 0.7,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Xero</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: "#374151",
                  color: "#9ca3af",
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                Coming Soon
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              Auto-create mileage expense invoices in Xero.
            </p>
            <button
              onClick={() => handlePreview("xero", setXeroPreview)}
              style={{
                backgroundColor: "#1f2937",
                color: "#9ca3af",
                border: "1px solid #374151",
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "auto",
              }}
            >
              Preview Export
            </button>
            {xeroPreview && (
              <pre
                style={{
                  backgroundColor: "#0a0f1a",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  color: "#6ee7b7",
                  overflow: "auto",
                  maxHeight: 200,
                  margin: 0,
                }}
              >
                {xeroPreview}
              </pre>
            )}
          </div>

          {/* FreeAgent */}
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: 12,
              padding: 20,
              opacity: 0.7,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>FreeAgent</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: "#374151",
                  color: "#9ca3af",
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                Coming Soon
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              Push mileage expenses directly to FreeAgent.
            </p>
            <button
              onClick={() =>
                handlePreview("freeagent", setFreeAgentPreview)
              }
              style={{
                backgroundColor: "#1f2937",
                color: "#9ca3af",
                border: "1px solid #374151",
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "auto",
              }}
            >
              Preview Export
            </button>
            {freeAgentPreview && (
              <pre
                style={{
                  backgroundColor: "#0a0f1a",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  color: "#6ee7b7",
                  overflow: "auto",
                  maxHeight: 200,
                  margin: 0,
                }}
              >
                {freeAgentPreview}
              </pre>
            )}
          </div>

          {/* QuickBooks */}
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: 12,
              padding: 20,
              opacity: 0.7,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                QuickBooks
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: "#374151",
                  color: "#9ca3af",
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                Coming Soon
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
              Sync mileage purchases to QuickBooks Online.
            </p>
            <button
              onClick={() =>
                handlePreview("quickbooks", setQuickBooksPreview)
              }
              style={{
                backgroundColor: "#1f2937",
                color: "#9ca3af",
                border: "1px solid #374151",
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "auto",
              }}
            >
              Preview Export
            </button>
            {quickBooksPreview && (
              <pre
                style={{
                  backgroundColor: "#0a0f1a",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  color: "#6ee7b7",
                  overflow: "auto",
                  maxHeight: 200,
                  margin: 0,
                }}
              >
                {quickBooksPreview}
              </pre>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
