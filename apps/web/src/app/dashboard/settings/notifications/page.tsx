"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CardError,
  PageHeader,
  SectionHeader,
  SettingsGroup,
  Skeleton,
  ToggleRow,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { api, fetchWithAuth } from "@/lib/api";
import { errMsg, unwrap } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

// Keys and labels follow the app (apps/mobile/app/settings/notifications.tsx) and
// PUSH_PREF_KEYS on the API. A missing key means on, except the opt-in keys.
interface Pref {
  key: string;
  label: string;
  hint: string;
  pro?: boolean;
  optIn?: boolean;
}

const GROUPS: { title: string; prefs: Pref[] }[] = [
  {
    title: "Auto-trip",
    prefs: [
      { key: "unclassifiedNudge", label: "Trip reminders", hint: "Nudge to classify unreviewed trips" },
      { key: "autoTripLiveActivity", label: "Live Activity for auto-trips", hint: "Lock-screen indicator on iPhone while a drive is being detected" },
    ],
  },
  {
    title: "Daily",
    prefs: [
      { key: "shiftReminder", label: "Shift alerts", hint: "Warn if a shift runs over 12 hours" },
      { key: "streakReminder", label: "Streak reminders", hint: "Nudge to keep your driving streak alive" },
      { key: "cheapestFuelDaily", label: "Cheapest fuel near me each morning", hint: "Only when a station near where you set off is at least 3p a litre under the local average", optIn: true },
      { key: "evWeeklySummary", label: "EV running costs each Monday", hint: "For electric cars: last week's miles costed at your home rate and on public rapid chargers", optIn: true },
      { key: "roadAlerts", label: "Road alerts on my usual roads (trial)", hint: "A heads-up before you usually set off if a road you use often is closed or badly delayed. At most one a day.", optIn: true },
      { key: "morningBriefing", label: "Morning briefing", hint: "Yesterday's miles and today's outlook, around 8am" },
      { key: "eveningDigest", label: "Evening summary", hint: "Today's trips and miles, around 7pm" },
    ],
  },
  {
    title: "Tax",
    prefs: [{ key: "taxDeadline", label: "Tax deadline", hint: "Tax year end, 31 January and tax payment reminders" }],
  },
  {
    title: "Weekly",
    prefs: [
      { key: "weeklySummary", label: "Weekly summary", hint: "Mileage recap every Monday morning", pro: true },
      { key: "shiftSummary", label: "End-of-shift summary", hint: "Stats notification when you end a shift", pro: true },
    ],
  },
  {
    title: "Monthly and yearly",
    prefs: [
      { key: "monthlyRecap", label: "Monthly recap", hint: "Your month in review on the 1st", pro: true },
      { key: "milestoneAlerts", label: "Milestone alerts", hint: "Celebrate when you hit mileage milestones", pro: true },
    ],
  },
  {
    title: "Clean Air Zones",
    prefs: [
      { key: "cazPayReminder", label: "Pay-by reminders", hint: "The evening before a Clean Air Zone or ULEZ charge is due, if you haven't ticked it as paid", pro: true },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.prefs);

type Stored = Record<string, unknown>;

export default function NotificationsPage() {
  const { user, isPro, refresh } = useMe();
  const { show } = useToast();
  const [stored, setStored] = useState<Stored | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef<Stored>({});

  const load = useCallback(() => {
    setFailed(false);
    api
      .get<unknown>("/notifications/preferences")
      .then((res) => {
        const prefs = unwrap<Stored>(res) ?? {};
        latest.current = prefs;
        setStored(prefs);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const isOn = (p: Pref) => {
    const v = stored?.[p.key];
    return p.optIn ? v === true : v !== false;
  };

  async function toggle(p: Pref, value: boolean) {
    const before = latest.current;
    // The API replaces the whole set, so send every switch we know, not just this one.
    const next: Stored = { ...before };
    for (const q of ALL) {
      const v = before[q.key];
      next[q.key] = q.optIn ? v === true : v !== false;
    }
    next[p.key] = value;
    latest.current = next;
    setStored(next);
    try {
      const res = await fetchWithAuth("/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Couldn't save. Try again.");
      }
    } catch (e) {
      latest.current = before;
      setStored(before);
      show(errMsg(e), "error");
    }
  }

  // Product news email
  const [news, setNews] = useState<boolean | null>(null);
  const newsOn = news ?? user?.marketingEmailsEnabled !== false;
  async function toggleNews(v: boolean) {
    setNews(v);
    try {
      await api.patch("/user/profile", { marketingEmailsEnabled: v });
      await refresh();
      show(v ? "Product news on" : "Product news off");
    } catch (e) {
      setNews(!v);
      show(errMsg(e), "error");
    }
  }

  return (
    <>
      <PageHeader title="Notifications and emails" back={{ href: "/dashboard/settings", label: "Settings" }} />
      <div className={styles.page}>
        <SectionHeader title="On your phone" subtitle="These go to the MileClear app on your phone." />
        {failed ? (
          <CardError onRetry={load} />
        ) : !stored ? (
          <Skeleton variant="row" count={6} />
        ) : (
          GROUPS.map((g) => (
            <SettingsGroup key={g.title} title={g.title}>
              {g.prefs.map((p) => (
                <ToggleRow
                  key={p.key}
                  label={p.label}
                  hint={p.hint}
                  checked={isOn(p) && !(p.pro && !isPro)}
                  disabled={!!p.pro && !isPro}
                  badge={p.pro ? "pro" : undefined}
                  onChange={(v) => void toggle(p, v)}
                />
              ))}
            </SettingsGroup>
          ))
        )}

        <SectionHeader title="Emails" />
        <SettingsGroup footer="We always send account and security emails.">
          <ToggleRow
            label="Product news and tips"
            hint="Release notes, check-ins, tax deadline reminders and status updates."
            checked={newsOn}
            onChange={(v) => void toggleNews(v)}
          />
        </SettingsGroup>
      </div>
    </>
  );
}
