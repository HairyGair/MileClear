"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, CardError, PageHeader, Skeleton, useData, useToast } from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg, unwrap } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

const INVITE = "https://discord.gg/Wxnvr3rzaq";

interface DiscordStatus {
  linked: boolean;
  discordUserId?: string | null;
}

// Discord: link the account in a new tab. The API sends the browser back here with
// ?discord=linked (and the name) when it was started from the website.
function CommunityPage() {
  const params = useSearchParams();
  const returned = params?.get("discord");
  const returnedName = params?.get("username");
  const { show } = useToast();

  const status = useData<DiscordStatus>(
    "discord-status",
    async () => unwrap<DiscordStatus>(await api.get<unknown>("/auth/discord/status")),
    { revalidateOnFocus: true }
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.get<unknown>("/auth/discord/start?client=web");
      const url = unwrap<{ url?: string }>(res)?.url;
      if (!url) throw new Error("no url");
      window.open(url, "_blank", "noopener,noreferrer");
      setOpened(true);
    } catch (e) {
      setError(errMsg(e, "Couldn't start the link. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/discord/unlink");
      show("Unlinked");
      status.reload();
    } catch (e) {
      setError(errMsg(e, "Couldn't unlink. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  const linked = status.data?.linked === true;
  const failedReason = returned === "failed" ? params?.get("reason") : null;

  return (
    <>
      <PageHeader title="Discord" back={{ href: "/dashboard/settings", label: "Settings" }} />
      <div className={styles.page}>
        {status.loading && !status.data ? (
          <Skeleton variant="card" />
        ) : status.error && !status.data ? (
          <CardError onRetry={status.reload} />
        ) : (
          <Card>
            <div className={styles.fields}>
              {linked ? (
                <>
                  <p className={styles.lead}>
                    {returned === "linked" && returnedName ? `Linked as ${returnedName}` : "Your Discord account is linked."}
                  </p>
                  <div className={styles.actions}>
                    <Button variant="secondary" loading={busy} onClick={() => void unlink()}>Unlink</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.lead}>Join drivers on the MileClear Discord.</p>
                  <p className={styles.muted}>Link your account and Pro members get a role in the server.</p>
                  {opened && <p className={styles.muted} role="status">Finish in the new tab. Come back here when it says you&apos;re done.</p>}
                  {failedReason && (
                    <p className={styles.inlineError} role="alert">
                      {failedReason === "already_linked_elsewhere"
                        ? "That Discord account is linked to another MileClear account."
                        : "Couldn't link Discord. Try again."}
                    </p>
                  )}
                  <div className={styles.actions}>
                    <Button variant="primary" loading={busy} onClick={() => void link()}>Link Discord</Button>
                  </div>
                </>
              )}
              {error && <p className={styles.inlineError} role="alert">{error}</p>}
            </div>
          </Card>
        )}
        <p className={styles.muted}>
          Not linking? You can still <a className="mc-textlink" href={INVITE} target="_blank" rel="noopener noreferrer">join the server</a>.
        </p>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CommunityPage />
    </Suspense>
  );
}
