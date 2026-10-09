"use client";

import { useState } from "react";
import { Button, Dialog, Segmented, TextArea, TextField } from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg } from "@/components/dashboard/settings/util";
import { MAX_SCREENSHOTS, toUploads, type PickedScreenshot } from "@/components/support/screenshots";
import { ScreenshotPicker } from "./ScreenshotPicker";
import styles from "./feedback.module.css";

type Kind = "problem" | "idea";

// "Tell us something": a private problem report (starts a conversation only this
// driver and the team see) or a public idea (can reach the board).
export function TellUsDialog({
  open,
  onClose,
  onReported,
  onIdea,
}: {
  open: boolean;
  onClose: () => void;
  onReported: (threadKey: string) => void;
  onIdea: () => void;
}) {
  const [kind, setKind] = useState<Kind>("problem");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [shots, setShots] = useState<PickedScreenshot[]>([]);
  const [shotProblem, setShotProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBody("");
    setTitle("");
    setShots([]);
    setShotProblem(null);
    setError(null);
  }
  function close() {
    if (sending) return;
    reset();
    onClose();
  }

  async function send() {
    setError(null);
    if (kind === "problem") {
      if (!body.trim()) return setError("Tell us what happened first.");
    } else if (!title.trim() || !body.trim()) {
      return setError("Give your idea a title and a few words about it.");
    }
    setSending(true);
    try {
      if (kind === "problem") {
        const res = await api.post<{ data: { threadKey: string } }>("/support/report", {
          body: body.trim(),
          screenshots: shots.length ? toUploads(shots) : undefined,
        });
        reset();
        onReported(res.data.threadKey);
      } else {
        await api.post("/feedback/", { title: title.trim(), body: body.trim(), category: "feature_request" });
        reset();
        onIdea();
      }
    } catch (e) {
      setError(errMsg(e, "Couldn't send that. Try again in a moment."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Tell us something"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={sending}>Cancel</Button>
          <Button variant="primary" loading={sending} onClick={() => void send()}>
            {kind === "problem" ? "Send to MileClear" : "Send idea"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Segmented
          ariaLabel="What are you telling us?"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setError(null);
          }}
          options={[
            { value: "problem", label: "Something's not right" },
            { value: "idea", label: "An idea" },
          ]}
        />
        {kind === "problem" ? (
          <p className={styles.muted}>
            This goes privately to the MileClear team, not on the public board. We&apos;ll include your phone&apos;s latest app details and your recent trips so we can help faster, and we&apos;ll reply here and by email.
          </p>
        ) : (
          <p className={styles.muted}>
            Every idea is read. If we pick it up it goes on the board, and we&apos;ll tell you when it&apos;s built. Something not working? Choose &quot;Something&apos;s not right&quot; instead, so it stays private.
          </p>
        )}
        {error && <p className={styles.err} role="alert">{error}</p>}
        {kind === "idea" && (
          <TextField label="Your idea in a few words" value={title} onChange={setTitle} maxLength={120} placeholder="e.g. Show fuel cost per trip" />
        )}
        <TextArea
          label={kind === "problem" ? "What happened?" : "Tell us more"}
          value={body}
          onChange={setBody}
          rows={kind === "problem" ? 6 : 4}
          maxLength={4000}
          disabled={sending}
          hint={kind === "problem" ? "When was it, and what were you doing? For a missing trip, roughly where from and to." : "What would it do, and how would it help you?"}
        />
        {kind === "problem" && (
          <div>
            <span className="mc-field__label">Screenshots (optional, up to {MAX_SCREENSHOTS})</span>
            <ScreenshotPicker shots={shots} onChange={setShots} onProblem={setShotProblem} disabled={sending} />
            {shotProblem && <p className={styles.warn}>{shotProblem}</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
