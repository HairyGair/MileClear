"use client";

import { useState } from "react";

// Milesheet pricing (Oct 2026): one question shown to a manager straight
// after they approve a month, in the portal and on the email approval page.
// Asked once per org; the server decides whether to ask
// (apps/api/src/services/teamPriceQuestion.ts). A skip brings it back next
// month.

export type PriceAnswer = "gbp_2" | "gbp_4" | "gbp_6_plus" | "would_not_pay";

const OPTIONS: Array<{ value: PriceAnswer; label: string }> = [
  { value: "gbp_2", label: "£2" },
  { value: "gbp_4", label: "£4" },
  { value: "gbp_6_plus", label: "£6 or more" },
  { value: "would_not_pay", label: "I wouldn't pay for it" },
];

export const PRICE_QUESTION =
  "Milesheet is free while it is in its pilot. When it isn't, what would you expect to pay per driver each month?";

export function PriceQuestion({
  onAnswer,
  onSkip,
  showQuestion = true,
}: {
  onAnswer: (answer: PriceAnswer, comment: string) => Promise<void>;
  onSkip: () => Promise<void> | void;
  /** False when a surrounding modal already shows the question as its title. */
  showQuestion?: boolean;
}) {
  const [answer, setAnswer] = useState<PriceAnswer | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  if (state === "done") {
    return <p style={{ margin: 0, color: "var(--text-secondary)" }}>Thanks, that helps us a lot.</p>;
  }

  const send = async () => {
    if (!answer) return;
    setState("sending");
    try {
      await onAnswer(answer, comment.trim());
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div>
      {showQuestion && <p style={{ margin: "0 0 0.875rem", fontWeight: 600, lineHeight: 1.5 }}>{PRICE_QUESTION}</p>}
      <div role="radiogroup" aria-label="Price per driver each month" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={answer === o.value}
            className={`btn btn--sm ${answer === o.value ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setAnswer(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="form-group" style={{ marginTop: "0.875rem" }}>
        <label htmlFor="priceComment" className="form-label">
          Anything to add? (optional)
        </label>
        <textarea
          id="priceComment"
          className="form-input"
          rows={2}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {state === "error" && (
        <p style={{ color: "var(--dash-red, #ef4444)", fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
          That didn&rsquo;t send. Please try again.
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
        <button type="button" className="btn btn--sm btn--primary" disabled={!answer || state === "sending"} onClick={send}>
          {state === "sending" ? "Sending..." : "Send answer"}
        </button>
        <button
          type="button"
          onClick={() => void onSkip()}
          disabled={state === "sending"}
          style={{ background: "none", border: 0, padding: 0, color: "var(--text-secondary)", textDecoration: "underline", cursor: "pointer", fontSize: "0.875rem" }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
