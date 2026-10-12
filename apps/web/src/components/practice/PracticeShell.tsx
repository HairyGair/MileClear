"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../lib/auth-context";
import { papi, PracticeError, type PracticeMe } from "../../lib/practice";
import { Button, EmptyState, ErrorState, Icon, Menu, Skeleton } from "../dashboard/kit";

interface PracticeCtx {
  me: PracticeMe;
  reload: () => void;
}

const Ctx = createContext<PracticeCtx | null>(null);

export function usePractice(): PracticeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePractice must be inside PracticeShell");
  return c;
}

function Wordmark() {
  return (
    <Link href="/practice" className="mc-wordmark" aria-label="MileClear for practices">
      <img src="/branding/logo-120x120.png" alt="" width={28} height={28} className="mc-wordmark__logo" />
      <span className="mc-wordmark__text">
        Mile<span>Clear</span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/practice", label: "Clients", match: (p: string) => p === "/practice" || p.startsWith("/practice/clients") },
  { href: "/practice/requests", label: "Requests", match: (p: string) => p.startsWith("/practice/requests") },
  { href: "/practice/settings", label: "Settings", match: (p: string) => p.startsWith("/practice/settings") },
];

function TopBar({ me, hideAdd }: { me: PracticeMe | null; hideAdd?: boolean }) {
  const pathname = usePathname() ?? "";
  const { user, logout } = useAuth();
  const initial = (user?.displayName || user?.fullName || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <header className="pc-topbar">
      <div className="pc-topbar__inner">
        <Wordmark />
        <span className="pc-topbar__divider" aria-hidden="true" />
        <div className="pc-ident">
          <span className="pc-ident__kicker">Practice</span>
          <span className="pc-ident__name" title={me?.practice.name}>
            {me?.practice.name ?? ""}
          </span>
        </div>
        {me && (
          <nav className="pc-nav" aria-label="Practice">
            {NAV.map((n) => {
              const on = n.match(pathname);
              return (
                <Link key={n.href} href={n.href} className={`pc-nav__item${on ? " is-active" : ""}`} aria-current={on ? "page" : undefined}>
                  {n.label}
                  {n.label === "Requests" && me.counts.openRequests > 0 && <span className="mc-count">{me.counts.openRequests}</span>}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="pc-topbar__right">
          {me && !hideAdd && !me.practice.paused && (
            <Button href="/practice/add" icon="add" variant="secondary" aria-label="Add clients">
              <span className="pc-add-label">Add clients</span>
            </Button>
          )}
          <Menu
            ariaLabel="Your account"
            triggerClassName="mc-avatar"
            trigger={<span className="mc-avatar__initial">{initial}</span>}
            header={
              <div className="mc-profile">
                <p className="mc-profile__name">{me?.member.name ?? user?.email}</p>
                <p className="mc-profile__email">{user?.email}</p>
              </div>
            }
            items={[
              ...NAV.map((n) => ({ label: n.label, href: n.href })),
              { label: "Switch to your driving", href: "/dashboard" },
              {
                label: "Sign out",
                onClick: () => {
                  logout().finally(() => {
                    window.location.href = "/login";
                  });
                },
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * The signed-in practice frame: top bar, no rail (the client table needs
 * the width). Loads /practice/me; someone with no practice goes to sign-up.
 */
export function PracticeShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/practice";
  const [me, setMe] = useState<PracticeMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
      return;
    }
    let cancelled = false;
    papi
      .get<PracticeMe>("/practice/me")
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof PracticeError && e.code === "no_practice") {
          router.replace("/practice/signup");
          return;
        }
        setError(e instanceof Error ? e.message : "Couldn't load your practice.");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, router, pathname, nonce]);

  useEffect(() => {
    if (me) document.title = `${me.practice.name} · MileClear for practices`;
  }, [me]);

  let body: ReactNode;
  if (error && !me) {
    body = <ErrorState title="Couldn't load your practice" body="Check your connection and try again." onRetry={reload} />;
  } else if (!me) {
    body = <Skeleton variant="row" count={8} />;
  } else if (me.practice.paused) {
    body = (
      <EmptyState
        icon="lock-closed-outline"
        title="This practice account is paused"
        body="Email support@mileclear.com and we'll sort it."
        action={{ label: "Email support", href: "mailto:support@mileclear.com" }}
      />
    );
  } else {
    body = <Ctx.Provider value={{ me, reload }}>{children}</Ctx.Provider>;
  }

  return (
    <>
      <a href="#pc-main" className="pc-skip">
        Skip to content
      </a>
      <TopBar me={me} />
      <main id="pc-main" className="pc-main" tabIndex={-1}>
        {body}
      </main>
    </>
  );
}

/** Page title block: 28/700 title, a line under it, actions on the right. */
export function PracticeHead({ title, line, actions }: { title: string; line?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="pc-head">
      <div>
        <h1 className="pc-head__title">{title}</h1>
        {line && <p className="pc-head__line">{line}</p>}
      </div>
      {actions && <div className="pc-head__actions">{actions}</div>}
    </div>
  );
}

export function Banner({
  icon,
  tone = "default",
  children,
  actions,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  tone?: "default" | "amber";
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`pc-banner${tone === "amber" ? " pc-banner--amber" : ""}`}>
      <Icon name={icon} size={20} className="pc-banner__icon" />
      <p className="pc-banner__text">{children}</p>
      {actions && <div className="pc-banner__actions">{actions}</div>}
    </div>
  );
}
