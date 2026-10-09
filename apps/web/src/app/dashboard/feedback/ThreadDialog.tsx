"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupportThreadDetail } from "@mileclear/shared";
import { Button, Dialog, Skeleton, TextArea } from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg } from "@/components/dashboard/settings/util";
import { AuthImageRow } from "@/components/support/AuthImage";
import { toUploads, type PickedScreenshot } from "@/components/support/screenshots";
import { ScreenshotPicker } from "./ScreenshotPicker";
import { shortDate } from "./shortDate";
import styles from "./feedback.module.css";

// One private conversation with the MileClear team, with a reply box.
export function ThreadDialog({ threadKey, onClose }: { threadKey: string | null; onClose: () => void }) {
  const [thread, setThread] = useState<SupportThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [shots, setShots] = useState<PickedScreenshot[]>([]);
  const [shotProblem, setShotProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: SupportThreadDetail }>(`/support/threads/${encodeURIComponent(key)}`);
      setThread(res.data);
    } catch (e) {
      setError(errMsg(e, "Couldn't load this conversation."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setThread(null);
    setReply("");
    setShots([]);
    setShotProblem(null);
    if (threadKey) void load(threadKey);
  }, [threadKey, load]);

  async function send() {
    if (!threadKey || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/support/threads/${encodeURIComponent(threadKey)}/reply`, {
        body: reply.trim(),
        screenshots: shots.length ? toUploads(shots) : undefined,
      });
      setReply("");
      setShots([]);
      setShotProblem(null);
      await load(threadKey);
    } catch (e) {
      setError(errMsg(e, "Couldn't send your reply. Try again in a moment."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={!!threadKey}
      title={thread?.subject || "Your message"}
      size="lg"
      onClose={() => !sending && onClose()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Close</Button>
          <Button variant="primary" loading={sending} disabled={!reply.trim()} onClick={() => void send()}>
            Send reply
          </Button>
        </>
      }
    >
      {error && <p className={styles.err} role="alert">{error}</p>}
      {loading && !thread ? (
        <Skeleton variant="card" count={2} />
      ) : thread ? (
        <>
          <div className={styles.convo}>
            {thread.messages.map((m) => (
              <div key={m.id} className={`${styles.msg} ${m.direction === "in" ? styles.msgMine : ""}`}>
                <div className={styles.msgHead}>
                  <strong>{m.direction === "in" ? "You" : m.fromName || "MileClear"}</strong>
                  <span>{shortDate(m.at)}</span>
                </div>
                <p className={styles.msgBody}>{m.body}</p>
                <AuthImageRow paths={m.attachments.map((a) => `/support/attachments/${encodeURIComponent(a.id)}`)} />
              </div>
            ))}
            {thread.messages.every((m) => m.direction === "in") && (
              <p className={styles.muted}>Thanks, we&apos;ve got it. We&apos;ll reply here and by email.</p>
            )}
          </div>
          <div className={styles.form}>
            <TextArea label="Reply" value={reply} onChange={setReply} rows={3} maxLength={4000} disabled={sending} hint="Add anything else, or answer our question." />
            <ScreenshotPicker shots={shots} onChange={setShots} onProblem={setShotProblem} disabled={sending} />
            {shotProblem && <p className={styles.warn}>{shotProblem}</p>}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
