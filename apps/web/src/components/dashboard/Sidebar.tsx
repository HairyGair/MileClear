"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/trips",
    label: "Trips",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9h12M9 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/earnings",
    label: "Earnings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2v14M6 5h4.5a2 2 0 010 4H7M6 9h5a2 2 0 010 4H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/vehicles",
    label: "Vehicles",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 11l1.5-5A1 1 0 014.46 5.5h9.08a1 1 0 01.96.5L16 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="1.5" y="11" width="15" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="5" cy="15" r="1" fill="currentColor" />
        <circle cx="13" cy="15" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/dashboard/exports",
    label: "Exports",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2v9m0 0l3-3m-3 3L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 13v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

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
            <div className="sidebar__avatar">{initials}</div>
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

        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link ${
                isActive(item.href) ? "sidebar__link--active" : ""
              }`}
              onClick={onClose}
            >
              <span className="sidebar__link-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar__bottom">
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
