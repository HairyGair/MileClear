"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { CsvTripImportResult, CsvTripParsePreview } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, Card, Figure, PageHeader, useToast, useUnclassifiedCount } from "@/components/dashboard/kit";
import { errorText } from "@/components/dashboard/trips/lib/labels";
import "@/components/dashboard/trips/trips.css";

const MAX_ROWS_SHOWN = 50;

export default function Page() {
  const toast = useToast();
  const unclassified = useUnclassifiedCount();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvTripParsePreview | null>(null);
  const [result, setResult] = useState<CsvTripImportResult | null>(null);
  const [busy, setBusy] = useState<"read" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy("read");
    setFileName(file.name);
    setResult(null);
    try {
      const csvContent = await file.text();
      const res = await api.post<{ data: CsvTripParsePreview }>("/trips/import/preview", { csvContent });
      setPreview(res.data);
    } catch (e) {
      setPreview(null);
      setError(errorText(e, "Couldn't read that file."));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy("import");
    setError(null);
    try {
      const res = await api.post<{ data: CsvTripImportResult }>("/trips/import/confirm", { rows: preview.rows });
      setResult(res.data);
      setPreview(null);
      unclassified.refresh();
      toast.show(`${res.data.imported} ${res.data.imported === 1 ? "trip" : "trips"} imported`);
    } catch (e) {
      setError(errorText(e, "The import didn't work. Try again."));
    } finally {
      setBusy(null);
    }
  }

  const importable = preview ? preview.rows.filter((r) => !r.isDuplicate).length : 0;

  return (
    <>
      <PageHeader
        title="Import trips"
        back={{ href: "/dashboard/trips", label: "Trips" }}
        primary={
          preview ? (
            <Button variant="primary" loading={busy === "import"} disabled={importable === 0} onClick={confirm}>
              {`Import ${importable} ${importable === 1 ? "trip" : "trips"}`}
            </Button>
          ) : undefined
        }
      >
        Moving from another mileage app? Export your trips as a CSV and choose the file here. You see what we found before anything is saved.
      </PageHeader>
      <div className="mc-import">
        {result ? (
          <Card>
            <div className="mc-stack mc-stack--tight">
              <Figure size="lg" label="Imported" value={`${result.imported} ${result.imported === 1 ? "trip" : "trips"}`} sub={`${result.totalMiles.toLocaleString("en-GB")} miles`} />
              {result.skippedDuplicates > 0 && <p>{result.skippedDuplicates} were already in MileClear, so they were skipped.</p>}
              {result.skippedErrors > 0 && <p>{result.skippedErrors} rows could not be read.</p>}
              <p>
                <Link href="/dashboard/trips?view=inbox" className="mc-textlink">
                  Sort your imported trips
                </Link>
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="mc-import__file">
              <label htmlFor="trips-csv" className="mc-field__label">
                Choose a CSV file of trips
              </label>
              <input
                id="trips-csv"
                ref={input}
                type="file"
                accept=".csv,text/csv"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              {busy === "read" && <p role="status">Reading {fileName}</p>}
            </div>
          </Card>
        )}

        {error && (
          <p className="mc-formerror" role="alert">
            {error}
          </p>
        )}

        {preview && (
          <>
            <p>
              Found <strong>{preview.totalRows}</strong> {preview.totalRows === 1 ? "trip" : "trips"} totalling{" "}
              <strong>{preview.totalMiles.toLocaleString("en-GB")} miles</strong>
              {preview.detectedSource ? ` from ${preview.detectedSource}` : ""}.
              {preview.convertedFromKm ? " Distances were converted from kilometres." : ""}
            </p>
            {preview.duplicateCount > 0 && (
              <p>
                <strong>{preview.duplicateCount}</strong> look like trips you already have, so they will be skipped rather than counted twice.
              </p>
            )}
            {preview.errors.length > 0 && (
              <details>
                <summary>
                  {preview.errors.length} {preview.errors.length === 1 ? "row" : "rows"} could not be read
                </summary>
                <ul>
                  {preview.errors.slice(0, 10).map((e) => (
                    <li key={e.line}>
                      Line {e.line}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mc-card mc-card--flush mc-import__preview">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                    <th scope="col" className="is-right">Miles</th>
                    <th scope="col">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, MAX_ROWS_SHOWN).map((r, i) => (
                    <tr key={`${r.date}-${i}`} style={r.isDuplicate ? { opacity: 0.55 } : undefined}>
                      <td>{r.date}</td>
                      <td>{r.from ?? "Not given"}</td>
                      <td>{r.to ?? "Not given"}</td>
                      <td className="is-right mc-num">{r.distanceMiles}</td>
                      <td>{r.isDuplicate ? "Already added" : r.classification === "unclassified" ? "Not sorted" : r.classification === "business" ? "Business" : "Personal"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > MAX_ROWS_SHOWN && <p>And {preview.rows.length - MAX_ROWS_SHOWN} more.</p>}
          </>
        )}
      </div>
    </>
  );
}
