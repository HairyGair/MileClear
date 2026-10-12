import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The account pages' frame (sign in, create account, forgot password, verify
 * email): a map with a recorded drive on the left, the form on the right.
 * They stack on a phone. Styles in app/(auth)/signin.css.
 */
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="signin">
      <aside className="signin__panel" aria-label="MileClear">
        <svg className="signin__map" viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="signin-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.35" stopColor="#070d1a" stopOpacity="0" />
              <stop offset="1" stopColor="#070d1a" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <g stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" strokeLinecap="round">
            <path d="M-20 160 L660 120" />
            <path d="M-20 420 C200 400 420 460 660 430" />
            <path d="M-20 660 L660 620" />
            <path d="M120 -20 L160 820" />
            <path d="M340 -20 C320 260 380 520 360 820" />
            <path d="M540 -20 L510 820" />
          </g>
          <path d="M120 470 L128 300 C230 292 300 306 352 312 L340 190 L520 110" stroke="rgba(245,166,35,0.22)" strokeWidth="22" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M120 470 L128 300 C230 292 300 306 352 312 L340 190 L520 110" stroke="#f5a623" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="120" cy="470" r="12" fill="#070d1a" stroke="#10b981" strokeWidth="5" />
          <circle cx="520" cy="110" r="14" fill="#f5a623" />
          <circle cx="520" cy="110" r="5" fill="#070d1a" />
          <rect width="640" height="800" fill="url(#signin-shade)" />
        </svg>
        <Link href="/" className="signin__brand">
          <img src="/branding/logo-120x120.png" alt="" />
          <span style={{ color: "inherit" }}>
            Mile<span>Clear</span>
          </span>
        </Link>
        <div className="signin__pitch">
          <h2>
            Every mile,
            <br />
            counted.
          </h2>
          <p>Your trips, earnings and mileage claim, recorded on your phone and ready here on the web.</p>
        </div>
      </aside>

      <main className="signin__main" id="main-content" tabIndex={-1}>
        <div className="signin__form-wrap">
          <h1 className="signin__title">{title}</h1>
          {lead && <p className="signin__lead">{lead}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="signin__error" role="alert">
      {message}
    </div>
  );
}
