"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { useState, type ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

// ── Icons ────────────────────────────────────────────────────────────

const icons = {
  overview: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  trips: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 9h12M9 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  earnings: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2v14M6 5h4.5a2 2 0 010 4H7M6 9h5a2 2 0 010 4H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  vehicles: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 11l1.5-5A1 1 0 014.46 5.5h9.08a1 1 0 01.96.5L16 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="1.5" y="11" width="15" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="15" r="1" fill="currentColor" />
      <circle cx="13" cy="15" r="1" fill="currentColor" />
    </svg>
  ),
  fuel: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 15V5l2-3h6l2 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h10M15 7v8M13 7h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shifts: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  locations: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 1.5C6.24 1.5 4 3.74 4 6.5c0 3.94 5 9.5 5 9.5s5-5.56 5-9.5c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="6.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  exports: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2v9m0 0l3-3m-3 3L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 13v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  tax: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7h14M6 3v12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  analytics: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M14 14V8M10 14V5M6 14V10M2 14V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  feedback: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 3h14v10H6l-4 3V3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  admin: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  business: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="6" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6V4.5A1.5 1.5 0 017.5 3h3A1.5 1.5 0 0112 4.5V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  personal: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 15.5c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

// ── Nav structure ────────────────────────────────────────────────────

const BUSINESS_ITEMS: NavItem[] = [
  { href: "/dashboard/business", label: "Business", icon: icons.business },
  { href: "/dashboard/shifts", label: "Shifts", icon: icons.shifts },
  { href: "/dashboard/earnings", label: "Earnings", icon: icons.earnings },
  { href: "/dashboard/exports", label: "Exports", icon: icons.exports },
  { href: "/dashboard/tax", label: "Tax Summary", icon: icons.tax },
];

const PERSONAL_ITEMS: NavItem[] = [
  { href: "/dashboard/personal", label: "Personal", icon: icons.personal },
  { href: "/dashboard/analytics", label: "Analytics", icon: icons.analytics },
];

const SHARED_ITEMS: NavItem[] = [
  { href: "/dashboard/trips", label: "Trips", icon: icons.trips },
  { href: "/dashboard/vehicles", label: "Vehicles", icon: icons.vehicles },
  { href: "/dashboard/fuel", label: "Fuel", icon: icons.fuel },
  { href: "/dashboard/locations", label: "Locations", icon: icons.locations },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/dashboard/feedback", label: "Feedback", icon: icons.feedback },
  { href: "/dashboard/settings", label: "Settings", icon: icons.settings },
];

// ── Component ────────────────────────────────────────────────────────

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, refreshUser } = useAuth();
  const [modeLoading, setModeLoading] = useState(false);

  const mode = user?.dashboardMode ?? "both";

  const handleModeChange = async (newMode: "both" | "work" | "personal") => {
    if (newMode === mode || modeLoading) return;
    setModeLoading(true);
    try {
      await api.patch("/user/profile", { dashboardMode: newMode });
      await refreshUser();
    } catch {
      // silently fail — mode will stay the same
    } finally {
      setModeLoading(false);
    }
  };

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const renderLink = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      className={`sidebar__link ${isActive(item.href) ? "sidebar__link--active" : ""}`}
      onClick={onClose}
    >
      <span className="sidebar__link-icon">{item.icon}</span>
      {item.label}
    </Link>
  );

  const showBusiness = mode === "both" || mode === "work";
  const showPersonal = mode === "both" || mode === "personal";

  return (
    <>
      <div
        className={`sidebar__overlay ${open ? "sidebar__overlay--open" : ""}`}
        onClick={onClose}
      />
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <Link href="/dashboard" className="sidebar__logo" onClick={onClose}>
          <img
            src="/branding/logo-120x120.png"
            alt=""
            className="sidebar__logo-icon"
          />
          <span className="sidebar__logo-text">
            Mile<span>Clear</span>
          </span>
        </Link>

        {user && (
          <div className="sidebar__user">
            <div className="sidebar__avatar">
              {(user as any).avatarId ? (
                <img
                  src={`/avatars/avatar-${String((user as any).avatarId).padStart(2, "0")}.png`}
                  alt=""
                  className="sidebar__avatar-img"
                />
              ) : (
                initials
              )}
            </div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">
                {user.displayName || user.email}
              </div>
              <div
                className={`sidebar__user-badge ${
                  !user.isPremium ? "sidebar__user-badge--free" : ""
                }`}
              >
                {user.isPremium ? "PRO" : "Free"}
              </div>
            </div>
          </div>
        )}

        {/* Quick mode toggle */}
        <div className="sidebar__mode-toggle">
          {([
            { value: "work" as const, label: "Work" },
            { value: "both" as const, label: "Both" },
            { value: "personal" as const, label: "Personal" },
          ]).map((opt) => (
            <button
              key={opt.value}
              className={`sidebar__mode-btn${mode === opt.value ? " sidebar__mode-btn--active" : ""}`}
              onClick={() => handleModeChange(opt.value)}
              disabled={modeLoading}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <nav className="sidebar__nav">
          {/* Overview — always visible */}
          {renderLink({ href: "/dashboard", label: "Overview", icon: icons.overview })}

          {/* Business section */}
          {showBusiness && (
            <>
              {mode === "both" && <div className="sidebar__section-label">Business</div>}
              {BUSINESS_ITEMS.map(renderLink)}
            </>
          )}

          {/* Personal section */}
          {showPersonal && (
            <>
              {mode === "both" && <div className="sidebar__section-label">Personal</div>}
              {PERSONAL_ITEMS.map(renderLink)}
            </>
          )}

          {/* Shared */}
          {mode === "both" && <div className="sidebar__section-label">General</div>}
          {SHARED_ITEMS.map(renderLink)}

          {/* Bottom items */}
          <div className="sidebar__section-label" />
          {BOTTOM_ITEMS.map(renderLink)}
        </nav>

        <div className="sidebar__bottom">
          {user?.isAdmin && (
            <Link
              href="/dashboard/admin"
              className={`sidebar__link ${
                isActive("/dashboard/admin") ? "sidebar__link--active" : ""
              }`}
              onClick={onClose}
              style={{ marginBottom: "0.5rem" }}
            >
              <span className="sidebar__link-icon">{icons.admin}</span>
              Admin
            </Link>
          )}
          <button className="sidebar__logout" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M6.5 16H3.5a1 1 0 01-1-1V3a1 1 0 011-1h3M12 12.5L15.5 9 12 5.5M6 9h9.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
