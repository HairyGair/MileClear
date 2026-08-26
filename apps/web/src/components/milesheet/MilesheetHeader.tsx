"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Milesheet is a section of MileClear, not a separate company, so the header
 * leads with the MileClear mark and carries Milesheet as the section you are
 * in. It is deliberately NOT the main landing Navbar, which links out to gig
 * driver pages a company evaluating this should never be shown.
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
      <Link href="/milesheet" className="ms-wordmark" aria-label="Milesheet, part of MileClear">
        <img
          src="/branding/logo-120x120.png"
          alt=""
          className="logo-mark"
          aria-hidden="true"
          width={28}
          height={28}
        />
        <span className="ms-wordmark__parent">MileClear</span>
        <span className="ms-wordmark__section">Milesheet</span>
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
            <Link href="/" className="ms-header__link">
              MileClear
            </Link>
            <Link href="/milesheet/portal" className="ms-header__link">
              Sign in
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
