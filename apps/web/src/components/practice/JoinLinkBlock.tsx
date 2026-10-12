"use client";

import { useEffect, useState } from "react";
import { Button, ConfirmDialog, useToast } from "../dashboard/kit";
import { authedObjectUrl, downloadAuthed, errorText, papi } from "../../lib/practice";
import { usePractice } from "./PracticeShell";

/** The QR for the join link, drawn from the server's SVG (one source for both downloads). */
export function JoinQr({ size = "md", version }: { size?: "md" | "sm"; version: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    authedObjectUrl("/practice/join-qr?format=svg")
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setSrc(u);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [version]);
  return <div className={`pc-qr${size === "sm" ? " pc-qr--sm" : ""}`}>{src && <img src={src} alt="QR code for your join link" />}</div>;
}

/** Join link, copy, QR, downloads and (owner only) reset. */
export function JoinLinkBlock({ compact = false }: { compact?: boolean }) {
  const { me, reload } = usePractice();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const url = me.practice.joinUrl;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show("Couldn't copy. Select the link and copy it.", "error");
    }
  }

  async function download(format: "png" | "svg") {
    try {
      await downloadAuthed(`/practice/join-qr?format=${format}`, {}, `mileclear-join.${format}`);
    } catch (e) {
      toast.show(errorText(e, "Couldn't download. Try again."), "error");
    }
  }

  return (
    <div className="mc-stack mc-stack--tight">
      <div className="pc-linkrow">
        <input className="mc-input" readOnly value={url} aria-label="Your join link" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" icon="copy-outline" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <span className="mc-sr-only" aria-live="polite">
          {copied ? "Link copied" : ""}
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <JoinQr size={compact ? "sm" : "md"} version={me.practice.joinCode} />
        <div className="mc-stack mc-stack--tight">
          {!compact && (
            <p className="pc-muted" style={{ fontSize: 14, maxWidth: 420 }}>
              Put this in your client letter or email signature. Drivers who open it can share with you from the app. You'll be asked to accept each one.
            </p>
          )}
          <div style={{ display: "flex", gap: 16 }}>
            <button type="button" className="mc-textlink" onClick={() => void download("png")}>
              Download PNG
            </button>
            <button type="button" className="mc-textlink" onClick={() => void download("svg")}>
              Download SVG
            </button>
          </div>
          {!compact && me.member.role === "owner" && (
            <div>
              <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
                Reset link
              </Button>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Reset your join link?"
        body="The old link and QR code stop working straight away."
        confirmLabel="Reset link"
        destructive
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await papi.post("/practice/join-link/reset");
            toast.show("Join link reset");
            reload();
          } catch (e) {
            toast.show(errorText(e), "error");
          }
        }}
      />
    </div>
  );
}
