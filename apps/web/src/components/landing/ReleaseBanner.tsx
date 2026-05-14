"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getLatestRelease } from "@mileclear/shared";
import "./release-banner.css";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6742044832";

/**
 * Site-wide announcement banner. Renders across every page on
 * mileclear.com when the current "Latest" release has a `banner`
 * field set (see ReleaseNote interface in @mileclear/shared).
 *
 * Conditions for showing:
 *   1. There's a release labelled "Latest" in RELEASE_NOTES
 *   2. That release has a `banner` object set
 *   3. The visitor hasn't dismissed THIS specific version's banner
 *      (localStorage key is version-scoped so a new release will
 *      re-show even to users who dismissed the previous one)
 *
 * Renders empty during SSR + first client paint, then fills in
 * once we've checked localStorage. Avoids hydration flicker by
 * only mounting once we know dismissed-vs-shown.
 */
export default function ReleaseBanner() {
  const [shouldShow, setShouldShow] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const release = getLatestRelease();
    if (!release || !release.banner) return;
    const key = `mc-release-banner-dismissed-${release.version}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(key) === "1") return;
    setVersion(release.version);
    setShouldShow(true);
  }, []);

  // Once the banner mounts, set the data attribute + --banner-h CSS
  // variable on <html> so the fixed-position navbar (defined in
  // globals.css with `top: 0`) shifts down by the banner's actual
  // measured height. On unmount / dismiss, unset both so the navbar
  // snaps back to top: 0 with no leftover gap.
  useEffect(() => {
    if (!shouldShow) return;
    const root = document.documentElement;
    const measure = () => {
      const h = bannerRef.current?.offsetHeight ?? 44;
      root.style.setProperty("--banner-h", `${h}px`);
    };
    root.dataset.releaseBanner = "1";
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      delete root.dataset.releaseBanner;
      root.style.removeProperty("--banner-h");
    };
  }, [shouldShow]);

  if (!shouldShow || !version) return null;

  const release = getLatestRelease();
  if (!release?.banner) return null;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(
        `mc-release-banner-dismissed-${version}`,
        "1"
      );
    } catch {
      // localStorage might be unavailable (private mode, quota); fall
      // through and just hide for this page load only.
    }
    setShouldShow(false);
  };

  return (
    <div ref={bannerRef} className="release-banner" role="region" aria-label="What's new in MileClear">
      <div className="release-banner__inner">
        <div className="release-banner__copy">
          <span className="release-banner__pulse" aria-hidden="true" />
          <strong className="release-banner__headline">{release.banner.headline}</strong>
          {release.banner.subline ? (
            <span className="release-banner__subline">{release.banner.subline}</span>
          ) : null}
        </div>
        <div className="release-banner__ctas">
          <Link href="/releases" className="release-banner__link">
            What&rsquo;s new
          </Link>
          <a
            href={APP_STORE_URL}
            className="release-banner__cta"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </a>
          <button
            type="button"
            className="release-banner__dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M1 1L13 13M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
