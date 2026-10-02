"use client";

// Comms: send a push notification. POST /admin/send-push with the same
// payload as before the rebuild; dryRun: true only counts the audience.

import { useState } from "react";
import { api } from "@/lib/api";
import { ChoiceChips, Grid, Notice, Panel, SelectInput, Spinner, TextArea, TextInput, formatNumber } from "@/components/admin/ui";
import { SendConfirmDialog, SendFailedNotice, SendingNotice } from "./SendConfirm";

type PushAudience = "all" | "premium" | "free" | "inactive" | "specific" | "selected";
type PushHealthBand = "" | "good" | "warning" | "critical" | "unknown";
type PushMode = "" | "work" | "personal" | "both";

interface PushResult {
  sent: number;
  failed: number;
  totalTargeted: number;
  dryRun: boolean;
}

const AUDIENCES: ReadonlyArray<{ value: PushAudience; label: string }> = [
  { value: "all", label: "All users" },
  { value: "premium", label: "Pro only" },
  { value: "free", label: "Free only" },
  { value: "inactive", label: "Inactive" },
  { value: "specific", label: "One user" },
  { value: "selected", label: "Several users" },
];

const audienceLabel = (a: PushAudience) => AUDIENCES.find((x) => x.value === a)?.label ?? a;

export function PushComposer({ onLiveChange }: { onLiveChange: (live: boolean) => void }) {
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

  const [sending, setSending] = useState<"dry" | "real" | null>(null);
  const [result, setResult] = useState<PushResult | null>(null);
  const [error, setError] = useState<{ message: string; real: boolean } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // The audience a dry-run count belongs to, so a stale count is never shown
  // after the audience or filters change.
  const [dry, setDry] = useState<{ sig: string; count: number } | null>(null);

  // Split on commas, whitespace or newlines; drop empties.
  const userIds = userIdsRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const payloadAudience = {
    audience,
    userId: audience === "specific" ? userId : undefined,
    userIds: audience === "selected" ? userIds : undefined,
    inactiveDays: audience === "inactive" ? parseInt(inactiveDays) || 14 : undefined,
    buildNumber: buildNumber.trim() || undefined,
    appVersion: appVersion.trim() || undefined,
    healthBand: healthBand || undefined,
    dashboardMode: dashboardMode || undefined,
  };
  const sig = JSON.stringify(payloadAudience);

  const send = async (dryRun: boolean) => {
    if (sending) return;
    setSending(dryRun ? "dry" : "real");
    if (!dryRun) {
      setShowConfirm(false);
      onLiveChange(true);
    }
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: PushResult }>("/admin/send-push", { ...payloadAudience, title, body, dryRun });
      setResult(res.data);
      if (dryRun) setDry({ sig, count: res.data.totalTargeted });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Send failed", real: !dryRun });
    } finally {
      setSending(null);
      if (!dryRun) onLiveChange(false);
    }
  };

  const activeFilterCount = [buildNumber.trim(), appVersion.trim(), healthBand, dashboardMode].filter(Boolean).length;
  const canSend = !!title && !!body && sending === null;
  const audienceText = `${audienceLabel(audience)}${activeFilterCount > 0 ? ` + ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""}` : ""}`;

  return (
    <Panel
      title="Push notification"
      subtitle="Lands on the lock screen of every phone in the audience that has notifications on. Count with a dry run before sending."
    >
      <div className="adm-form">
        {sending === "real" && <SendingNotice what="the push notification" />}

        <ChoiceChips label="Audience" value={audience} onChange={setAudience} options={AUDIENCES} disabled={sending === "real"} />

        {audience === "specific" && <TextInput label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter user ID" mono />}
        {audience === "selected" && (
          <TextArea
            label={`User IDs (${userIds.length} selected)`}
            value={userIdsRaw}
            onChange={(e) => setUserIdsRaw(e.target.value)}
            placeholder="Paste user IDs separated by commas, spaces or new lines"
            rows={4}
            mono
            hint="Tip: open Users in another window and copy IDs from each user's detail page."
          />
        )}
        {audience === "inactive" && (
          <div style={{ maxWidth: 220 }}>
            <TextInput label="Inactive for (days)" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} type="number" />
          </div>
        )}

        <fieldset className="adm-fieldset">
          <legend className="adm-fieldset__legend">
            Filters{" "}
            <span className="adm-note" style={{ fontWeight: 400 }}>
              {activeFilterCount === 0 ? "(none: the whole audience)" : `(${activeFilterCount} on, combined with the audience)`}
            </span>
          </legend>
          <Grid min={160} gap="sm">
            <TextInput label="Build number" value={buildNumber} onChange={(e) => setBuildNumber(e.target.value)} placeholder="e.g. 55" />
            <TextInput label="App version" value={appVersion} onChange={(e) => setAppVersion(e.target.value)} placeholder="e.g. 1.1.3" />
            <SelectInput
              label="Health band"
              value={healthBand}
              onChange={(e) => setHealthBand(e.target.value as PushHealthBand)}
              options={[
                { value: "", label: "Any" },
                { value: "good", label: "Good (75 or more)" },
                { value: "warning", label: "Warning (50 to 74)" },
                { value: "critical", label: "Critical (under 50)" },
                { value: "unknown", label: "Unknown (no heartbeat)" },
              ]}
            />
            <SelectInput
              label="Dashboard mode"
              value={dashboardMode}
              onChange={(e) => setDashboardMode(e.target.value as PushMode)}
              options={[
                { value: "", label: "Any" },
                { value: "work", label: "Work" },
                { value: "personal", label: "Personal" },
                { value: "both", label: "Both" },
              ]}
            />
          </Grid>
        </fieldset>

        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title" />
        <TextArea label="Body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notification body" rows={3} />

        <div className="adm-actions">
          <button type="button" className="adm-btn" onClick={() => send(true)} disabled={!canSend}>
            {sending === "dry" ? <><Spinner /> Counting</> : "Dry run (count only)"}
          </button>
          <button type="button" className="adm-btn adm-btn--danger" onClick={() => setShowConfirm(true)} disabled={!canSend}>
            Send…
          </button>
        </div>

        {error && <SendFailedNotice message={error.message} real={error.real} />}
        {result && (
          <Notice tone={result.dryRun ? "info" : result.failed > 0 ? "warn" : "good"} title={result.dryRun ? "Dry run: nothing was sent" : "Sent"}>
            {result.dryRun
              ? `Would send to ${formatNumber(result.totalTargeted)} user${result.totalTargeted !== 1 ? "s" : ""}.`
              : `${formatNumber(result.sent)} sent, ${formatNumber(result.failed)} failed.`}{" "}
            Total targeted: {formatNumber(result.totalTargeted)}.
          </Notice>
        )}
      </div>

      <SendConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => send(false)}
        onDryRun={() => send(true)}
        dryRunning={sending === "dry"}
        busy={sending === "real"}
        channel="push notification"
        what={
          <>
            <strong>{title}</strong>
            <span className="adm-cell-sub">{body}</span>
          </>
        }
        audience={audienceText}
        recipients={dry && dry.sig === sig ? dry.count : null}
      />
    </Panel>
  );
}
