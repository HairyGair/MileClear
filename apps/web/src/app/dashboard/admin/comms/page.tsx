"use client";

// Comms (Oct 2026 rebuild on the admin kit). Push notifications, ready-made
// email campaigns and a custom email composer. The API calls, payloads and
// dry runs are unchanged from the old page; what is new is the confirm step
// that leads with the recipient count, and a "still sending" state that
// stays up until the server answers (send-update takes about 4 minutes).
//
// The three sections are tabs, but all stay mounted (hidden, not removed),
// so switching tab mid-send never loses the sending state or a draft.

import { useCallback, useEffect, useState } from "react";
import { CustomEmailComposer } from "@/components/admin/ops/comms/CustomEmailComposer";
import { EmailCampaigns } from "@/components/admin/ops/comms/EmailCampaigns";
import { PushComposer } from "@/components/admin/ops/comms/PushComposer";
import { Notice, PageHeader, Spinner, TabBar } from "@/components/admin/ui";

type Section = "push" | "campaigns" | "custom";

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "push", label: "Push notification" },
  { id: "campaigns", label: "Ready-made emails" },
  { id: "custom", label: "Custom email" },
];

const ID_BASE = "adm-comms";

export default function AdminCommsPage() {
  const [section, setSection] = useState<Section>("push");
  const [live, setLive] = useState<Record<Section, boolean>>({ push: false, campaigns: false, custom: false });

  const onLive = useCallback((s: Section) => (on: boolean) => setLive((l) => (l[s] === on ? l : { ...l, [s]: on })), []);
  const [handlers] = useState(() => ({ push: onLive("push"), campaigns: onLive("campaigns"), custom: onLive("custom") }));

  const sendingIn = SECTIONS.filter((s) => live[s.id]);

  // Closing or reloading the tab mid-send does not stop the server, but it
  // does lose the result, so ask first.
  useEffect(() => {
    if (sendingIn.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sendingIn.length]);

  return (
    <>
      <PageHeader
        title="Comms"
        subtitle="Send push notifications and emails to drivers. Everything here reaches real people, so count with a dry run before you send."
      />

      {sendingIn.length > 0 && (
        <Notice tone="accent" icon={<Spinner />} title={`Still sending: ${sendingIn.map((s) => s.label.toLowerCase()).join(", ")}`}>
          Keep this tab open and do not send again. The result appears in that section when the server answers.
        </Notice>
      )}

      <div className="adm-tabset">
        <TabBar
          label="Comms sections"
          value={section}
          onChange={(v) => setSection(v as Section)}
          idBase={ID_BASE}
          tabs={SECTIONS.map((s) => ({ id: s.id, label: live[s.id] ? <>{s.label} <Spinner label="sending" /></> : s.label }))}
        />
        {SECTIONS.map((s) => (
          <div
            key={s.id}
            role="tabpanel"
            id={`${ID_BASE}-panel-${s.id}`}
            aria-labelledby={`${ID_BASE}-tab-${s.id}`}
            hidden={section !== s.id}
            className="adm-tabset__panel"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s5)" }}>
              {s.id === "push" && <PushComposer onLiveChange={handlers.push} />}
              {s.id === "campaigns" && <EmailCampaigns onLiveChange={handlers.campaigns} />}
              {s.id === "custom" && <CustomEmailComposer onLiveChange={handlers.custom} />}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
