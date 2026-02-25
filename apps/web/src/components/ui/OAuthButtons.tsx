"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { loginWithGoogle } from "../../lib/auth";
import { setTokens } from "../../lib/api";
import { fetchProfile } from "../../lib/auth";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

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
  }
}

interface OAuthButtonsProps {
  onSuccess: () => void;
  onError: (error: string) => void;
}

export function OAuthButtons({ onSuccess, onError }: OAuthButtonsProps) {
  const googleRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
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

  // Listen for Apple auth postMessage from popup
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      // Only accept messages from our API
      if (!event.data?.type?.startsWith("apple-auth-")) return;

      if (event.data.type === "apple-auth-success") {
        setAppleLoading(true);
        try {
          setTokens(event.data.accessToken, event.data.refreshToken);
          await fetchProfile(); // Verify tokens work
          onSuccessRef.current();
        } catch (err: any) {
          onErrorRef.current(err.message || "Apple sign-in failed");
        } finally {
          setAppleLoading(false);
        }
      } else if (event.data.type === "apple-auth-error") {
        onErrorRef.current(event.data.error || "Apple sign-in failed");
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleApple = useCallback(() => {
    // Open popup to API server which redirects to Apple
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      `${API_URL}/auth/apple/web`,
      "apple-signin",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      onError("Popup blocked. Please allow popups for this site.");
      return;
    }

    setAppleLoading(true);

    // Watch for popup close (user cancelled)
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setAppleLoading(false);
      }
    }, 500);
  }, [onError]);

  const showGoogle = !!GOOGLE_CLIENT_ID;

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

        <button
          className="oauth__btn oauth__btn--apple"
          onClick={handleApple}
          disabled={appleLoading}
        >
          <svg width="18" height="22" viewBox="0 0 814 1000" fill="currentColor">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.8-82-103.2-209.7-103.2-331.7 0-194.9 126.7-298.3 251.4-298.3 66.2 0 121.4 43.4 163 43.4 39.5 0 101.1-46 176.6-46 28.5 0 130.9 2.6 198.3 99.5zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8.7 15.6 1.3 18.1 2.6.4 6.5 1.3 10.4 1.3 45.3 0 103.1-30.4 139.3-71.3z" />
          </svg>
          {appleLoading ? "Signing in..." : "Sign in with Apple"}
        </button>
      </div>
    </div>
  );
}
