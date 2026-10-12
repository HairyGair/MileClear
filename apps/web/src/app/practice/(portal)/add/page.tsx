"use client";

import { useEffect, useRef, useState } from "react";
import { PRACTICE_BULK_INVITE_MAX } from "@mileclear/shared";
import { Button, Card, StatusChip, TextField, UnderlineTabs, useToast } from "../../../../components/dashboard/kit";
import { PracticeHead, usePractice } from "../../../../components/practice/PracticeShell";
import { JoinLinkBlock, JoinQr } from "../../../../components/practice/JoinLinkBlock";
import { errorText, papi } from "../../../../lib/practice";

type Tab = "email" | "paste" | "link";
type Outcome =
  | "invited"
  | "already_client"
  | "already_invited"
  | "wants_to_join"
  | "said_no_recently"
  | "not_an_email"
  | "is_staff"
  | "duplicate";

interface CheckRow {
  line: number;
  email: string;
  name: string | null;
  outcome: Outcome;
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  invited: "Will be invited",
  already_client: "Already your client",
  already_invited: "Already invited",
  wants_to_join: "Already asked to join you",
  said_no_recently: "Said no in the last 30 days",
  not_an_email: "Not an email",
  is_staff: "In your practice",
  duplicate: "Listed twice",
};

const SINGLE_TEXT: Record<Outcome, string> = {
  invited: "Invite sent. You'll see them in your list when they say yes.",
  already_client: "They're already your client.",
  already_invited: "They've already been invited. You can resend from the waiting list after 3 days.",
  wants_to_join: "They've already asked to share with you. Accept them from your client list.",
  said_no_recently: "They said no in the last 30 days, so we can't ask again yet.",
  not_an_email: "That email doesn't look right.",
  is_staff: "That's someone in your practice.",
  duplicate: "Already listed.",
};

function chip(o: Outcome) {
  if (o === "invited") return <StatusChip tone="green" icon="checkmark" label={OUTCOME_TEXT[o]} />;
  if (o === "not_an_email") return <StatusChip tone="red" icon="alert-circle-outline" label={OUTCOME_TEXT[o]} />;
  if (o === "already_invited") return <StatusChip tone="neutral" icon="time-outline" label={OUTCOME_TEXT[o]} />;
  return <StatusChip tone="neutral" label={OUTCOME_TEXT[o]} />;
}

function EmailPreview() {
  const { me } = usePractice();
  return (
    <Card title="What each driver gets">
      <div className="pc-email-preview">
        <strong>{me.practice.name} would like to see your mileage records</strong>
        {me.member.name} at {me.practice.name} has asked to see your MileClear records, to help with your tax. If you say yes, they can see your business trips, earnings and expenses. They can't see your personal trips or change anything. You can stop sharing at any time.
        <br />
        <span className="pc-email-preview__btn">Open in MileClear</span>
        <small>Not expecting this? Ignore it. Nothing is shared unless you say yes.</small>
      </div>
    </Card>
  );
}

export default function AddClientsPage() {
  const toast = useToast();
  const { me, reload } = usePractice();
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [singleMsg, setSingleMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<CheckRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t === "paste" || t === "link") setTab(t);
  }, []);

  async function sendOne(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setSingleMsg(null);
    try {
      const r = await papi.post<{ outcome: Outcome }>("/practice/invites", { email: email.trim(), name: name.trim() || null });
      setSingleMsg({ text: SINGLE_TEXT[r.outcome], ok: r.outcome === "invited" });
      if (r.outcome === "invited") {
        setEmail("");
        setName("");
        toast.show("Invite sent");
        reload();
      }
    } catch (err) {
      setSingleMsg({ text: errorText(err, "Couldn't send. Try again."), ok: false });
    } finally {
      setSending(false);
    }
  }

  async function check() {
    setChecking(true);
    setPasteMsg(null);
    try {
      const r = await papi.post<{ rows: CheckRow[] }>("/practice/invites/check", { text });
      setChecked(r.rows);
    } catch (err) {
      setPasteMsg(errorText(err, "Couldn't check the list. Try again."));
    } finally {
      setChecking(false);
    }
  }

  async function sendAll() {
    setChecking(true);
    setPasteMsg(null);
    try {
      const r = await papi.post<{ sent: number; rows: CheckRow[] }>("/practice/invites/bulk", { text });
      setPasteMsg(`${r.sent} invite${r.sent === 1 ? "" : "s"} sent. You'll see each client in your list when they say yes.`);
      setChecked(null);
      setText("");
      reload();
    } catch (err) {
      setPasteMsg(errorText(err, "Couldn't send. Try again."));
    } finally {
      setChecking(false);
    }
  }

  function fixLine(line: number) {
    const el = areaRef.current;
    if (!el) return;
    setChecked(null);
    const lines = el.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    el.focus();
    el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  }

  const lineCount = text.split("\n").filter((l) => l.trim()).length;
  const willInvite = checked?.filter((r) => r.outcome === "invited").length ?? 0;
  const sorted = checked ? [...checked].sort((a, b) => Number(a.outcome === "invited") - Number(b.outcome === "invited") || a.line - b.line) : [];
  const summary = checked
    ? (Object.keys(OUTCOME_TEXT) as Outcome[])
        .map((o) => ({ o, n: checked.filter((r) => r.outcome === o).length }))
        .filter((x) => x.n > 0)
    : [];

  return (
    <>
      <PracticeHead title="Add clients" line="Nothing is shared until each driver says yes in the app." />
      <div style={{ marginBottom: 20 }}>
        <UnderlineTabs<Tab>
          ariaLabel="How to add clients"
          value={tab}
          onChange={setTab}
          options={[
            { value: "email", label: "Email", icon: "mail-outline" },
            { value: "paste", label: "Paste a list", icon: "document-text-outline" },
            { value: "link", label: "Join link and QR code", icon: "link-outline" },
          ]}
        />
      </div>

      <div className="mc-split">
        <div className="mc-stack">
          {tab === "email" && (
            <Card>
              <form className="pc-form" onSubmit={(e) => void sendOne(e)}>
                <div className="mc-split" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" required />
                  <TextField label="Name" required={false} value={name} onChange={setName} maxLength={120} autoComplete="off" />
                </div>
                <div>
                  <Button type="submit" variant="primary" icon="paper-plane-outline" loading={sending} disabled={!email.trim()}>
                    Send invite
                  </Button>
                </div>
                {singleMsg && (
                  <p className={singleMsg.ok ? "pc-success" : "pc-error"} role="status">
                    {singleMsg.text}
                  </p>
                )}
                <p className="pc-muted" style={{ fontSize: 14 }}>
                  They'll get an email from MileClear with your firm's name. If they don't use MileClear yet, the email helps them start. Nothing is shared until they say yes.
                </p>
              </form>
            </Card>
          )}

          {tab === "paste" && (
            <Card>
              <div className="pc-form">
                <div className="mc-field">
                  <label className="mc-field__label" htmlFor="pc-paste">
                    Paste emails, one per line or separated by commas. Up to {PRACTICE_BULK_INVITE_MAX}. Add a name after a comma if you like.
                  </label>
                  <textarea
                    id="pc-paste"
                    ref={areaRef}
                    className="mc-input mc-textarea pc-paste"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setChecked(null);
                    }}
                    placeholder={"dave@example.com, Dave Mills\npriya@example.com"}
                  />
                  <p className="pc-counter">
                    {lineCount} line{lineCount === 1 ? "" : "s"}
                  </p>
                </div>
                {!checked && (
                  <div>
                    <Button variant="primary" loading={checking} disabled={!text.trim()} onClick={() => void check()}>
                      Check list
                    </Button>
                  </div>
                )}
                {checked && (
                  <>
                    <h2 style={{ fontSize: 16, fontWeight: 700 }}>
                      Checked: {checked.length} line{checked.length === 1 ? "" : "s"}
                    </h2>
                    <div className="pc-chiprow" aria-live="polite">
                      {summary.map(({ o, n }) => (
                        <span key={o}>{chip(o)} <span className="mc-sr-only">{n}</span><span className="pc-muted" style={{ fontSize: 13 }}> {n}</span></span>
                      ))}
                    </div>
                    <div className="pc-tablewrap">
                      <table className="pc-table">
                        <caption className="mc-sr-only">Checked list, problems first</caption>
                        <thead>
                          <tr>
                            <th>Line</th>
                            <th>Email</th>
                            <th>Name</th>
                            <th>Result</th>
                            <th className="is-right">
                              <span className="mc-sr-only">Fix</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((r, i) => (
                            <tr key={`${r.line}-${r.email}-${i}`}>
                              <td className="pc-muted">{r.line}</td>
                              <td>{r.email}</td>
                              <td className="pc-muted">{r.name ?? ""}</td>
                              <td>{chip(r.outcome)}</td>
                              <td className="is-right">
                                {r.outcome === "not_an_email" && (
                                  <button type="button" className="mc-textlink" onClick={() => fixLine(r.line)}>
                                    Fix
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <Button variant="secondary" onClick={() => setChecked(null)}>
                        Edit list
                      </Button>
                      <Button variant="primary" icon="paper-plane-outline" loading={checking} disabled={willInvite === 0} onClick={() => void sendAll()}>
                        {`Send ${willInvite} invite${willInvite === 1 ? "" : "s"}`}
                      </Button>
                    </div>
                  </>
                )}
                {pasteMsg && (
                  <p className="pc-muted" role="status">
                    {pasteMsg}
                  </p>
                )}
              </div>
            </Card>
          )}

          {tab === "link" && (
            <Card title="Your join link">
              <JoinLinkBlock />
            </Card>
          )}
        </div>

        <div className="mc-stack">
          <EmailPreview />
          {tab !== "link" && (
            <Card title="Or share your join link">
              <p className="pc-muted" style={{ fontSize: 14, marginBottom: 12, wordBreak: "break-all" }}>
                {me.practice.joinUrl}
              </p>
              <JoinQr size="sm" version={me.practice.joinCode} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
