"use client";

import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

/** Where to send the driver after the Apple redirect returns (it drops the query string). */
export const OAUTH_NEXT_KEY = "mc_oauth_next";

interface OAuthButtonsProps {
  onSuccess: () => void;
  onError: (error: string) => void;
}

// Google Sign-In is disabled (iOS-only clearance for now), and its Identity
// Services code has been removed. Bring it back from git history if it returns.
export function OAuthButtons(_props: OAuthButtonsProps) {
  // Apple Sign-In: redirect to API server (full page, not popup). The page
  // they were heading for is parked in sessionStorage because the callback
  // returns with tokens in the URL hash and no query string.
  const handleApple = useCallback(() => {
    try {
      const next = new URLSearchParams(window.location.search).get("next");
      if (next) window.sessionStorage.setItem(OAUTH_NEXT_KEY, next);
      else window.sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      // Private windows can throw. They land on the dashboard instead.
    }
    window.location.href = `${API_URL}/auth/apple/web`;
  }, []);

  return (
    <div className="oauth">
      <div className="oauth__divider">
        <span>or</span>
      </div>

      <div className="oauth__buttons">
        <button
          className="oauth__btn oauth__btn--apple"
          onClick={handleApple}
        >
          <svg width="18" height="22" viewBox="0 0 814 1000" fill="currentColor">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.8-82-103.2-209.7-103.2-331.7 0-194.9 126.7-298.3 251.4-298.3 66.2 0 121.4 43.4 163 43.4 39.5 0 101.1-46 176.6-46 28.5 0 130.9 2.6 198.3 99.5zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8.7 15.6 1.3 18.1 2.6.4 6.5 1.3 10.4 1.3 45.3 0 103.1-30.4 139.3-71.3z" />
          </svg>
          Sign in with Apple
        </button>
      </div>
    </div>
  );
}
