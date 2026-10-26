"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, hasAnalyticsConsent } from "./consent";
import { isSecretPath, secretPathScript } from "./secretPaths";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 loader, gated on cookie consent. The gtag scripts are not rendered at
 * all until the visitor accepts, so no analytics cookies or network calls to
 * Google happen beforehand (PECR-compliant prior consent). If consent is later
 * withdrawn we push a Consent Mode denial so the already-loaded tag stops
 * using storage.
 */
export default function GoogleAnalytics({ gaId }: { gaId: string }) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const sync = () => {
      const ok = hasAnalyticsConsent();
      setGranted(ok);
      // If consent was revoked after gtag already loaded this session, tell it
      // to stop using storage (full removal still needs a reload).
      if (!ok && typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          ad_storage: "denied",
          analytics_storage: "denied",
        });
      }
    };
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  // Never load GA on a page whose URL carries a secret (secretPaths.ts).
  // Once loaded elsewhere it stays loaded, so the init script below also
  // switches GA off (ga-disable-<id>, checked on every hit) whenever the
  // visitor moves onto such a page, and cleans every URL it reports.
  const pathname = usePathname() ?? "/";
  const onSecretPath = isSecretPath(pathname);
  const [loadable, setLoadable] = useState(false);
  useEffect(() => {
    if (granted && !onSecretPath) setLoadable(true);
  }, [granted, onSecretPath]);
  useEffect(() => {
    if (!gaId) return;
    (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = onSecretPath;
    if (!onSecretPath && typeof window.gtag === "function") {
      const safe = (window as unknown as { __mcSafeLocation?: (h: string) => string }).__mcSafeLocation;
      if (safe) window.gtag("set", { page_location: safe(window.location.href) });
    }
  }, [gaId, onSecretPath, pathname]);

  if (!gaId || !granted || !loadable) return null;

  return (
    <>
      <Script id="ga-guard" strategy="afterInteractive">
        {`
          ${secretPathScript()}
          (function(){
            var key='ga-disable-${gaId}';
            function check(url){
              try{
                var u=new URL(url,window.location.href);
                var secret=window.__mcSecretPath(u.pathname);
                window[key]=secret;
                if(!secret&&typeof window.gtag==='function'){window.gtag('set',{page_location:window.__mcSafeLocation(u.href)});}
              }catch(e){window[key]=true;}
            }
            // Runs inside pushState/replaceState, before GA reports the
            // history change, so a client-side move onto a secret page is
            // never sent.
            ['pushState','replaceState'].forEach(function(m){
              var orig=history[m];
              history[m]=function(state,title,url){
                if(url!=null)check(String(url));
                return orig.apply(this,arguments);
              };
            });
            window.addEventListener('popstate',function(){check(window.location.href);});
            check(window.location.href);
          })();
        `}
      </Script>
      <Script
        id="ga-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied' });
          gtag('consent', 'update', { analytics_storage: 'granted' });
          gtag('config', '${gaId}', {
            anonymize_ip: true,
            page_location: window.__mcSafeLocation ? window.__mcSafeLocation(window.location.href) : window.location.origin + window.location.pathname,
            page_referrer: document.referrer && window.__mcSafeLocation ? window.__mcSafeLocation(document.referrer) : ''
          });
        `}
      </Script>
    </>
  );
}
