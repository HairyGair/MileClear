"use client";

// Comms section of the admin area (Sep 2026 redesign).

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { AdminPage } from "@/components/admin";


// ---------------------------------------------------------------------------
// Push Notifications Tab
// ---------------------------------------------------------------------------

type PushAudience = "all" | "premium" | "free" | "inactive" | "specific" | "selected";
type PushHealthBand = "" | "good" | "warning" | "critical" | "unknown";
type PushMode = "" | "work" | "personal" | "both";

function PushTab() {
  const [audience, setAudience] = useState<PushAudience>("all");
  const [userId, setUserId] = useState("");
  const [userIdsRaw, setUserIdsRaw] = useState("");
  const [inactiveDays, setInactiveDays] = useState("14");
  const [buildNumber, setBuildNumber] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [healthBand, setHealthBand] = useState<PushHealthBand>("");
  const [dashboardMode, setDashboardMode] = useState<PushMode>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; totalTargeted: number; dryRun: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Parse the textarea: split on commas/whitespace/newlines, strip empties.
  const userIds = userIdsRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const send = async (dryRun: boolean) => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: typeof result }>("/admin/send-push", {
        audience,
        userId: audience === "specific" ? userId : undefined,
        userIds: audience === "selected" ? userIds : undefined,
        inactiveDays: audience === "inactive" ? parseInt(inactiveDays) || 14 : undefined,
        buildNumber: buildNumber.trim() || undefined,
        appVersion: appVersion.trim() || undefined,
        healthBand: healthBand || undefined,
        dashboardMode: dashboardMode || undefined,
        title,
        body,
        dryRun,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  const audienceLabel = (a: PushAudience) => {
    switch (a) {
      case "all": return "All Users";
      case "premium": return "Pro Only";
      case "free": return "Free Only";
      case "inactive": return "Inactive";
      case "specific": return "Single User";
      case "selected": return "Multi-Select";
    }
  };

  const activeFilterCount = [buildNumber.trim(), appVersion.trim(), healthBand, dashboardMode].filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 600 }}>
      <Card title="Send Push Notification">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Audience */}
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
              Audience
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["all", "premium", "free", "inactive", "specific", "selected"] as const).map((a) => (
                <button
                  key={a}
                  className={`filter-chip ${audience === a ? "filter-chip--active" : ""}`}
                  onClick={() => setAudience(a)}
                >
                  {audienceLabel(a)}
                </button>
              ))}
            </div>
          </div>

          {audience === "specific" && (
            <Input id="push-user-id" label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter user ID..." />
          )}
          {audience === "selected" && (
            <div>
              <label htmlFor="push-user-ids" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                User IDs ({userIds.length} selected)
              </label>
              <textarea
                id="push-user-ids"
                value={userIdsRaw}
                onChange={(e) => setUserIdsRaw(e.target.value)}
                placeholder="Paste user IDs separated by commas, spaces, or newlines..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary, #64748b)", marginTop: 4 }}>
                Tip: open the Users tab in another window, copy IDs from the User Detail page.
              </p>
            </div>
          )}
          {audience === "inactive" && (
            <Input id="push-inactive-days" label="Inactive for (days)" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} type="number" />
          )}

          {/* Optional filters - compose with the audience cut */}
          <div
            style={{
              padding: "0.75rem 0.875rem",
              background: "rgba(15,23,42,0.5)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.625rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Filters
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary, #64748b)" }}>
                {activeFilterCount === 0 ? "none - applies to whole audience" : `${activeFilterCount} active - AND'd with audience`}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem" }}>
              <Input
                id="push-build"
                label="Build number"
                value={buildNumber}
                onChange={(e) => setBuildNumber(e.target.value)}
                placeholder="e.g. 55"
              />
              <Input
                id="push-app-version"
                label="App version"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                placeholder="e.g. 1.1.3"
              />
              <div>
                <label htmlFor="push-health-band" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                  Health band
                </label>
                <select
                  id="push-health-band"
                  value={healthBand}
                  onChange={(e) => setHealthBand(e.target.value as PushHealthBand)}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                    fontSize: "0.9375rem",
                  }}
                >
                  <option value="">Any</option>
                  <option value="good">Good (≥75)</option>
                  <option value="warning">Warning (50-74)</option>
                  <option value="critical">Critical (&lt;50)</option>
                  <option value="unknown">Unknown (no heartbeat)</option>
                </select>
              </div>
              <div>
                <label htmlFor="push-mode" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                  Dashboard mode
                </label>
                <select
                  id="push-mode"
                  value={dashboardMode}
                  onChange={(e) => setDashboardMode(e.target.value as PushMode)}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                    fontSize: "0.9375rem",
                  }}
                >
                  <option value="">Any</option>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          </div>

          <Input id="push-title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title..." />
          <div>
            <label htmlFor="push-body" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>Body</label>
            <textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body..."
              rows={3}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: "0.9375rem",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button variant="secondary" onClick={() => send(true)} disabled={!title || !body || sending}>
              {sending ? "Checking..." : "Preview (Dry Run)"}
            </Button>
            <Button variant="primary" onClick={() => setShowConfirm(true)} disabled={!title || !body || sending}>
              Send
            </Button>
          </div>
        </div>
      </Card>

      {error && <div className="alert alert--error">{error}</div>}

      {result && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9375rem" }}>
            <p>
              <strong>{result.dryRun ? "Dry run" : "Sent"}:</strong>{" "}
              {result.dryRun ? `Would send to ${result.totalTargeted} user${result.totalTargeted !== 1 ? "s" : ""}` : `${result.sent} sent, ${result.failed} failed`}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              Total targeted: {result.totalTargeted}
            </p>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => send(false)}
        title="Send Push Notification"
        message={
          result?.dryRun
            ? `This will send a push to ${result.totalTargeted} user${result.totalTargeted !== 1 ? "s" : ""}. Are you sure?`
            : `Audience: ${audienceLabel(audience)}${activeFilterCount > 0 ? ` + ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""}` : ""}. Tip: run a Dry Run first to see the exact count.`
        }
        confirmLabel="Send Now"
        loading={sending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email Campaigns Tab
// ---------------------------------------------------------------------------

const EMAIL_AUDIENCES = [
  { value: "test", label: "Send a test to one address" },
  { value: "all", label: "All users" },
  { value: "active", label: "Active users (1+ trips)" },
  { value: "inactive", label: "Inactive users (0 trips)" },
  { value: "premium", label: "Premium users" },
  { value: "free", label: "Free users" },
];

function EmailTab() {
  // ── Campaigns ──
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: string; sent: number; errors: number; dryRun: boolean; totalUsers: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; html: string } | null>(null);

  const sendEmail = async (type: string, dryRun: boolean) => {
    setSending(type);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams();
      if (dryRun) params.set("dryRun", "true");
      if (type === "re-engagement" && onlyInactive) params.set("onlyInactive", "true");
      const res = await api.post<{ data: any }>(`/admin/send-${type}?${params}`, {});
      setResult({ type, sent: res.data.sent, errors: res.data.errors, dryRun, totalUsers: res.data.totalUsers });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(null);
      setShowConfirm(null);
    }
  };

  const previewTemplate = async (id: string, title: string) => {
    setPreviewLoading(id);
    setError(null);
    try {
      const res = await api.get<{ data: { html: string } }>(`/admin/email/template-preview?type=${id}`);
      setPreview({ title, html: res.data.html });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPreviewLoading(null);
    }
  };

  const campaigns = [
    { id: "re-engagement", title: "Re-engagement", desc: "Personalised email to bring users back, with their trip stats.", cohort: false },
    { id: "update", title: "Product Update", desc: "Send the latest changelog/update email (reads the 'Latest' release notes).", cohort: false },
    { id: "service-status", title: "Service Status", desc: "Quick 'we're back up' notification to all users.", cohort: false },
    { id: "permission-nudge", title: "Permission nudge (can't-record cohort)", desc: "Email + push to users active in 30d whose latest diagnostic shows background location is OFF - they physically can't auto-record. Dry-run shows the cohort size.", cohort: true },
    { id: "update-nudge", title: "Update nudge (old builds)", desc: "Push to users active in 30d on a build older than the current App Store build, telling them to update for the reliability fixes. Dry-run shows the cohort size.", cohort: true },
  ];

  // ── Custom composer ──
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
  const [composerPreview, setComposerPreview] = useState("");
  const [composerSending, setComposerSending] = useState(false);
  const [composerResult, setComposerResult] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerConfirm, setComposerConfirm] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const composerPayload = useCallback(
    () => ({ subject, eyebrow, title, bodyMarkdown: body, ctaLabel, ctaUrl, preheader, includeGreeting, includeSignoff }),
    [subject, eyebrow, title, body, ctaLabel, ctaUrl, preheader, includeGreeting, includeSignoff]
  );

  // Live, debounced preview as the form is typed.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await api.post<{ data: { html: string } }>("/admin/email/preview-custom", composerPayload());
        setComposerPreview(res.data.html);
      } catch {
        /* preview errors are non-fatal */
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [composerPayload]);

  const sendCustom = async (dryRun: boolean) => {
    setComposerSending(true);
    setComposerError(null);
    setComposerResult(null);
    try {
      const res = await api.post<{ data: any }>("/admin/email/send-custom", {
        ...composerPayload(),
        audience,
        testEmail,
        gated,
        dryRun,
      });
      const d = res.data;
      setComposerResult(
        d.test
          ? dryRun
            ? `Dry run OK - would send a test to ${testEmail}`
            : `Test sent to ${testEmail}`
          : dryRun
            ? `Dry run: would send to ${d.sent} of ${d.totalUsers} users`
            : `Sent to ${d.sent} users, ${d.errors} errors`
      );
    } catch (err: any) {
      setComposerError(err.message);
    } finally {
      setComposerSending(false);
      setComposerConfirm(false);
    }
  };

  const canSend = subject.trim() && title.trim() && body.trim() && (audience !== "test" || testEmail.trim());
  const isTest = audience === "test";

  const labelStyle = { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {error && <div className="alert alert--error">{error}</div>}

      {result && (
        <Card>
          <p style={{ fontSize: "0.9375rem" }}>
            <strong>{result.dryRun ? "Dry run" : "Sent"} ({result.type}):</strong>{" "}
            {result.dryRun ? `Would send to ${result.sent} of ${result.totalUsers} users` : `${result.sent} sent, ${result.errors} errors`}
          </p>
        </Card>
      )}

      <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", margin: "0.25rem 0 -0.25rem" }}>
        Ready-made campaigns
      </h3>

      {campaigns.map((c) => (
        <Card key={c.id} title={c.title}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>{c.desc}</p>
          {c.id === "re-engagement" && (
            <label style={{ ...labelStyle, marginBottom: "1rem" }}>
              <input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} />
              Only users with 0 trips
            </label>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {!c.cohort && (
              <Button variant="ghost" size="sm" onClick={() => previewTemplate(c.id, c.title)} disabled={previewLoading === c.id}>
                {previewLoading === c.id ? "..." : "Preview"}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => sendEmail(c.id, true)} disabled={sending === c.id}>
              {sending === c.id ? "..." : "Dry Run"}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowConfirm(c.id)} disabled={sending === c.id}>
              Send
            </Button>
          </div>
        </Card>
      ))}

      <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", margin: "1rem 0 -0.25rem" }}>
        Compose a custom email
      </h3>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1.5rem", alignItems: "start" }} className="email-composer-grid">
          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Input label="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What lands in their inbox" />
            <Input label="Eyebrow (small pill above the title)" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="e.g. PRODUCT UPDATE" />
            <Input label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The big bold title" />
            <div className="form-group">
              <label className="form-label">Body</label>
              <textarea
                className="form-input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                placeholder={"Write your message here.\n\nBlank line = new paragraph.\n- start a line with a dash for bullets\n> a line starting with > is an amber callout\n**bold** and [links](https://mileclear.com) work too."}
                style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Formatting: blank line = paragraph · <code>- </code> = bullet · <code>&gt; </code> = callout · <code>**bold**</code> · <code>[label](url)</code>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Input label="Button label (optional)" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Open MileClear" />
              <Input label="Button link (optional)" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://mileclear.com/..." />
            </div>
            <Input label="Preview text (optional inbox preview line)" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Defaults to the headline" />

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.25rem" }}>
              <label style={labelStyle}>
                <input type="checkbox" checked={includeGreeting} onChange={(e) => setIncludeGreeting(e.target.checked)} />
                Include &quot;Hi {"{name}"},&quot;
              </label>
              <label style={labelStyle}>
                <input type="checkbox" checked={includeSignoff} onChange={(e) => setIncludeSignoff(e.target.checked)} />
                Include &quot;Cheers, Gair&quot;
              </label>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

            <Select label="Send to" value={audience} onChange={(e) => setAudience(e.target.value)} options={EMAIL_AUDIENCES} />
            {isTest ? (
              <Input label="Test address" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
            ) : (
              <label style={{ ...labelStyle, marginTop: "-0.25rem" }}>
                <input type="checkbox" checked={gated} onChange={(e) => setGated(e.target.checked)} />
                Respect unsubscribes (recommended for marketing)
              </label>
            )}

            {composerError && <div className="alert alert--error">{composerError}</div>}
            {composerResult && (
              <div style={{ fontSize: "0.875rem", color: "var(--emerald-400, #34d399)", fontWeight: 600 }}>{composerResult}</div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
              <Button variant="secondary" size="sm" onClick={() => sendCustom(true)} disabled={composerSending || !canSend}>
                {composerSending ? "..." : "Dry Run"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => (isTest ? sendCustom(false) : setComposerConfirm(true))}
                disabled={composerSending || !canSend}
              >
                {composerSending ? "Sending..." : isTest ? "Send Test" : "Send"}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ position: "sticky", top: "1rem" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem", fontWeight: 600 }}>Live preview</p>
            <iframe
              title="Email preview"
              srcDoc={composerPreview}
              sandbox=""
              style={{ width: "100%", height: 620, border: "1px solid var(--border)", borderRadius: 12, background: "#030712" }}
            />
          </div>
        </div>
      </Card>

      {/* Campaign preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Preview - ${preview.title}` : ""} large>
        <iframe
          title="Campaign preview"
          srcDoc={preview?.html ?? ""}
          sandbox=""
          style={{ width: "100%", height: 640, border: "none", borderRadius: 8, background: "#030712" }}
        />
      </Modal>

      <ConfirmModal
        open={!!showConfirm}
        onClose={() => setShowConfirm(null)}
        onConfirm={() => showConfirm && sendEmail(showConfirm, false)}
        title="Send Email Campaign"
        message="This will send emails to users. Brevo's free tier has a 300/day limit. Are you sure?"
        confirmLabel="Send Now"
        loading={!!sending}
      />

      <ConfirmModal
        open={composerConfirm}
        onClose={() => setComposerConfirm(false)}
        onConfirm={() => sendCustom(false)}
        title="Send custom email"
        message={`This will send your email to "${EMAIL_AUDIENCES.find((a) => a.value === audience)?.label}". Brevo's free tier has a 300/day limit. Run a dry run first if you're unsure. Continue?`}
        confirmLabel="Send Now"
        loading={composerSending}
      />
    </div>
  );
}


function Comms() {
  return (
    <>
      <PushTab />
      <EmailTab />
    </>
  );
}

export default function AdminCommsPage() {
  return (
    <AdminPage title="Comms" intro="Push notifications and email campaigns.">
      <Comms />
    </AdminPage>
  );
}
