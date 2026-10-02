"use client";

// Comms: ready-made email campaigns. Same calls as before the rebuild:
// POST /admin/send-{type}?dryRun=true[&onlyInactive=true] for a count,
// the same without dryRun to send, and GET /admin/email/template-preview to
// look at a template.
//
// /admin/send-update is synchronous: it sends one email at a time and only
// answers when the last has gone (about 4 minutes). The page keeps a
// "sending" notice up for the whole time and every send button stays
// disabled, so it cannot be fired twice.

import { useState } from "react";
import { api } from "@/lib/api";
import { Badge, Checkbox, Dialog, Grid, Notice, Panel, Spinner, formatNumber } from "@/components/admin/ui";
import { SendConfirmDialog, SendFailedNotice, SendingNotice } from "./SendConfirm";

interface CampaignResult {
  sent: number;
  errors: number;
  dryRun: boolean;
  totalUsers: number;
  // Only some campaigns return these (send-update does).
  willReceive?: number;
  optedOut?: number;
  pushSent?: number;
  preview?: { subject?: string };
}

interface Campaign {
  id: string;
  title: string;
  desc: string;
  /** Cohort campaigns pick their own audience and have no template preview. */
  cohort: boolean;
  channel: string;
  audience: string;
}

const CAMPAIGNS: Campaign[] = [
  {
    id: "re-engagement",
    title: "Re-engagement",
    desc: "A personal email to bring drivers back, with their own trip numbers.",
    cohort: false,
    channel: "email",
    audience: "All users",
  },
  {
    id: "update",
    title: "Product update",
    desc: "The latest changelog email (reads the release marked 'Latest' in the release notes).",
    cohort: false,
    channel: "email",
    audience: "Every user who has not opted out of marketing email",
  },
  { id: "service-status", title: "Service status", desc: "A short 'we're back up' note to all users.", cohort: false, channel: "email", audience: "All users" },
  {
    id: "permission-nudge",
    title: "Permission nudge (can't-record group)",
    desc: "Email and push to drivers active in the last 30 days whose latest diagnostics show background location is off, so they cannot auto-record. A dry run shows how many.",
    cohort: true,
    channel: "email and push",
    audience: "Active in 30 days with background location off",
  },
  {
    id: "update-nudge",
    title: "Update nudge (old builds)",
    desc: "Push to drivers active in the last 30 days on a build older than the current App Store build, asking them to update for the reliability fixes. A dry run shows how many.",
    cohort: true,
    channel: "push notification",
    audience: "Active in 30 days on an old build",
  },
];

export function EmailCampaigns({ onLiveChange }: { onLiveChange: (live: boolean) => void }) {
  const [sending, setSending] = useState<{ id: string; dryRun: boolean } | null>(null);
  const [results, setResults] = useState<Record<string, CampaignResult & { sig: string }>>({});
  const [errors, setErrors] = useState<Record<string, { message: string; real: boolean }>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const sigFor = (id: string) => (id === "re-engagement" ? `${id}:${onlyInactive}` : id);
  const liveSend = sending !== null && !sending.dryRun;

  const sendEmail = async (type: string, dryRun: boolean) => {
    if (sending) return;
    setSending({ id: type, dryRun });
    if (!dryRun) {
      setConfirmId(null);
      onLiveChange(true);
    }
    setErrors((e) => {
      const n = { ...e };
      delete n[type];
      return n;
    });
    const sig = sigFor(type);
    try {
      const params = new URLSearchParams();
      if (dryRun) params.set("dryRun", "true");
      if (type === "re-engagement" && onlyInactive) params.set("onlyInactive", "true");
      const res = await api.post<{ data: CampaignResult }>(`/admin/send-${type}?${params}`, {});
      setResults((r) => ({ ...r, [type]: { ...res.data, dryRun, sig } }));
    } catch (err) {
      setErrors((e) => ({ ...e, [type]: { message: err instanceof Error ? err.message : "Send failed", real: !dryRun } }));
    } finally {
      setSending(null);
      if (!dryRun) onLiveChange(false);
    }
  };

  const previewTemplate = async (id: string, title: string) => {
    setPreviewLoading(id);
    setPreviewError(null);
    try {
      const res = await api.get<{ data: { html: string } }>(`/admin/email/template-preview?type=${id}`);
      setPreview({ title, html: res.data.html });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(null);
    }
  };

  const confirm = CAMPAIGNS.find((c) => c.id === confirmId) ?? null;
  const confirmDry = confirm ? results[confirm.id] : undefined;
  const confirmCount = confirm && confirmDry && confirmDry.dryRun && confirmDry.sig === sigFor(confirm.id) ? confirmDry.sent : null;

  return (
    <>
      {liveSend && sending && (
        <SendingNotice what={`the ${CAMPAIGNS.find((c) => c.id === sending.id)?.title.toLowerCase() ?? sending.id} campaign`} slow={sending.id === "update"} />
      )}
      {previewError && <Notice tone="bad" title="Couldn't load the template preview">{previewError}</Notice>}

      <Grid min={300}>
        {CAMPAIGNS.map((c) => {
          const r = results[c.id];
          const e = errors[c.id];
          const busyHere = sending?.id === c.id;
          return (
            <Panel
              key={c.id}
              title={c.title}
              actions={<Badge tone={c.cohort ? "info" : "neutral"}>{c.channel}</Badge>}
              footer={<>Goes to: {c.audience}{c.id === "re-engagement" && onlyInactive ? " with 0 trips" : ""}</>}
            >
              <div className="adm-form" style={{ gap: "var(--adm-s3)" }}>
                <p className="adm-text">{c.desc}</p>
                {c.id === "re-engagement" && (
                  <Checkbox checked={onlyInactive} onChange={setOnlyInactive} disabled={sending !== null}>
                    Only users with 0 trips
                  </Checkbox>
                )}
                <div className="adm-actions">
                  {!c.cohort && (
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => previewTemplate(c.id, c.title)} disabled={previewLoading === c.id}>
                      {previewLoading === c.id ? <><Spinner /> Loading</> : "Preview"}
                    </button>
                  )}
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => sendEmail(c.id, true)} disabled={sending !== null}>
                    {busyHere && sending?.dryRun ? <><Spinner /> Counting</> : "Dry run"}
                  </button>
                  <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setConfirmId(c.id)} disabled={sending !== null}>
                    {busyHere && !sending?.dryRun ? <><Spinner /> Sending</> : "Send…"}
                  </button>
                </div>
                {e && <SendFailedNotice message={e.message} real={e.real} />}
                {r && (
                  <Notice tone={r.dryRun ? "info" : r.errors > 0 ? "warn" : "good"} title={r.dryRun ? "Dry run: nothing was sent" : "Sent"}>
                    {r.dryRun
                      ? `Would send to ${formatNumber(r.sent)} of ${formatNumber(r.totalUsers)} users.`
                      : `${formatNumber(r.sent)} sent, ${formatNumber(r.errors)} errors.`}
                    {r.optedOut !== undefined && ` ${formatNumber(r.optedOut)} opted out of marketing email.`}
                    {r.pushSent !== undefined && !r.dryRun && ` ${formatNumber(r.pushSent)} pushes sent.`}
                    {r.preview?.subject && (
                      <span className="adm-cell-sub">Subject: {r.preview.subject}</span>
                    )}
                  </Notice>
                )}
              </div>
            </Panel>
          );
        })}
      </Grid>

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview ? `Preview: ${preview.title}` : ""} wide>
        <iframe title="Campaign preview" srcDoc={preview?.html ?? ""} sandbox="" className="adm-frame" style={{ height: 640 }} />
      </Dialog>

      {confirm && (
        <SendConfirmDialog
          open
          onClose={() => setConfirmId(null)}
          onConfirm={() => sendEmail(confirm.id, false)}
          onDryRun={() => sendEmail(confirm.id, true)}
          dryRunning={sending?.id === confirm.id && sending.dryRun}
          busy={liveSend}
          channel={confirm.channel}
          what={`${confirm.title} campaign`}
          audience={`${confirm.audience}${confirm.id === "re-engagement" && onlyInactive ? " with 0 trips" : ""}`}
          recipients={confirmCount}
          details={
            <>
              {confirmDry?.dryRun && confirmDry.optedOut !== undefined && (
                <p className="adm-note">{formatNumber(confirmDry.optedOut)} opted out of marketing email and are left out.</p>
              )}
              {confirmDry?.dryRun && confirmDry.preview?.subject && <p className="adm-note">Subject: {confirmDry.preview.subject}</p>}
              {confirm.id === "update" && (
                <Notice tone="warn" title="This one takes about 4 minutes">
                  Leave the page open after you press Send. Do not press it again, even if it looks stuck.
                </Notice>
              )}
            </>
          }
        />
      )}
    </>
  );
}
