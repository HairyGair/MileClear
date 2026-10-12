"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, EmptyState, Skeleton } from "../../../../components/dashboard/kit";
import { useAuth } from "../../../../lib/auth-context";
import { errorText, papi, publicGet } from "../../../../lib/practice";

export default function StaffInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();
  const { user, loading } = useAuth();
  const [info, setInfo] = useState<{ practiceName: string; expired: boolean } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Join a practice · MileClear";
    publicGet<{ practiceName: string; expired: boolean }>(`/practice-public/staff-invite/${token}`)
      .then(setInfo)
      .catch(() => setNotFound(true));
  }, [token]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await papi.post("/practice/staff/accept", { token });
      router.push("/practice");
    } catch (e) {
      setError(errorText(e, "Couldn't join. Try again."));
    } finally {
      setJoining(false);
    }
  }

  const here = encodeURIComponent(`/practice/staff-invite/${token}`);

  return (
    <div className="pc-auth">
      <Card>
        {notFound ? (
          <EmptyState icon="close-circle-outline" title="This invite is not recognised" body="It may have been used already. Ask the practice owner for a new one." />
        ) : !info || loading ? (
          <Skeleton variant="row" count={2} />
        ) : info.expired ? (
          <EmptyState icon="time-outline" title="This invite has run out" body={`Ask the owner of ${info.practiceName} to send a new one.`} />
        ) : (
          <div className="pc-form">
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Join {info.practiceName} on MileClear</h1>
            <p className="pc-muted">You&apos;ll see the practice&apos;s client list: each driver&apos;s business miles, trips to sort and quarterly deadlines.</p>
            {user ? (
              <>
                <p className="pc-muted">
                  Joining as <strong style={{ color: "var(--mc-text-1)" }}>{user.email}</strong>.
                </p>
                {error && <p className="pc-error" role="alert">{error}</p>}
                <Button variant="primary" fullWidth loading={joining} onClick={() => void join()}>
                  Join the practice
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" fullWidth href={`/login?next=${here}`}>
                  Sign in to join
                </Button>
                <Button variant="secondary" fullWidth href={`/register?next=${here}`}>
                  Create a free account
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
