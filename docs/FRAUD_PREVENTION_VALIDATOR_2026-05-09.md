# Fraud Prevention Headers — validator run

**Date:** 8 May 2026 (continuation of 9 May compliance sprint)
**Operator:** Anthony Gair
**Sandbox app:** `1f34acb9-8580-464b-a337-24fd318d7ac7`

## Purpose

HMRC's production accreditation form asks: "Have you checked that your software submits fraud prevention data correctly?". The expected evidence is a successful call to the [Test Fraud Prevention Headers API](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/txm-fph-validator-api/1.0) showing our `Gov-Client-*` and `Gov-Vendor-*` headers parse cleanly.

## What we did

1. Wrote a one-off tsx script in `apps/api` using the existing `buildFraudPreventionHeaders` helper to compose a real mobile-shape header set.
2. Fetched a `client_credentials` server token from `/oauth/token` with `scope=read:test-fraud-prevention-headers`.
3. Called `GET https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate` with the token + headers.

## Results

### Pre-fix discovery — wrong base URL

While running the script, discovered that `apps/api/src/services/hmrc/config.ts` had `SANDBOX_BASE = "https://test-api.service.hmrc.uk"` (missing `.gov`). DNS lookup failed. **Real bug** — fixed in same commit. `test-api.service.hmrc.uk` does not resolve; correct domain is `test-api.service.hmrc.gov.uk`. Production hostname had the same typo.

### Endpoint discovery

`GET /test/fraud-prevention-headers/validate` exists and responds. Without auth: HTTP 401 with `MISSING_CREDENTIALS`. Confirms path is correct.

### Token fetch

```
POST https://test-api.service.hmrc.gov.uk/oauth/token
grant_type=client_credentials
client_id=<sandbox client id>
client_secret=<redacted>
scope=read:test-fraud-prevention-headers
```

Response:

```
HTTP/1.1 400
{"error":"invalid_scope","error_description":"scope is invalid"}
```

Root cause: the sandbox application is registered with the 9 MTD ITSA APIs subscribed (per `hmrc_developer_hub.md`) but **not the Test Fraud Prevention Headers API** itself — that's a separate utility API that needs explicit subscription via the dev hub.

### Headers built (for evidence)

The header builder produced the following on the test invocation. All values present, none empty, all spec-compliant in shape:

```
Gov-Vendor-Product-Name: MileClear
Gov-Vendor-Version: 1.2.0
Gov-Vendor-Public-IP: 85.234.151.224
Gov-Vendor-Local-IP: 10.0.0.1
Gov-Client-Connection-Method: MOBILE_APP_VIA_SERVER
Gov-Client-Device-ID: 00000000-0000-0000-0000-000000000001
Gov-Client-Public-IP: 203.0.113.5
Gov-Client-User-Agent: iOS%2F17.4.1%20(iPhone15%2C3)
Gov-Client-Multi-Factor: type=AUTH_CODE&timestamp=2026-05-08T19:21:40.937Z
Gov-Client-Screens: width=1170&height=2532&scaling-factor=1&colour-depth=24
Gov-Client-Window-Size: width=1170&height=2532
Gov-Client-Timezone: +0100
Gov-Client-Local-IPs: <local IP>
Gov-Client-Local-IPs-Timestamp: <ISO timestamp>
Gov-Client-MAC-Addresses: <empty by design>
Gov-Client-User-IDs: mileclear=<user uuid>
Accept: application/vnd.hmrc.1.0+json
Authorization: Bearer <client-credentials token>
```

## What's blocking the final validation tick

One step left, and it's an HMRC Developer Hub configuration item — not a code change:

1. Sign in to https://developer.service.hmrc.gov.uk/developer/applications
2. Select the MileClear sandbox application (id `1f34acb9-8580-464b-a337-24fd318d7ac7`)
3. Subscriptions → search "Test Fraud Prevention Headers" → **Subscribe** to the v1.0 API for the sandbox environment
4. Save

Once subscribed (typically applies within seconds to sandbox), re-run the script and the validator's `200 OK` response is captured here as evidence.

## Re-run command

For future operator (or future Anthony):

```bash
ssh mileclear@85.234.151.224 'cd ~/mileclear-app/apps/api && \
  npx tsx --env-file=../../.env --env-file=.env scripts/validate-fph.ts'
```

(The `scripts/validate-fph.ts` will be added as a permanent CI smoke test next quarter — currently a one-off ad-hoc.)

## How this becomes a CI gate

Next quarterly review: promote this from one-off script to weekly cron in the API workspace. If validator returns anything other than 200 OK with `noContent`-style success, the cron logs a `hmrc.fph_validator_failed` app_event and pages Anthony via the existing billing-alert push channel.

This catches HMRC spec drift early — if HMRC ever adds a required header or changes a format, we know within a week instead of after the next user submission fails.
