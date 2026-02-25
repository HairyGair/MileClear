"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { loginWithGoogle, loginWithApple } from "../../lib/auth";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: any) => void;
        signIn: () => Promise<any>;
      };
    };
  }
}

interface OAuthButtonsProps {
  onSuccess: () => void;
  onError: (error: string) => void;
}

export function OAuthButtons({ onSuccess, onError }: OAuthButtonsProps) {
  const googleRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Stable callback ref for Google
  const handleGoogleRef = useRef<(response: { credential: string }) => void>(undefined);
  handleGoogleRef.current = async (response) => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle(response.credential);
      onSuccess();
    } catch (err: any) {
      onError(err.message || "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  // Load Google Identity Services script
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

  // Initialize Google button once script is loaded
  useEffect(() => {
    if (!googleReady || !GOOGLE_CLIENT_ID || !googleRef.current) return;

    window.google!.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential: string }) => {
        handleGoogleRef.current?.(response);
      },
    });

    window.google!.accounts.id.renderButton(googleRef.current, {
      theme: "filled_black",
      size: "large",
      shape: "rectangular",
      width: 352,
      text: "continue_with",
    });
  }, [googleReady]);

  // Load Apple Sign in JS SDK
  useEffect(() => {
    if (window.AppleID) {
      setAppleReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.onload = () => setAppleReady(true);
    document.head.appendChild(script);
  }, []);

  const handleApple = useCallback(async () => {
    if (!window.AppleID) return;
    setAppleLoading(true);
    try {
      window.AppleID.auth.init({
        clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || "com.mileclear.web",
        scope: "name email",
        redirectURI: window.location.origin,
        usePopup: true,
      });

      const response = await window.AppleID.auth.signIn();
      const identityToken = response.authorization?.id_token;
      if (!identityToken) throw new Error("No identity token received");

      const fullName = response.user
        ? {
            givenName: response.user.name?.firstName || null,
            familyName: response.user.name?.lastName || null,
          }
        : undefined;

      await loginWithApple(identityToken, fullName);
      onSuccess();
    } catch (err: any) {
      // User closed the popup — not an error
      if (err?.error === "popup_closed_by_user") return;
      onError(err.message || "Apple sign-in failed");
    } finally {
      setAppleLoading(false);
    }
  }, [onSuccess, onError]);

  const showGoogle = !!GOOGLE_CLIENT_ID;
  const showApple = true; // Always show — works on all browsers

  if (!showGoogle && !showApple) return null;

  return (
    <div className="oauth">
      <div className="oauth__divider">
        <span>or</span>
      </div>

      <div className="oauth__buttons">
        {showGoogle && (
          <div className="oauth__google-wrap">
            <div ref={googleRef} className="oauth__google-btn" />
            {googleLoading && (
              <div className="oauth__loading">Signing in with Google...</div>
            )}
          </div>
        )}

        {showApple && (
          <button
            className="oauth__btn oauth__btn--apple"
            onClick={handleApple}
            disabled={appleLoading || !appleReady}
          >
            <svg width="18" height="22" viewBox="0 0 814 1000" fill="currentColor">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.8-82-103.2-209.7-103.2-331.7 0-194.9 126.7-298.3 251.4-298.3 66.2 0 121.4 43.4 163 43.4 39.5 0 101.1-46 176.6-46 28.5 0 130.9 2.6 198.3 99.5zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8.7 15.6 1.3 18.1 2.6.4 6.5 1.3 10.4 1.3 45.3 0 103.1-30.4 139.3-71.3z" />
            </svg>
            {appleLoading ? "Signing in..." : "Sign in with Apple"}
          </button>
        )}
      </div>
    </div>
  );
}
