"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { resolveAvatarFile } from "../../../lib/avatars";
import { useAuth } from "../../../lib/auth-context";
import { useMe, useUnclassifiedCount } from "../../../lib/dashboard/useMe";
import { Icon } from "../kit/Icon";
import { Menu } from "../kit/Menu";
import { Segmented } from "../kit/Controls";
import { Skeleton } from "../kit/States";
import { activeNavKey, navItems } from "./nav";
import { usePageMeta } from "./pageMeta";
import { TourProvider, useTour } from "../tour/TourProvider";

function Wordmark() {
  return (
    <Link href="/dashboard" className="mc-wordmark" aria-label="MileClear home">
      { }
      <img src="/branding/logo-120x120.png" alt="" width={28} height={28} className="mc-wordmark__logo" />
      <span className="mc-wordmark__text">
        Mile<span>Clear</span>
      </span>
    </Link>
  );
}

function countLabel(n: number, max: number): string {
  return n > max ? `${max}+` : String(n);
}

function Rail() {
  const pathname = usePathname() ?? "";
  const { mode, isAdmin } = useMe();
  const { count } = useUnclassifiedCount();
  const items = navItems(mode);
  const active = activeNavKey(pathname, mode);

  return (
    <nav className="mc-rail" aria-label="Main">
      <div className="mc-rail__brand">
        <Wordmark />
      </div>
      <ul className="mc-rail__list">
        {items.map((it) => {
          const on = it.key === active;
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                className={`mc-rail__item${on ? " is-active" : ""}`}
                aria-current={on ? "page" : undefined}
                aria-label={it.key === "trips" && count > 0 ? `Trips, ${count} to classify` : undefined}
                data-tour={`nav-${it.key}`}
              >
                <Icon name={on ? it.iconActive : it.icon} size={20} />
                <span className="mc-rail__label">{it.label}</span>
                {it.key === "trips" && count > 0 && <span className="mc-count mc-rail__count">{countLabel(count, 99)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      {isAdmin && (
        <div className="mc-rail__foot">
          <Link
            href="/dashboard/admin"
            className={`mc-rail__item${pathname.startsWith("/dashboard/admin") ? " is-active" : ""}`}
          >
            <Icon name="construct-outline" size={20} />
            <span className="mc-rail__label">Admin</span>
          </Link>
        </div>
      )}
    </nav>
  );
}

function TabBar() {
  const pathname = usePathname() ?? "";
  const { mode } = useMe();
  const { count } = useUnclassifiedCount();
  const items = navItems(mode);
  const active = activeNavKey(pathname, mode);
  return (
    <nav className="mc-tabbar" aria-label="Main">
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.href}
            className={`mc-tabbar__item${on ? " is-active" : ""}`}
            aria-current={on ? "page" : undefined}
            aria-label={it.key === "trips" && count > 0 ? `Trips, ${count} to classify` : undefined}
            data-tour={`nav-${it.key}`}
          >
            <span className="mc-tabbar__icon">
              <Icon name={on ? it.iconActive : it.icon} size={24} />
              {it.key === "trips" && count > 0 && <span className="mc-tabbar__badge">{countLabel(count, 9)}</span>}
            </span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AvatarMenu() {
  const { user, isPro, isAdmin } = useMe();
  const { logout } = useAuth();
  const tour = useTour();
  const file = resolveAvatarFile(user?.avatarId);
  const name = user?.displayName || user?.fullName || user?.email || "You";
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <span data-tour="avatar" style={{ display: "inline-flex" }}>
    <Menu
      ariaLabel="Your account"
      triggerClassName="mc-avatar"
      trigger={
        file ? (
           
          <img src={file} alt="" className="mc-avatar__img" />
        ) : (
          <span className="mc-avatar__initial">{initial}</span>
        )
      }
      header={
        <div className="mc-profile">
          <p className="mc-profile__name">{name}</p>
          <p className="mc-profile__email">{user?.email}</p>
          <p className="mc-profile__plan">{isPro ? <span className="mc-pro mc-pro--solid">Pro</span> : "Free"}</p>
        </div>
      }
      items={[
        { label: "Your profile", href: "/dashboard/profile" },
        { label: "Your plan", href: "/dashboard/settings/plan" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Take the tour", onClick: () => tour.startFromMenu() },
        { label: "Get the app", href: "/app", external: true },
        ...(isAdmin ? [{ label: "Admin", href: "/dashboard/admin" }] : []),
        {
          label: "Log out",
          onClick: () => {
            logout().finally(() => {
              window.location.href = "/login";
            });
          },
        },
      ]}
    />
    </span>
  );
}

function TopBar() {
  const pathname = usePathname() ?? "";
  const { meta } = usePageMeta();
  const { baseMode, mode, setMode } = useMe();
  const [scrolled, setScrolled] = useState(false);
  const isHome = pathname === "/dashboard";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`mc-topbar${scrolled ? " is-scrolled" : ""}${isHome ? " mc-topbar--home" : ""}`}>
      <div className="mc-topbar__left">
        {isHome && (
          <span className="mc-topbar__phone-brand">
            <Wordmark />
          </span>
        )}
        {meta.back && (
          <Link href={meta.back.href} className="mc-topbar__back">
            <Icon name="chevron-back" size={20} />
            <span>{meta.back.label}</span>
          </Link>
        )}
        <h1 className="mc-topbar__title">{meta.title}</h1>
      </div>
      <div className="mc-topbar__right">
        {isHome && baseMode === "both" && (
          <span data-tour="mode-toggle" style={{ display: "inline-flex" }}>
            <Segmented
              ariaLabel="View"
              value={mode}
              onChange={setMode}
              options={[
                { value: "work", label: "Work" },
                { value: "personal", label: "Personal" },
              ]}
            />
          </span>
        )}
        <AvatarMenu />
      </div>
    </header>
  );
}

/** The signed-in frame: rail on desktop, top bar, bottom tab bar on phones. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <TourProvider>
      <Rail />
      <div className="mc-frame">
        <TopBar />
        <main id="main-content" className="mc-main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <TabBar />
    </TourProvider>
  );
}

/** Shown while the profile loads or the redirect to /login runs. */
export function ShellSkeleton() {
  return (
    <>
      <nav className="mc-rail" aria-hidden="true">
        <div className="mc-rail__brand" />
      </nav>
      <div className="mc-frame">
        <header className="mc-topbar" />
        <main id="main-content" className="mc-main" tabIndex={-1}>
          <Skeleton variant="card" count={3} />
        </main>
      </div>
    </>
  );
}

