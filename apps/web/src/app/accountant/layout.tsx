import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../app/globals.css";
import "../../app/dashboard/dashboard.css";

export const metadata: Metadata = {
  title: "Accountant View - MileClear",
  description: "Secure read-only access to mileage and tax data",
  robots: { index: false, follow: false },
};

export default function AccountantLayout({ children }: { children: ReactNode }) {
  return (
    <div className="accountant-shell">
      <header className="accountant-header">
        <div className="accountant-header__inner">
          <a href="https://mileclear.com" className="accountant-header__logo">
            Mile<span>Clear</span>
          </a>
          <span className="accountant-header__badge">Accountant View</span>
        </div>
      </header>
      <main className="accountant-main">{children}</main>
      <footer className="accountant-footer">
        <p>
          This is a secure, read-only view shared via{" "}
          <a href="https://mileclear.com">MileClear</a>. Data cannot be modified through this link.
        </p>
      </footer>
    </div>
  );
}
