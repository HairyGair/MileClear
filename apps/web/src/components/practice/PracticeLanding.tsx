"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StoreButtons from "../StoreButtons";
import { Button, Card, EmptyState, Skeleton, StatusChip } from "../dashboard/kit";
import { publicGet, type PracticeForDriver } from "../../lib/practice";
import { PracticeMark } from "./PracticeMark";

/**
 * The page a driver lands on from a practice's join link or emailed invite.
 * Says who is asking and what they'd see, then sends the driver to the app
 * (or the web) to say yes. Nothing is shared from this page.
 */
export function PracticeLanding({ kind, value }: { kind: "code" | "invite"; value: string }) {
  const [practice, setPractice] = useState<PracticeForDriver | null>(null);
  const [expired, setExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const path = kind === "code" ? `/practice-public/join/${encodeURIComponent(value)}` : `/practice-public/invite/${encodeURIComponent(value)}`;
    publicGet<{ practice: PracticeForDriver; expired?: boolean }>(path)
      .then((d) => {
        setPractice(d.practice);
        setExpired(!!d.expired);
      })
      .catch(() => setNotFound(true));
  }, [kind, value]);

  const param = `${kind}=${encodeURIComponent(value)}`;
  const appLink = `mileclear://practice-consent?${param}`;
  const webLink = `/dashboard/tax/accountant/accept?${param}`;

  return (
    <div className="pc-auth">
      <div className="pc-auth__brand">
        <Link href="/" className="mc-wordmark">
          <img src="/branding/logo-120x120.png" alt="" width={28} height={28} className="mc-wordmark__logo" />
          <span className="mc-wordmark__text">
            Mile<span>Clear</span>
          </span>
        </Link>
      </div>
      <Card>
        {notFound ? (
          <EmptyState
            icon="close-circle-outline"
            title={kind === "code" ? "This link is not recognised" : "This invite is not recognised"}
            body="Ask your accountant to send it again."
          />
        ) : !practice ? (
          <Skeleton variant="row" count={2} />
        ) : expired ? (
          <EmptyState icon="time-outline" title="This request has expired" body="Ask your accountant to send a new one." />
        ) : (
          <div className="pc-form">
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <PracticeMark initials={practice.initials} logoPath={practice.logoPath} size={52} name={practice.name} />
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700 }}>{practice.name}</h1>
                <p className="pc-muted" style={{ fontSize: 14 }}>
                  {[practice.contactName, practice.professionalBody].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            {!practice.checked && (
              <div>
                <StatusChip tone="outline" icon="help-circle-outline" label="Not checked yet" />
                <p className="pc-muted" style={{ fontSize: 13, marginTop: 6 }}>
                  We haven&apos;t checked this practice yet. Only share if you know them.
                </p>
              </div>
            )}
            <p>
              {practice.name} would like to see your MileClear records, to help with your tax. If you say yes, they can see your business trips, earnings and expenses. They can&apos;t see your personal trips or change anything. You can stop sharing at any time.
            </p>
            <p className="pc-muted" style={{ fontSize: 14 }}>Nothing is shared until you say yes in MileClear.</p>
            <Button variant="primary" fullWidth href={appLink}>
              Open in the MileClear app
            </Button>
            <Button variant="secondary" fullWidth href={webLink}>
              Answer on the web
            </Button>
            <div>
              <p className="pc-muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Don&apos;t use MileClear yet? Get the free app and sign up with the email your accountant used.
              </p>
              <StoreButtons size="sm" />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
