"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CsvParsePreview } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, Card, EmptyState, PageHeader, SelectField, useToast } from "@/components/dashboard/kit";
import { ProPage, SelfEmployedOnly } from "@/components/dashboard/money/Company";
import { periodLabel, platformLabel } from "@/components/dashboard/money/format";
import { formatPence } from "@/lib/dashboard/format";
import s from "@/components/dashboard/money/money.module.css";

function Importer() {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState("");
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<CsvParsePreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(null);
    setProblem(null);
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.onerror = () => setProblem("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function runPreview() {
    if (!csv) {
      setProblem("Choose a CSV file first.");
      return;
    }
    setBusy("preview");
    setProblem(null);
    try {
      const res = await api.post<{ data: CsvParsePreview }>("/earnings/csv/preview", { csvContent: csv, platform: platform || undefined });
      setPreview(res.data);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't read that CSV.");
    } finally {
      setBusy(null);
    }
  }

  const fresh = preview ? preview.rows.filter((r) => !r.isDuplicate) : [];

  async function runImport() {
    if (!preview) return;
    setBusy("import");
    setProblem(null);
    try {
      const res = await api.post<{ data: { imported: number; skipped: number } }>("/earnings/csv/confirm", { rows: preview.rows, filename });
      toast.show(`${res.data.imported} ${res.data.imported === 1 ? "earning" : "earnings"} imported`);
      router.push("/dashboard/earnings");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't import. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className={s.stack}>
      <Card title="Choose a file">
        <div className={s.form}>
          <SelectField label="Platform" value={platform} onChange={setPlatform} hint="Leave on automatic and we'll work it out from the file." options={[{ value: "", label: "Detect automatically" }, ...GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))]} />
          <div>
            <label className={s.fileLabel} htmlFor="earnings-csv">
              CSV file
            </label>
            <input id="earnings-csv" ref={fileRef} className={s.file} type="file" accept=".csv,text/csv" onChange={pick} />
          </div>
          {problem && (
            <p className={s.formError} role="alert">
              {problem}
            </p>
          )}
          <div className={s.actions}>
            <Button variant={preview ? "secondary" : "primary"} loading={busy === "preview"} onClick={runPreview}>
              Preview
            </Button>
          </div>
        </div>
      </Card>

      {preview && (
        <Card title="Preview">
          {preview.rows.length === 0 ? (
            <EmptyState size="card" icon="document-text-outline" title="No earnings found" body="We couldn't find any rows we recognise in that file." />
          ) : (
            <>
              <p className={s.totalLine}>
                <strong>{fresh.length}</strong> new {fresh.length === 1 ? "earning" : "earnings"} worth <strong>{formatPence(fresh.reduce((n, r) => n + r.amountPence, 0))}</strong>
                {preview.duplicateCount > 0 ? `. ${preview.duplicateCount} already in MileClear will be skipped.` : "."}
              </p>
              <div className={s.preview}>
                {preview.rows.map((r) => (
                  <div key={r.externalId} className={s.kv}>
                    <span>
                      {periodLabel(r.periodStart, r.periodEnd)} · {platformLabel(r.platform)}
                      {r.isDuplicate ? " (already added)" : ""}
                    </span>
                    <span className={s.rowFig}>{formatPence(r.amountPence)}</span>
                  </div>
                ))}
              </div>
              <div className={s.actions}>
                <Button variant="primary" loading={busy === "import"} disabled={fresh.length === 0} onClick={runImport}>
                  Import {fresh.length} {fresh.length === 1 ? "earning" : "earnings"}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

const BACK = { href: "/dashboard/earnings", label: "Earnings" };

export default function Page() {
  return (
    <SelfEmployedOnly title="Import earnings" back={BACK}>
      <ProPage title="Import earnings" back={BACK} reason="csv_import" teaser={<p>Bring in a CSV from Uber, Deliveroo, Just Eat and more.</p>}>
        <PageHeader title="Import earnings" back={BACK} />
        <Importer />
      </ProPage>
    </SelfEmployedOnly>
  );
}
