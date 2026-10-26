// Pages whose URL carries a secret (an invite, approval, accountant or
// unsubscribe token, a verification or join code). Google Analytics must
// never see these URLs: GoogleAnalytics.tsx does not load on them, switches
// itself off while the visitor is on one, and only ever sends a cleaned
// page_location (path secrets replaced, unknown query params and the hash
// dropped) everywhere else.

export const SECRET_PATH_PATTERNS: RegExp[] = [
  /^\/accountant\/[^/]+/,
  /^\/milesheet\/(approve|invite|stop)\//,
  /^\/practice-invite\//,
  /^\/practice\/staff-invite\//,
  /^\/join\//,
  /^\/verify\//,
  /^\/unsubscribe/,
  /^\/dashboard\/tax\/accountant\/accept/,
];

/** Query params that are safe to report. Everything else (next=, token=, code=) is dropped. */
export const SAFE_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
  "from",
  "page",
];

export function isSecretPath(pathname: string): boolean {
  return SECRET_PATH_PATTERNS.some((re) => re.test(pathname));
}

/**
 * The same rules as plain JavaScript source, for the inline gtag init script
 * (it runs before React, and must guard history changes GA reports itself).
 * Defines window.__mcSecretPath(pathname) and window.__mcSafeLocation(href).
 */
export function secretPathScript(): string {
  const patterns = JSON.stringify(SECRET_PATH_PATTERNS.map((re) => re.source));
  const safe = JSON.stringify(SAFE_QUERY_PARAMS);
  return `
    (function(){
      var P=${patterns}.map(function(s){return new RegExp(s);});
      var S=${safe};
      window.__mcSecretPath=function(p){for(var i=0;i<P.length;i++){if(P[i].test(p))return true;}return false;};
      window.__mcSafeLocation=function(href){
        try{
          var u=new URL(href,window.location.origin);
          if(window.__mcSecretPath(u.pathname))return u.origin+'/redacted';
          var q=new URLSearchParams();
          u.searchParams.forEach(function(v,k){if(S.indexOf(k)!==-1)q.append(k,v);});
          var qs=q.toString();
          return u.origin+u.pathname+(qs?'?'+qs:'');
        }catch(e){return window.location.origin+'/redacted';}
      };
    })();
  `;
}
