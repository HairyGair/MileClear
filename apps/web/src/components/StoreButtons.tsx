import Link from "next/link";

export const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

/** The Android app is in a closed test on Google Play. The Play listing
 *  returns "not found" to anyone we have not added to the tester list, so the
 *  Android button goes to /android (leave your email, we add you) rather
 *  than to the store. Switch ANDROID_HREF to PLAY_STORE_URL at launch. */
export const ANDROID_HREF = "/android";

type Size = "sm" | "md" | "lg";

interface StoreButtonsProps {
  size?: Size;
  align?: "start" | "center";
  /** Hide the Android button (e.g. inside iOS-only copy). */
  iosOnly?: boolean;
  className?: string;
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="store-btn__logo" fill="currentColor">
      <path d="M16.37 12.64c.03 3.06 2.68 4.08 2.71 4.09-.02.07-.42 1.45-1.4 2.87-.84 1.23-1.72 2.45-3.1 2.48-1.36.02-1.8-.8-3.35-.8-1.55 0-2.04.78-3.32.82-1.33.05-2.35-1.33-3.2-2.55-1.74-2.5-3.06-7.06-1.28-10.14.88-1.53 2.46-2.5 4.18-2.52 1.31-.03 2.54.88 3.34.88.8 0 2.3-1.09 3.88-.93.66.03 2.51.27 3.7 2.01-.1.06-2.21 1.29-2.16 3.79M13.83 4.98c.7-.85 1.18-2.04 1.05-3.22-1.02.04-2.24.68-2.97 1.53-.65.75-1.22 1.96-1.07 3.11 1.13.09 2.29-.58 2.99-1.42" />
    </svg>
  );
}

function PlayLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="store-btn__logo">
      <path d="M3.6 2.4c-.3.3-.5.8-.5 1.4v16.4c0 .6.2 1.1.5 1.4l.1.1 9.2-9.2v-.2L3.7 2.3z" fill="#00d7fe" />
      <path d="M15.9 15.6l-3-3.1v-.2l3-3.1.1.1 3.6 2.1c1 .6 1 1.6 0 2.2L16 15.6z" fill="#ffce00" />
      <path d="M16 15.5l-3.1-3.2-9.3 9.3c.3.4.9.4 1.5.1L16 15.5" fill="#ff3a44" />
      <path d="M16 9.3L5.1 3.1c-.6-.4-1.2-.3-1.5.1l9.3 9.3L16 9.3z" fill="#00f076" />
    </svg>
  );
}

/** Platform-labelled download buttons: App Store (live) + Google Play
 *  (closed beta, via /android). Use everywhere a page invites an install. */
export default function StoreButtons({
  size = "md",
  align = "start",
  iosOnly = false,
  className,
}: StoreButtonsProps) {
  const cls = ["store-btns", `store-btns--${size}`, `store-btns--${align}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="store-btn store-btn--apple"
        aria-label="Download MileClear on the App Store"
      >
        <AppleLogo />
        <span className="store-btn__text">
          <span className="store-btn__eyebrow">Download free on the</span>
          <span className="store-btn__name">App Store</span>
        </span>
      </a>
      {!iosOnly && (
        <Link
          href={ANDROID_HREF}
          className="store-btn store-btn--play"
          aria-label="Join the MileClear Android closed beta on Google Play"
        >
          <PlayLogo />
          <span className="store-btn__text">
            <span className="store-btn__eyebrow">Android closed beta</span>
            <span className="store-btn__name">Google Play</span>
          </span>
          <span className="store-btn__tag">Beta</span>
        </Link>
      )}
    </div>
  );
}
