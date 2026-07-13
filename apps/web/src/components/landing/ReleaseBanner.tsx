"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ACTIVE_ANNOUNCEMENT, getLatestRelease } from "@mileclear/shared";
import "./release-banner.css";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

type BannerContent =
  | {
      kind: "announcement";
      dismissKey: string;
      headline: string;
      subline?: string;
      ctaLabel?: string;
      ctaHref?: string;
    }
  | {
      kind: "release";
      dismissKey: string;
      headline: string;
      subline?: string;
    };

/**
 * Site-wide banner. Renders across every page on mileclear.com.
 *
 * Priority order:
 *   1. ACTIVE_ANNOUNCEMENT - standalone news (regulatory changes,
 *      outage notices) that isn't tied to a MileClear release.
 *   2. The current "Latest" release's `banner` field - used for
 *      shipping news, App Store launches, feature highlights.
 *
 * Either renders if the visitor hasn't dismissed this exact item
 * (localStorage key is id/version-scoped, so changing the id/version
 * re-shows even to people who dismissed the previous one).
 *
 * Renders empty during SSR + first client paint, then fills in
 * once we've checked localStorage. Avoids hydration flicker by
 * only mounting once we know dismissed-vs-shown.
 */
export default function ReleaseBanner() {
  const [content, setContent] = useState<BannerContent | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Priority 1: standalone announcement.
    if (ACTIVE_ANNOUNCEMENT) {
      const key = `mc-announcement-dismissed-${ACTIVE_ANNOUNCEMENT.id}`;
      if (window.localStorage.getItem(key) !== "1") {
        setContent({
          kind: "announcement",
          dismissKey: key,
          headline: ACTIVE_ANNOUNCEMENT.headline,
          subline: ACTIVE_ANNOUNCEMENT.subline,
          ctaLabel: ACTIVE_ANNOUNCEMENT.cta?.label,
          ctaHref: ACTIVE_ANNOUNCEMENT.cta?.href,
        });
        return;
      }
    }

    // Priority 2: release banner.
    const release = getLatestRelease();
    if (!release || !release.banner) return;
    const key = `mc-release-banner-dismissed-${release.version}`;
    if (window.localStorage.getItem(key) === "1") return;
    setContent({
      kind: "release",
      dismissKey: key,
      headline: release.banner.headline,
      subline: release.banner.subline,
    });
  }, []);

  const shouldShow = content !== null;

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

  if (!content) return null;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(content.dismissKey, "1");
    } catch {
      // localStorage might be unavailable (private mode, quota); fall
      // through and just hide for this page load only.
    }
    setContent(null);
  };

  const isAnnouncement = content.kind === "announcement";
  // Release banners show the "What's new" + "Download" CTAs; standalone
  // announcements show only their own CTA (if any), so they stay focused
  // on the news rather than always nudging an App Store install.
  const ariaLabel = isAnnouncement ? "MileClear announcement" : "What's new in MileClear";

  return (
    <div ref={bannerRef} className="release-banner" role="region" aria-label={ariaLabel}>
      <div className="release-banner__inner">
        <div className="release-banner__copy">
          <span className="release-banner__pulse" aria-hidden="true" />
          <strong className="release-banner__headline">{content.headline}</strong>
          {content.subline ? (
            <span className="release-banner__subline">{content.subline}</span>
          ) : null}
        </div>
        <div className="release-banner__ctas">
          {isAnnouncement ? (
            content.ctaHref && content.ctaLabel ? (
              <Link href={content.ctaHref} className="release-banner__link">
                {content.ctaLabel}
              </Link>
            ) : null
          ) : (
            <>
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
            </>
          )}
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
