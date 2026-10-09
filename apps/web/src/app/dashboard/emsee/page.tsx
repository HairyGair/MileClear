"use client";

import { useRef, useState } from "react";
import {
  Button,
  CardError,
  EmptyState,
  PageHeader,
  ProGate,
  Skeleton,
  TextArea,
  useData,
} from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg, unwrap } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

interface AssistantStatus {
  available?: boolean;
  dailyLimit?: number;
  monthlyLimit?: number;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const MAX_QUESTION = 500;
const MAX_HISTORY = 6;

function Chat({ dailyLimit }: { dailyLimit?: number }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    // The last 6 good turns go with the question. Nothing is stored anywhere else.
    const history = turns
      .filter((t) => !t.error)
      .slice(-MAX_HISTORY)
      .map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }));
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const res = await api.post<unknown>("/assistant/ask", { question: q, history });
      const answer = unwrap<{ answer?: string }>(res)?.answer ?? "I couldn't find an answer to that.";
      setTurns((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (e) {
      setTurns((prev) => [...prev, { role: "assistant", text: errMsg(e, "EmSee couldn't answer just now. Try again in a moment."), error: true }]);
    } finally {
      setAsking(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView?.({ block: "nearest" }));
    }
  }

  return (
    <div className={styles.page}>
      <p className={styles.muted}>
        Ask about your MileClear records and how the app works. EmSee only answers questions about MileClear.
        {dailyLimit ? ` ${dailyLimit} questions a day.` : ""}
      </p>

      {turns.length > 0 && (
        <div className={styles.thread} role="log" aria-live="polite" aria-label="Conversation with EmSee">
          {turns.map((t, i) => (
            <div
              key={i}
              className={`${styles.bubble} ${t.role === "user" ? styles.bubbleYou : t.error ? styles.bubbleError : styles.bubbleEmsee}`}
            >
              {t.text}
            </div>
          ))}
          {asking && <div className={`${styles.bubble} ${styles.bubbleEmsee}`}>EmSee is thinking...</div>}
          <div ref={endRef} />
        </div>
      )}

      <form
        className={styles.fields}
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <TextArea
          label="Your question"
          value={question}
          onChange={(v) => setQuestion(v.slice(0, MAX_QUESTION))}
          maxLength={MAX_QUESTION}
          rows={3}
          hint="For example: how many business miles did I do last month?"
        />
        <div className={styles.actions}>
          <Button variant="primary" type="submit" loading={asking} disabled={!question.trim()}>
            Ask EmSee
          </Button>
          <span className={styles.counter} aria-live="off">{question.length}/{MAX_QUESTION}</span>
        </div>
      </form>
    </div>
  );
}

// EmSee: Pro, and only while the API says it is switched on.
export default function EmseePage() {
  const status = useData<AssistantStatus>("assistant-status-page", async () => unwrap<AssistantStatus>(await api.get<unknown>("/assistant/status")));
  const back = { href: "/dashboard/more", label: "More" };

  let body: React.ReactNode;
  if (status.loading && !status.data) body = <Skeleton variant="card" />;
  else if (status.error && !status.data) body = <CardError onRetry={status.reload} />;
  else if (status.data?.available !== true) body = <EmptyState icon="chatbubble-ellipses-outline" title="EmSee isn't available yet" body="Check back soon." />;
  else
    body = (
      <ProGate reason="emsee" page>
        <Chat dailyLimit={status.data.dailyLimit} />
      </ProGate>
    );

  return (
    <>
      <PageHeader title="EmSee" back={back} />
      {body}
    </>
  );
}
