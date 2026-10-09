"use client";

import { useState } from "react";
import { Button, PageHeader, SettingsGroup, SettingsRow } from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

interface ScanResult {
  scanned?: number;
  candidateCount?: number;
}

// Your data: download everything, check trips for problems, delete the account.
export default function DataPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);

  async function download() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await api.get<unknown>("/user/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mileclear-data-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(errMsg(e, "Couldn't download your data. Try again in a moment."));
    } finally {
      setExporting(false);
    }
  }

  async function check() {
    setScanning(true);
    setScanError(null);
    try {
      // scanOnly: look, don't change anything.
      const res = await api.post<{ data?: ScanResult }>("/trips/scan-low-confidence", { scanOnly: true });
      setScan(res.data ?? {});
    } catch (e) {
      setScanError(errMsg(e, "Couldn't check your trips. Try again in a moment."));
    } finally {
      setScanning(false);
    }
  }

  const scanned = scan?.scanned ?? 0;
  const found = scan?.candidateCount ?? 0;

  return (
    <>
      <PageHeader title="Your data" back={{ href: "/dashboard/settings", label: "Settings" }} />
      <div className={styles.page}>
        <SettingsGroup title="Download" footer="Everything MileClear holds about you, as one file you can keep.">
          <div className="mc-row">
            <span className="mc-row__text">
              <span className="mc-row__label">Download all your data (JSON)</span>
              {exportError && <span className={styles.inlineError} role="alert">{exportError}</span>}
            </span>
            <Button variant="secondary" size="sm" icon="download-outline" loading={exporting} onClick={() => void download()}>
              Download
            </Button>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Check your trips" footer="Looks for trips whose route or distance may be off. It doesn't change anything.">
          <div className="mc-row">
            <span className="mc-row__text">
              <span className="mc-row__label">Check my trips for problems</span>
              {scan && (
                <span className="mc-row__hint" role="status">
                  We checked {scanned.toLocaleString("en-GB")} {scanned === 1 ? "trip" : "trips"} and found {found.toLocaleString("en-GB")} to look at.
                </span>
              )}
              {scanError && <span className={styles.inlineError} role="alert">{scanError}</span>}
            </span>
            <Button variant="secondary" size="sm" loading={scanning} onClick={() => void check()}>
              Check
            </Button>
          </div>
          {scan && found > 0 && <SettingsRow icon="file-tray-full-outline" label="Open your Inbox" href="/dashboard/trips?view=inbox" />}
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow icon="trash-outline" label="Delete account" hint="Remove your account and everything in it" href="/dashboard/profile" />
        </SettingsGroup>
      </div>
    </>
  );
}
