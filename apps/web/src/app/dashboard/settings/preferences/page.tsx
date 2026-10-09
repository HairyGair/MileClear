"use client";

import { useState } from "react";
import { PageHeader, useMe, useToast } from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

type Mode = "work" | "personal" | "both";

const OPTIONS: { value: Mode; title: string; hint: string }[] = [
  { value: "work", title: "Work", hint: "Tax figures, business insights and the tools for work driving." },
  { value: "personal", title: "Personal", hint: "Journeys, milestones and your running costs." },
  { value: "both", title: "Both", hint: "See everything, and switch between Work and Personal on Home." },
];

// What you see: the dashboard mode. Saving refreshes the profile, so the shell's
// third tab (Tax or Insights) changes straight away without a reload.
export default function PreferencesPage() {
  const { baseMode, refresh } = useMe();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(mode: Mode) {
    if (mode === baseMode || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch("/user/profile", { dashboardMode: mode });
      await refresh();
      show("Saved");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="What you see" back={{ href: "/dashboard/settings", label: "Settings" }} />
      <div className={styles.page}>
        <fieldset className={styles.radioCards} disabled={busy}>
          <legend className="mc-sr-only">Dashboard mode</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className={styles.radioCard}>
              <input type="radio" name="mode" value={o.value} checked={baseMode === o.value} onChange={() => void choose(o.value)} />
              <span>
                <span className={styles.radioTitle}>{o.title}</span>
                <span className={styles.radioHint}>{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error && <p className={styles.inlineError} role="alert">{error}</p>}
        <p className={styles.muted}>Card order on Home is set in the app. The website shows the standard order.</p>
      </div>
    </>
  );
}
