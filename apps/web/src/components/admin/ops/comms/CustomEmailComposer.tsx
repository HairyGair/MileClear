"use client";

// Comms: compose a custom email. Same calls as before the rebuild: a live,
// debounced POST /admin/email/preview-custom while typing, and
// POST /admin/email/send-custom with dryRun for a count. A test to one
// address sends straight away; any other audience goes through the confirm
// step with the recipient count.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Checkbox, Grid, Notice, Panel, SelectInput, Spinner, TextArea, TextInput, formatNumber } from "@/components/admin/ui";
import { SendConfirmDialog, SendFailedNotice, SendingNotice } from "./SendConfirm";

const EMAIL_AUDIENCES = [
  { value: "test", label: "Send a test to one address" },
  { value: "all", label: "All users" },
  { value: "active", label: "Active users (1+ trips)" },
  { value: "inactive", label: "Inactive users (0 trips)" },
  { value: "premium", label: "Premium users" },
  { value: "free", label: "Free users" },
];

export function CustomEmailComposer({ onLiveChange }: { onLiveChange: (live: boolean) => void }) {
  const [subject, setSubject] = useState("");
  const [eyebrow, setEyebrow] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [preheader, setPreheader] = useState("");
  const [includeGreeting, setIncludeGreeting] = useState(true);
  const [includeSignoff, setIncludeSignoff] = useState(true);
  const [audience, setAudience] = useState("test");
  const [testEmail, setTestEmail] = useState("anthonygair@icloud.com");
  const [gated, setGated] = useState(true);
  const [preview, setPreview] = useState("");
  const [sending, setSending] = useState<"dry" | "real" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; real: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dry, setDry] = useState<{ sig: string; count: number } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const payload = useCallback(
    () => ({ subject, eyebrow, title, bodyMarkdown: body, ctaLabel, ctaUrl, preheader, includeGreeting, includeSignoff }),
    [subject, eyebrow, title, body, ctaLabel, ctaUrl, preheader, includeGreeting, includeSignoff]
  );

  // Live, debounced preview as the form is typed.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await api.post<{ data: { html: string } }>("/admin/email/preview-custom", payload());
        setPreview(res.data.html);
      } catch {
        /* preview errors are non-fatal */
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [payload]);

  const isTest = audience === "test";
  const sig = `${audience}:${gated}`;

  const sendCustom = async (dryRun: boolean) => {
    if (sending) return;
    const real = !dryRun && !isTest;
    setSending(dryRun ? "dry" : "real");
    if (!dryRun) {
      setConfirmOpen(false);
      if (real) onLiveChange(true);
    }
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: any }>("/admin/email/send-custom", { ...payload(), audience, testEmail, gated, dryRun });
      const d = res.data;
      setResult(
        d.test
          ? dryRun
            ? `Dry run OK: would send a test to ${testEmail}`
            : `Test sent to ${testEmail}`
          : dryRun
            ? `Dry run: would send to ${formatNumber(d.sent)} of ${formatNumber(d.totalUsers)} users`
            : `Sent to ${formatNumber(d.sent)} users, ${formatNumber(d.errors)} errors`
      );
      if (dryRun && !d.test && typeof d.sent === "number") setDry({ sig, count: d.sent });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Send failed", real });
    } finally {
      setSending(null);
      if (real) onLiveChange(false);
    }
  };

  const canSend = !!(subject.trim() && title.trim() && body.trim() && (audience !== "test" || testEmail.trim()));
  const audienceText = EMAIL_AUDIENCES.find((a) => a.value === audience)?.label ?? audience;

  return (
    <Panel
      title="Compose a custom email"
      subtitle="Write it on the left, check the live preview on the right. Send a test to yourself first."
    >
      <Grid min={340}>
        <div className="adm-form">
          {sending === "real" && !isTest && <SendingNotice what="your email" />}

          <TextInput label="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What lands in their inbox" />
          <TextInput label="Eyebrow (small pill above the title)" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="e.g. PRODUCT UPDATE" />
          <TextInput label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The big bold title" />
          <TextArea
            label="Body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder={"Write your message here.\n\nBlank line = new paragraph.\n- start a line with a dash for bullets\n> a line starting with > is an amber callout\n**bold** and [links](https://mileclear.com) work too."}
            hint={
              <>
                Formatting: blank line = paragraph, <code>- </code> = bullet, <code>&gt; </code> = callout, <code>**bold**</code>, <code>[label](url)</code>
              </>
            }
          />
          <Grid min={180} gap="sm">
            <TextInput label="Button label (optional)" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Open MileClear" />
            <TextInput label="Button link (optional)" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://mileclear.com/..." />
          </Grid>
          <TextInput label="Preview text (optional inbox preview line)" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Defaults to the headline" />

          <div className="adm-actions" style={{ gap: "var(--adm-s4)" }}>
            <Checkbox checked={includeGreeting} onChange={setIncludeGreeting}>
              Include &quot;Hi {"{name}"},&quot;
            </Checkbox>
            <Checkbox checked={includeSignoff} onChange={setIncludeSignoff}>
              Include &quot;Cheers, Gair&quot;
            </Checkbox>
          </div>

          <fieldset className="adm-fieldset">
            <legend className="adm-fieldset__legend">Who gets it</legend>
            <div className="adm-form" style={{ gap: "var(--adm-s3)" }}>
              <SelectInput label="Send to" value={audience} onChange={(e) => setAudience(e.target.value)} options={EMAIL_AUDIENCES} disabled={sending === "real"} />
              {isTest ? (
                <TextInput label="Test address" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
              ) : (
                <>
                  <Checkbox checked={gated} onChange={setGated}>
                    Respect unsubscribes (recommended for marketing)
                  </Checkbox>
                  <Notice tone="warn">This audience is real drivers. Do a dry run to see how many before you send.</Notice>
                </>
              )}
            </div>
          </fieldset>

          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={() => sendCustom(true)} disabled={sending !== null || !canSend}>
              {sending === "dry" ? <><Spinner /> Counting</> : "Dry run"}
            </button>
            <button
              type="button"
              className={`adm-btn ${isTest ? "adm-btn--primary" : "adm-btn--danger"}`}
              onClick={() => (isTest ? sendCustom(false) : setConfirmOpen(true))}
              disabled={sending !== null || !canSend}
            >
              {sending === "real" ? <><Spinner /> Sending</> : isTest ? "Send test" : "Send…"}
            </button>
          </div>

          {error && <SendFailedNotice message={error.message} real={error.real} />}
          {result && <Notice tone={result.startsWith("Dry run") ? "info" : "good"}>{result}</Notice>}
        </div>

        <div style={{ position: "sticky", top: "var(--adm-s4)", minWidth: 0 }}>
          <p className="adm-field__label" style={{ margin: "0 0 var(--adm-s2)" }}>Live preview</p>
          <iframe title="Email preview" srcDoc={preview} sandbox="" className="adm-frame" style={{ height: 620 }} />
        </div>
      </Grid>

      <SendConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => sendCustom(false)}
        onDryRun={() => sendCustom(true)}
        dryRunning={sending === "dry"}
        busy={sending === "real"}
        channel="email"
        what={
          <>
            <strong>{subject}</strong>
            <span className="adm-cell-sub">{title}</span>
          </>
        }
        audience={`${audienceText}${gated ? ", unsubscribes respected" : ", ignoring unsubscribes"}`}
        recipients={dry && dry.sig === sig ? dry.count : null}
        details={!gated ? <Notice tone="bad">Unsubscribes are being ignored. Only do this for a service message, never marketing.</Notice> : undefined}
      />
    </Panel>
  );
}
