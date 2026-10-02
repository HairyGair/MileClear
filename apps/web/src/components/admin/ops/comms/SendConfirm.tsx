"use client";

// The "this goes to real people" moment for the Comms page: a red-edged
// confirm dialog that leads with the recipient count, plus the notices shown
// while a send is running and when one fails.

import type { ReactNode } from "react";
import { Dialog, Notice, Spinner, formatNumber } from "@/components/admin/ui";

interface SendConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** "push notification" or "email". */
  channel: string;
  /** What is being sent, e.g. "Product update email". */
  what: ReactNode;
  /** Who it goes to, in words: "All users + 2 filters". */
  audience: ReactNode;
  /** From the latest dry run with these exact settings; null when there has
   *  not been one (the count is then unknown). */
  recipients: number | null;
  /** Extra lines under the count (opted out, subject line...). */
  details?: ReactNode;
  /** Runs a dry run from inside the dialog so the count can be filled in. */
  onDryRun?: () => void;
  dryRunning?: boolean;
  busy?: boolean;
}

export function SendConfirmDialog({ open, onClose, onConfirm, channel, what, audience, recipients, details, onDryRun, dryRunning, busy }: SendConfirmDialogProps) {
  const known = recipients !== null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      danger
      title={`Send this ${channel} to real people?`}
      footer={
        <>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {onDryRun && (
            <button type="button" className="adm-btn" onClick={onDryRun} disabled={busy || dryRunning}>
              {dryRunning ? <><Spinner /> Counting</> : known ? "Count again (dry run)" : "Count recipients (dry run)"}
            </button>
          )}
          <button type="button" className="adm-btn adm-btn--danger" onClick={onConfirm} disabled={busy || dryRunning}>
            {known ? `Send to ${formatNumber(recipients)} ${recipients === 1 ? "person" : "people"}` : "Send without a count"}
          </button>
        </>
      }
    >
      <div className="adm-recipients">
        {known ? (
          <>
            <span className="adm-recipients__count">{formatNumber(recipients)}</span>
            <span className="adm-recipients__label">{recipients === 1 ? "person" : "people"} will get this {channel}</span>
          </>
        ) : (
          <Notice tone="warn" title="Recipient count not checked">
            No dry run has been done with these exact settings, so we don&apos;t know how many people this reaches. Count first unless you are sure.
          </Notice>
        )}
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--adm-s1) var(--adm-s3)", fontSize: "0.85rem" }}>
        <dt style={{ color: "var(--adm-text-3)" }}>Sending</dt>
        <dd style={{ margin: 0, color: "var(--adm-text-strong)" }}>{what}</dd>
        <dt style={{ color: "var(--adm-text-3)" }}>To</dt>
        <dd style={{ margin: 0, color: "var(--adm-text-strong)" }}>{audience}</dd>
      </dl>
      {details}
      <p className="adm-note">This cannot be undone. Once sent, it is in people&apos;s inboxes or on their lock screens.</p>
    </Dialog>
  );
}

/** Shown for the whole time a real send is in flight. */
export function SendingNotice({ what, slow }: { what: ReactNode; slow?: boolean }) {
  return (
    <Notice tone="accent" icon={<Spinner />} title={<>Sending {what}…</>}>
      {slow
        ? "This can take a few minutes (the update email takes about 4). The server sends one at a time and answers when the last one has gone. Do not retry and do not close this tab."
        : "This can take a few minutes. Do not retry and do not close this tab."}
    </Notice>
  );
}

/** A real send that came back with an error may still have gone out, or may
 *  still be going: the request can time out while the server keeps sending. */
export function SendFailedNotice({ message, real }: { message: string; real: boolean }) {
  return (
    <Notice tone="bad" title={real ? "The send reported an error" : "The dry run failed"}>
      {message}
      {real && (
        <>
          {" "}
          Some or all of it may already have gone out, and the server may still be sending. Do not send again until you have checked the API log for this
          send.
        </>
      )}
    </Notice>
  );
}
