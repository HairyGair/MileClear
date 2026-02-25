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
        clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || "com.mileclear.app",
        scope: "name email",
        redirectURI: window.location.origin + "/login",
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
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M14.94 13.38c-.33.76-.49 1.1-.91 1.77-.59.93-1.42 2.09-2.45 2.1-1.15.01-1.44-.75-3-.74-1.55.01-1.87.75-3.02.74-1.03-.01-1.82-1.06-2.41-1.99C1.77 13.06 1.6 10.44 2.55 9.03c.67-1 1.72-1.59 2.7-1.59 1.13 0 1.84.76 2.77.76.9 0 1.45-.76 2.75-.76.87 0 1.8.47 2.47 1.29-2.17 1.19-1.82 4.29.7 5.65zM11.37 5.67c.46-.59.81-1.42.68-2.27-.75.05-1.63.53-2.14 1.15-.46.56-.84 1.4-.69 2.22.82.03 1.67-.46 2.15-1.1z" />
            </svg>
            {appleLoading ? "Signing in..." : "Continue with Apple"}
          </button>
        )}
      </div>
    </div>
  );
}
