"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loginWithGoogle } from "../../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Where to send the driver after the Apple redirect returns (it drops the query string). */
export const OAUTH_NEXT_KEY = "mc_oauth_next";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface OAuthButtonsProps {
  onSuccess: () => void;
  onError: (error: string) => void;
  /** "top": the buttons come first and the divider leads into the email form
   *  below (sign-in). "bottom": the divider comes first, under the form. */
  placement?: "top" | "bottom";
}

// Sign in with Google came back on 12 Oct 2026 (off since March). It uses
// Google's own button from Identity Services, which hands back an ID token
// the API checks exactly as it does the app's.
export function OAuthButtons({ onSuccess, onError, placement = "bottom" }: OAuthButtonsProps) {
  const googleRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // The GIS callback is set once, so it reads the latest props through a ref.
  const handleGoogleRef = useRef<(response: { credential: string }) => void>(undefined);
  handleGoogleRef.current = async (response) => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle(response.credential, true);
      onSuccess();
    } catch (err: any) {
      onError(err.message || "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    if (window.google?.accounts) {
      setGoogleReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setGoogleReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const el = googleRef.current;
    if (!googleReady || !GOOGLE_CLIENT_ID || !el || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential: string }) => handleGoogleRef.current?.(response),
    });
    // GIS wants a pixel width (200 to 400).
    const width = Math.max(200, Math.min(400, Math.floor(el.getBoundingClientRect().width)));
    window.google.accounts.id.renderButton(el, {
      theme: "filled_black",
      size: "large",
      shape: "rectangular",
      text: "signin_with",
      logo_alignment: "center",
      width,
    });
  }, [googleReady]);

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

  const divider = (
    <div className="oauth__divider">
      <span>{placement === "top" ? "or with email" : "or"}</span>
    </div>
  );

  return (
    <div className={`oauth oauth--${placement}`}>
      {placement === "bottom" && divider}

      <div className="oauth__buttons">
        <button type="button" className="oauth__btn oauth__btn--apple" onClick={handleApple}>
          <svg width="16" height="20" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.8-82-103.2-209.7-103.2-331.7 0-194.9 126.7-298.3 251.4-298.3 66.2 0 121.4 43.4 163 43.4 39.5 0 101.1-46 176.6-46 28.5 0 130.9 2.6 198.3 99.5zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8.7 15.6 1.3 18.1 2.6.4 6.5 1.3 10.4 1.3 45.3 0 103.1-30.4 139.3-71.3z" />
          </svg>
          Sign in with Apple
        </button>

        {GOOGLE_CLIENT_ID && (
          <div className="oauth__google-wrap">
            <div ref={googleRef} className="oauth__google-btn" />
            {googleLoading && <div className="oauth__loading" role="status">Signing in with Google...</div>}
          </div>
        )}
      </div>

      {placement === "top" && divider}
    </div>
  );
}
