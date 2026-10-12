"use client";

import { useMemo, useState } from "react";
import {
  PRACTICE_NOTE_MAX,
  PRACTICE_REQUESTS_PER_WEEK,
  requestActionLabel,
  requestTitle,
  type PracticePeriod,
  type PracticeRequestType,
} from "@mileclear/shared";
import { Button, DateField, Dialog, Icon, useToast } from "../dashboard/kit";
import { errorText, firstNameOf, papi } from "../../lib/practice";

export interface RequestTarget {
  clientId: string;
  name: string;
  toSort: number;
  earningsShared: boolean;
  expensesShared: boolean;
}

interface SendResult {
  sent: number;
  updated: number;
  nothingToSort: string[];
  overLimit: string[];
  notSharing: string[];
  notShared: string[];
}

/** Who a request type can go to, and why the others are skipped. */
function eligible(type: PracticeRequestType, t: RequestTarget): string | null {
  if (type === "sort_trips" && t.toSort === 0) return "has nothing to sort";
  if (type === "add_earnings" && !t.earningsShared) return "doesn't share earnings";
  if (type === "add_expenses" && !t.expensesShared) return "doesn't share expenses";
  return null;
}

function namesLine(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** Send a request to one client or many (SPEC-UX 1.6, SPEC-VISUAL 4.9). */
export function RequestDialog({
  open,
  onClose,
  targets,
  period,
  initialType = "sort_trips",
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  targets: RequestTarget[];
  period: PracticePeriod;
  initialType?: PracticeRequestType;
  onSent?: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<PracticeRequestType>(initialType);
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const going = useMemo(() => targets.filter((t) => eligible(type, t) === null), [targets, type]);
  const skipped = useMemo(() => targets.filter((t) => eligible(type, t) !== null), [targets, type]);

  const types: { value: PracticeRequestType; title: string; help: string }[] = [
    { value: "sort_trips", title: "Please sort your trips", help: "Adds how many each client has. Closes itself when they're sorted." },
    { value: "add_earnings", title: `Please add your earnings for ${period.range}`, help: "Closes itself when earnings are added for the period." },
    { value: "add_expenses", title: `Please add your expenses for ${period.range}`, help: "Your client taps Done when they've added them." },
    { value: "check_details", title: "Please check your details", help: "Vehicle and tax setup." },
    { value: "other", title: "Something else", help: "Say what you need in the note." },
  ];

  const info = (() => {
    if (going.length === 0) return "Nobody selected can get this request.";
    const skip = skipped.length
      ? ` ${namesLine(skipped.map((s) => firstNameOf(s.name)))} ${skipped.length === 1 ? eligible(type, skipped[0]) : "can't get it"}, so they're skipped.`
      : "";
    if (type === "sort_trips") {
      const counts = going
        .slice()
        .sort((a, b) => b.toSort - a.toSort)
        .slice(0, 3)
        .map((g) => `${firstNameOf(g.name)} ${g.toSort}`)
        .join(", ");
      return `${going.length === 1 ? "This client has" : "Everyone going has"} trips to sort. ${counts}${going.length > 3 ? " and more" : ""}.${skip}`;
    }
    return `${going.length} client${going.length === 1 ? " gets" : "s get"} this.${skip}`;
  })();

  const preview = going[0];
  const previewTitle = requestTitle({
    type,
    countAtSend: preview?.toSort ?? null,
    periodStart: type === "sort_trips" ? null : period.start,
    periodEnd: type === "sort_trips" ? null : period.end,
  });

  async function send() {
    if (type === "other" && !note.trim()) {
      setError("Add a note so your client knows what you need.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const r = await papi.post<SendResult>("/practice/requests", {
        clientIds: going.map((g) => g.clientId),
        type,
        note: note.trim() || null,
        dueDate: due || null,
        period: period.key,
      });
      const total = r.sent + r.updated;
      const extra = r.overLimit.length
        ? ` ${r.overLimit.length} skipped: they've had ${PRACTICE_REQUESTS_PER_WEEK} requests this week.`
        : "";
      toast.show(total ? `Request sent to ${total} client${total === 1 ? "" : "s"}.${extra}` : `Nothing sent.${extra}`, total ? "ok" : "error");
      setNote("");
      setDue("");
      onSent?.();
      onClose();
    } catch (e) {
      setError(errorText(e, "Couldn't send. Try again."));
    } finally {
      setSending(false);
    }
  }

  const over = note.length > PRACTICE_NOTE_MAX;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Send a request to ${targets.length} client${targets.length === 1 ? "" : "s"}`}
      footer={
        <>
          <span className="pc-counter" style={{ marginRight: "auto", alignSelf: "center" }}>
            Up to {PRACTICE_REQUESTS_PER_WEEK} requests a client each week.
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="paper-plane-outline" loading={sending} disabled={going.length === 0 || over} onClick={() => void send()}>
            {`Send to ${going.length} client${going.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <p className="mc-dialog__text">{namesLine(targets.map((t) => t.name))}</p>
      <div className="pc-choices" role="radiogroup" aria-label="Request type">
        {types.map((t) => (
          <label key={t.value} className={`pc-choice${type === t.value ? " is-on" : ""}`}>
            <input type="radio" name="pc-request-type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} />
            <span>
              <span className="pc-choice__title">{t.title}</span>
              <br />
              <span className="pc-choice__help">{t.help}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mc-field">
        <label className="mc-field__label" htmlFor="pc-note">
          Note<span className="mc-field__opt"> (optional)</span>
        </label>
        <textarea id="pc-note" className="mc-input mc-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thanks, I need these by Friday so I can send your update." />
        <p className={`pc-counter${over ? " is-over" : ""}`}>
          {note.length} of {PRACTICE_NOTE_MAX}
        </p>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: 220 }}>
          <DateField label="Due by" required={false} value={due} onChange={setDue} />
        </div>
        <p className="pc-info" style={{ flex: 1, minWidth: 200 }}>
          <Icon name="information-circle-outline" size={16} />
          <span>{info}</span>
        </p>
      </div>
      {preview && (
        <div>
          <p className="mc-field__label" style={{ marginBottom: 8 }}>
            What {firstNameOf(preview.name)} sees in the app
          </p>
          <div className="mc-card" style={{ borderColor: "var(--mc-amber-glow)", maxWidth: 360 }}>
            <p className="pc-muted" style={{ fontSize: 12 }}>Your accountant asked</p>
            <p style={{ fontWeight: 700, margin: "4px 0" }}>{previewTitle}</p>
            {note.trim() && <p style={{ fontSize: 14 }}>&ldquo;{note.trim()}&rdquo;</p>}
            {due && <p className="pc-muted" style={{ fontSize: 13 }}>Due {due.split("-").reverse().join("/")}</p>}
            <p style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "var(--mc-amber)" }}>{requestActionLabel(type)}</p>
          </div>
        </div>
      )}
      {error && (
        <p className="pc-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
