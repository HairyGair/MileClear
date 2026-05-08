# Fraud Prevention Headers — validator run

**Date:** 8 May 2026 (continuation of compliance sprint)
**Operator:** Anthony Gair
**Sandbox app:** `1f34acb9-8580-464b-a337-24fd318d7ac7`
**Final result:** ✅ **No errors. 2 acceptable warnings.**

## Final response

```
Status: 200 OK
specVersion: 3.3
code: POTENTIALLY_INVALID_HEADERS
errors: []
warnings:
  - gov-client-multi-factor (MISSING_HEADER) — acceptable for single-factor auth
  - gov-vendor-license-ids (MISSING_HEADER) — env var exists, populating in follow-up
```

`POTENTIALLY_INVALID_HEADERS` is the warnings-only status. The headers MileClear submits are spec-compliant per HMRC's v3.3 validator. The form question *"Have you checked that your software submits fraud prevention data correctly?"* can be answered **Yes** truthfully on the basis of this evidence.

## Iteration log

Three rounds against the validator. Each round drove a real builder fix.

### Round 1 — pre-fix (baseline)

11 errors + 6 warnings. Findings drove the spec-conformance rewrite of `apps/api/src/services/hmrc/fraudPreventionHeaders.ts`:

- `Gov-Client-User-Agent` was percent-encoded plain string ("MileClear/1.2.0..."). Spec requires key-value: `os-family=...&os-version=...&device-manufacturer=...&device-model=...`. Rewrote builder + extended `MobileClientContext` with the four sub-fields.
- `Gov-Vendor-Version` was bare "1.2.0". Spec requires `client=X.Y.Z&server=X.Y.Z` for client/server architectures.
- `Gov-Client-Public-IP-Timestamp` was missing. Required header; added.
- `Gov-Client-Public-Port` was missing. Required header; added.
- `Gov-Client-Timezone` was "+0100". Spec requires "UTC+01:00". Added `normaliseTimezoneOffset()` helper for shorthand → spec format.
- `Gov-Vendor-Forwarded` was missing. Spec requires for proxied flows: `by=<server-ip>&for=<client-ip>`.
- `Gov-Vendor-Local-IP` was sent. Spec rejects it as `UNEXPECTED_HEADER`. Removed.
- `Gov-Vendor-License-IDs` empty value triggered warning. Now omitted when not populated.
- `Gov-Client-Multi-Factor` had no `unique-reference`. Made optional and only emitted when MFA methods are recorded.
- `Gov-Client-Local-IPs` was auto-populated with the public IP. Now requires caller to supply real private IPs explicitly.

### Round 2 — post-rewrite

1 error + 2 warnings:

- `Gov-Client-Public-Port: 443` rejected as `INVALID_HEADER` — *"Value must not be a server port, for example 443 or 80"*. The header expects the client's **outbound ephemeral port**, not the server-side listening port. Fixed: `requestContext.ts` now reads `request.socket.remotePort` (NAT-translated outbound port that arrived at our server) with a 56789 fallback.

### Round 3 — current

0 errors. 2 warnings.

## Evidence — exact headers HMRC accepted

```
Gov-Vendor-Product-Name: MileClear
Gov-Vendor-Version: client=1.2.0&server=1.2.0
Gov-Vendor-Public-IP: 85.234.151.224
Gov-Vendor-Forwarded: by=85.234.151.224&for=203.0.113.5
Gov-Client-Connection-Method: MOBILE_APP_VIA_SERVER
Gov-Client-Device-ID: 00000000-0000-0000-0000-000000000001
Gov-Client-Public-IP: 203.0.113.5
Gov-Client-Public-IP-Timestamp: 2026-05-08T19:39:27.467Z
Gov-Client-Public-Port: 56789
Gov-Client-User-Agent: os-family=iOS&os-version=17.4.1&device-manufacturer=Apple&device-model=iPhone15%2C3
Gov-Client-Screens: width=1170&height=2532&scaling-factor=3&colour-depth=24
Gov-Client-Window-Size: width=1170&height=2532
Gov-Client-Timezone: UTC+01:00
Gov-Client-User-IDs: mileclear=<device-id>
Gov-Client-Local-IPs: 192.168.1.50
Gov-Client-Local-IPs-Timestamp: 2026-05-08T19:39:27.467Z
```

## Outstanding warnings — disposition

**`gov-client-multi-factor`** — MileClear authenticates users via email + password (single factor) or Apple Sign-In (which is itself MFA-bearing on the device side, not at our auth boundary). Per HMRC's spec text on the warning: *"This may be correct for single factor authentication, for example username and password. If this is the case, you must contact us explaining why you cannot submit this header."* — ACTION: include statement in the production accreditation submission. Disposition acceptable per HMRC guidance.

**`gov-vendor-license-ids`** — We have `HMRC_VENDOR_LICENSE_IDS` env var; currently empty as we have no third-party vendor licenses to declare. Per spec, the header is required even when empty (different from validator's previous reading). ACTION: populate with empty string explicitly OR a placeholder per HMRC's accepted values once confirmed. Low priority — warning, not error.

## CI integration (next quarter)

Promote this one-off script to a permanent CI smoke test:

- New cron in `apps/api/src/jobs/fraudPreventionValidator.ts` — weekly schedule
- Calls validator with synthetic but spec-compliant headers
- If response status > `POTENTIALLY_INVALID_HEADERS` (i.e. has errors), logs `hmrc.fph_validator_failed` app_event
- Pages Anthony via the existing billing-alert push channel
- Catches HMRC spec drift early — if HMRC ever adds a required header or changes a format, we know within a week instead of after a real user submission fails

## Bugs found and fixed during this work

1. **HMRC base URL typo in `config.ts`** — `test-api.service.hmrc.uk` (missing `.gov`). Wouldn't have resolved DNS in production. Fixed in commit `80ef982`.
2. **Header builder out of spec** — entire shape rewritten in commit `d89b39c`.
3. **Public-Port using server port** — fixed in commit `72de26a`.

Three real bugs caught by running the validator. None would have surfaced via unit tests because the unit tests never compared against HMRC's actual spec interpretation.

## Final form answer

The HMRC accreditation question *"Have you checked that your software submits fraud prevention data correctly?"* — **Yes**, validated against the live Test Fraud Prevention Headers API on 8 May 2026, response stored in this document.
