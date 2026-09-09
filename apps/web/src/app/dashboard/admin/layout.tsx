"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The admin area's own navigation. Nine sections replace the old twelve-tab
// page plus eight loose sub-pages (Sep 2026). Legacy sub-page paths keep
// working and highlight the section they now belong to.
const SECTIONS: { label: string; href: string; legacy?: string[] }[] = [
  { label: "Overview", href: "/dashboard/admin" },
  { label: "Users", href: "/dashboard/admin/users" },
  { label: "Support", href: "/dashboard/admin/support", legacy: ["/dashboard/admin/missing-trips"] },
  {
    label: "Capture",
    href: "/dashboard/admin/capture",
    legacy: ["/dashboard/admin/activation", "/dashboard/admin/cleartrack"],
  },
  { label: "Android", href: "/dashboard/admin/android" },
  { label: "Revenue", href: "/dashboard/admin/revenue" },
  { label: "Comms", href: "/dashboard/admin/comms" },
  {
    label: "Ops",
    href: "/dashboard/admin/ops",
    legacy: ["/dashboard/admin/build-health", "/dashboard/admin/issues-by-hour"],
  },
  {
    label: "Growth",
    href: "/dashboard/admin/growth",
    legacy: ["/dashboard/admin/funnel", "/dashboard/admin/geographic-density", "/dashboard/admin/insights"],
  },
];

function isActive(pathname: string, s: (typeof SECTIONS)[number]): boolean {
  if (s.href === "/dashboard/admin") return pathname === "/dashboard/admin";
  if (pathname === s.href || pathname.startsWith(s.href + "/")) return true;
  return (s.legacy ?? []).some((l) => pathname === l || pathname.startsWith(l + "/"));
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="admin-area">
      <nav className="admin-nav" aria-label="Admin sections">
        <span className="admin-nav__eyebrow">Admin</span>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`admin-nav__item${isActive(pathname, s) ? " admin-nav__item--active" : ""}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
