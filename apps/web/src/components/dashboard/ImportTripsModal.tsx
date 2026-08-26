"use client";

import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import type { CsvTripParsePreview, CsvTripImportResult } from "@mileclear/shared";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the trip list can refresh. */
  onImported: (result: CsvTripImportResult) => void;
}

/**
 * Bring a mileage history over from another app.
 *
 * Two steps on purpose. Importing a year of trips is not undoable in one
 * click, and the parser has to guess which column is which, so the user
 * sees what we understood and what we will skip before anything is
 * written.
 */
export function ImportTripsModal({ open, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvTripParsePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFileName(null);
    setPreview(null);
    setError(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const csvContent = await file.text();
      const res = await api.post<{ data: CsvTripParsePreview }>(
        "/trips/import/preview",
        { csvContent }
      );
      setPreview(res.data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: CsvTripImportResult }>(
        "/trips/import/confirm",
        { rows: preview.rows }
      );
      onImported(res.data);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  };

  const importable = preview
    ? preview.rows.filter((r) => !r.isDuplicate).length
    : 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import trips from a CSV"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          {preview && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={busy || importable === 0}
            >
              {busy
                ? "Importing..."
                : `Import ${importable} trip${importable === 1 ? "" : "s"}`}
            </Button>
          )}
        </>
      }
    >
      {!preview && (
        <>
          <p style={{ marginBottom: "0.75rem" }}>
            Moving from another mileage app? Export your trips as a CSV and
            drop the file here. We read the common formats, and you will see
            exactly what we found before anything is saved.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose a CSV file of trips"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            disabled={busy}
          />
          {busy && <p style={{ marginTop: "0.75rem" }}>Reading {fileName}...</p>}
        </>
      )}

      {preview && (
        <>
          <p style={{ marginBottom: "0.75rem" }}>
            Found <strong>{preview.totalRows}</strong> trip
            {preview.totalRows === 1 ? "" : "s"} totalling{" "}
            <strong>{preview.totalMiles.toLocaleString("en-GB")} miles</strong>
            {preview.detectedSource ? ` from ${preview.detectedSource}` : ""}.
            {preview.convertedFromKm && " Distances were converted from kilometres."}
          </p>

          {preview.duplicateCount > 0 && (
            <p style={{ marginBottom: "0.75rem" }}>
              <strong>{preview.duplicateCount}</strong> of these look like trips
              you already have, so they will be skipped rather than counted twice.
            </p>
          )}

          {preview.errors.length > 0 && (
            <details style={{ marginBottom: "0.75rem" }}>
              <summary>
                {preview.errors.length} row
                {preview.errors.length === 1 ? "" : "s"} could not be read
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

          <div style={{ maxHeight: "14rem", overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Miles</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r, i) => (
                  <tr key={`${r.date}-${i}`} style={r.isDuplicate ? { opacity: 0.5 } : undefined}>
                    <td>{r.date}</td>
                    <td>{r.from ?? "-"}</td>
                    <td>{r.to ?? "-"}</td>
                    <td>{r.distanceMiles}</td>
                    <td>{r.isDuplicate ? "Already added" : r.classification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 50 && (
              <p>...and {preview.rows.length - 50} more.</p>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ marginTop: "0.75rem", color: "var(--danger, #ef4444)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
