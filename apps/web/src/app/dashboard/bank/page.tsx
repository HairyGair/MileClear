"use client";

import { useState } from "react";
import { api, getAccessToken } from "@/lib/api";
import { formatDay } from "@/lib/dashboard/dates";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, StatusChip, useData, useToast } from "@/components/dashboard/kit";
import { ProPage, SelfEmployedOnly } from "@/components/dashboard/money/Company";
import s from "@/components/dashboard/money/money.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

interface Connection {
  id: string;
  institutionName: string | null;
  lastSynced: string | null;
  status: string;
  createdAt: string;
}

function Banks() {
  const toast = useToast();
  const { data, error, loading, reload } = useData<Connection[]>("bank-connections", () => api.get<{ data: Connection[] }>("/earnings/open-banking/connections").then((r) => r.data), { revalidateOnFocus: true });
  const [linking, setLinking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [disconnect, setDisconnect] = useState<Connection | null>(null);

  async function link() {
    setLinking(true);
    setProblem(null);
    setBlockedUrl(null);
    // Open the tab straight away (inside the click) so the browser doesn't block it.
    const tab = window.open("", "_blank");
    try {
      const res = await api.post<{ data: { authLink: string } }>("/earnings/open-banking/link-token");
      const token = getAccessToken() ?? "";
      const url = `${API_URL}/earnings/open-banking/link?authLink=${encodeURIComponent(res.data.authLink)}&token=${encodeURIComponent(token)}&return=web`;
      if (tab) tab.location.href = url;
      else setBlockedUrl(url);
      setWaiting(true);
    } catch (e) {
      tab?.close();
      setProblem(e instanceof Error ? e.message : "Couldn't start linking. Try again.");
    } finally {
      setLinking(false);
    }
  }

  async function sync(c: Connection) {
    setSyncing(c.id);
    setProblem(null);
    try {
      await api.post("/earnings/open-banking/sync", { connectionId: c.id });
      toast.show("Synced");
      reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't sync. Try again.");
    } finally {
      setSyncing(null);
    }
  }

  const none = !!data && data.length === 0;
  const linkButton = (
    <Button variant="primary" icon="business-outline" loading={linking} onClick={link}>
      Link a bank
    </Button>
  );

  return (
    <>
      <PageHeader title="Link a bank" primary={none ? undefined : linkButton} secondary={<Button variant="secondary" href="/dashboard/bank/inbox">Bank inbox</Button>} />
      {waiting && (
        <p className={s.totalLine} role="status">
          Finish in the new tab. Come back here when your bank says you&apos;re done.
          {blockedUrl && (
            <>
              {" "}
              <a className="mc-textlink" href={blockedUrl} target="_blank" rel="noreferrer">
                Open your bank
              </a>
            </>
          )}
        </p>
      )}
      {problem && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}
      {loading && !data && <Skeleton variant="row" count={2} />}
      {error && !data && <ErrorState title="Couldn't load your banks" onRetry={reload} />}
      {none && (
        <EmptyState icon="business-outline" title="No bank linked" body="Link your bank and payments come in for you to sort." action={{ label: "Link a bank", onClick: link }} />
      )}
      {data && data.length > 0 && (
        <div className={s.stack}>
          {data.map((c) => (
            <Card key={c.id} title={c.institutionName ?? "Your bank"}>
              <div className={s.kv}>
                <span className={s.kvKey}>Status</span>
                <StatusChip tone={c.status === "active" ? "green" : "amber"} label={c.status === "active" ? "Linked" : "Needs attention"} />
              </div>
              <div className={s.kv}>
                <span className={s.kvKey}>Last synced</span>
                <span>{c.lastSynced ? formatDay(c.lastSynced) : "Not yet"}</span>
              </div>
              <div className={s.actions}>
                <Button variant="secondary" size="sm" loading={syncing === c.id} onClick={() => sync(c)}>
                  Sync now
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDisconnect(c)}>
                  Disconnect
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={disconnect !== null}
        title="Disconnect this bank?"
        body="We stop bringing in payments from it. Earnings and expenses you already sorted stay."
        confirmLabel="Disconnect"
        destructive
        onClose={() => setDisconnect(null)}
        onConfirm={async () => {
          if (!disconnect) return;
          await api.delete(`/earnings/open-banking/connections/${disconnect.id}`);
          toast.show("Disconnected");
          reload();
        }}
      />
    </>
  );
}

export default function Page() {
  return (
    <SelfEmployedOnly title="Link a bank">
      <ProPage title="Link a bank" reason="bank" teaser={<p>Payments from your bank turn into earnings for you to sort.</p>}>
        <Banks />
      </ProPage>
    </SelfEmployedOnly>
  );
}
