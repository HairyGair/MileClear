"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Milesheet's own header. Deliberately NOT the MileClear Navbar: that one
 * carries links to gig driver landing pages, which is the exact context a
 * company evaluating this must never be shown.
 */
export default function MilesheetHeader({ authed }: { authed?: boolean }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`ms-header__link${pathname === href ? " ms-header__link--active" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <header className="ms-header">
      <Link href="/milesheet" className="ms-wordmark">
        Mile<span>sheet</span>
      </Link>
      <nav className="ms-header__nav">
        {authed ? (
          <>
            {link("/milesheet/portal", "Portal")}
            {link("/dashboard", "My mileage")}
          </>
        ) : (
          <>
            {link("/milesheet", "Overview")}
            <Link href="/milesheet/portal" className="ms-header__link">
              Sign in
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
