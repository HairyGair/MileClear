# Security incident response runbook

**Owner:** Anthony Gair (founder, sole operator)
**Last reviewed:** 9 May 2026
**Review cadence:** Quarterly (next: 9 August 2026)

This runbook describes the steps MileClear follows when a security incident is detected. It exists so the response is consistent under pressure, regulatory deadlines are met, and post-incident learning is captured.

For the avoidance of doubt, MileClear is operated by a single person. "On-call" means whoever is awake. The contact methods below all reach Anthony.

## What counts as a security incident

Any of the following:

- Unauthorised access (or suspected access) to customer personal data, payment data, or HMRC OAuth tokens
- Suspected breach of the production server (SSH, MySQL, environment files)
- Compromise of an admin credential (Apple Developer Account, App Store Connect, Stripe, Brevo, HMRC Developer Hub)
- A vulnerability disclosure from a security researcher
- An automated scan flagging a High or Critical CVE in a runtime dependency
- Customer report of unauthorised activity on their account
- Apple, HMRC, or another integrated party notifying us of compromised credentials

If you're unsure whether something is an incident, **treat it as one and triage**. Over-reacting is cheaper than under-reacting.

## Step 1 — Detect (T+0)

Detection sources:

| Source | What to watch for |
|---|---|
| `support@mileclear.com` | Customer reports, security researcher disclosures |
| `gair@mileclear.com` | Founder direct address — researchers sometimes use this |
| Admin diagnostics dashboard at `/dashboard/admin` | Diagnostic alerts, billing alerts, watchdog events |
| GitHub Dependabot / security alerts | Dependency CVEs |
| Apple App Store Connect | Apple Security Bulletin notifications |
| HMRC Developer Hub | HMRC notifications |
| Stripe / Brevo / Plaid dashboards | Vendor-side compromise notices |

Acknowledge receipt to the reporter within 4 hours, even if no answer is yet available. Use the template:

> *Thanks for reporting this. I've seen it and I'm investigating. I'll send you a substantive update by [date+time]. — Anthony*

## Step 2 — Triage (T+0 to T+4 hours)

Answer these questions in order. Stop at the first "yes" to scope the response:

1. **Is the incident in progress?** (e.g. attacker still active in the system)
   → If yes: rotate credentials immediately (see Step 5), then continue triage
2. **Is personal data affected?** (any user account data, GPS coordinates, vehicle data, earnings, NINO, payment info)
   → If yes: HMRC + ICO clocks both started — see Steps 3 + 4
3. **Are HMRC OAuth tokens compromised?**
   → If yes: revoke all HmrcConnection rows for affected users, force re-OAuth, notify HMRC
4. **Are payment credentials compromised?** (Stripe customer IDs, Apple IAP transaction IDs)
   → If yes: notify Stripe / Apple immediately via their respective dashboards
5. **Is any third-party processor's data affected?** (Brevo, Plaid)
   → If yes: notify the processor under their DPA terms

Document the incident in `docs/incidents/YYYY-MM-DD-short-description.md` from the very start. Even if the issue turns out to be nothing, the file is your evidence trail for HMRC accreditation reviews and ICO audits.

## Step 3 — HMRC notification (within 24 hours if MTD data affected)

If HMRC OAuth tokens, NINO, or any data submitted to HMRC's MTD APIs is affected:

1. Log a ticket via [HMRC Developer Hub support](https://developer.service.hmrc.gov.uk/developer/support) within 24 hours of becoming aware
2. Provide:
   - Application ID: `1f34acb9-8580-464b-a337-24fd318d7ac7`
   - Breach contact: Anthony Gair, [phone number on file with HMRC]
   - Incident description, scope, timeline, affected user count
   - Containment actions taken
3. Follow up via email if no acknowledgement within 24 hours

## Step 4 — ICO notification (within 72 hours if UK personal data affected)

UK GDPR Article 33 requires reporting personal data breaches to the ICO within 72 hours of becoming aware, unless the breach is unlikely to result in risk to the rights and freedoms of individuals.

1. Use the ICO online breach reporting form: https://ico.org.uk/for-organisations/report-a-breach/
2. ICO registration number: [insert once registered — see ICO_REGISTRATION_PENDING.md]
3. Provide:
   - Nature of the breach (categories + approximate numbers)
   - Likely consequences
   - Containment + mitigation already in place
   - Whether affected individuals have been notified
4. If the breach was minor and no notification is required, document the rationale in the incident file anyway

## Step 5 — Rotate credentials

For any compromise touching production secrets, rotate the affected credentials before any further investigation. The order matters:

1. **JWT signing secrets** (`JWT_SECRET`, `JWT_REFRESH_SECRET`) — generate fresh 32-byte values, push to PM2 env, restart `mileclear-api`. All users will be force-logged-out on next request.
2. **MTD token encryption key** (`MTD_TOKEN_KEY`) — only if encryption is suspected compromised. Run the re-encrypt-all-rows script.
3. **HMRC OAuth client secret** — rotate via HMRC Developer Hub Authorisation Details; update env; deploy.
4. **Apple IAP signing key** — rotate via App Store Connect; update env.
5. **Stripe API keys** — rotate via Stripe dashboard; update env.
6. **Brevo SMTP key** — rotate via Brevo dashboard; update env.
7. **Plaid client secret** — rotate via Plaid dashboard; update env (currently disabled in prod, lower priority).
8. **Database password** (`mileclear_database` MySQL user) — rotate via cPanel; update env.
9. **SSH keys** — rotate Anthony's authorised public key on the server.
10. **GitHub PATs / deploy keys** — rotate any used for production access.

## Step 6 — Notify affected users

Within 72 hours of the breach being confirmed, send a notification email to every affected user. Use plain language. Include:

- What happened (without exposing exploitation details that aid future attackers)
- What data was affected
- What you've done about it
- What they need to do (if anything — usually rotate password, re-OAuth HMRC, etc.)
- Direct contact for questions: support@mileclear.com

In-app banner via `/admin` push notifications + email both go out together. Use the existing admin push tab with a "Security notice" audience filter.

If the affected set is more than 10% of the user base, also publish a public statement at `mileclear.com/updates` so non-affected users see we handled it transparently.

## Step 7 — Post-mortem (within 7 days)

Append to the incident file:

- **Timeline** — when did each step happen
- **Root cause** — not "what failed", but "why was it possible"
- **What we learned** — what's true now that wasn't before
- **What we changed** — code, process, monitoring, documentation
- **What we'd do differently** — if it happened again

The post-mortem stays in the repo as part of `docs/incidents/`. It is **not** secret. Future Anthony (or future hires) will need it.

## Drill cadence

The runbook is rehearsed with a synthetic incident scenario every 6 months:

- **Next drill:** 9 November 2026
- **Drill output:** a fake `docs/incidents/YYYY-MM-DD-DRILL.md` walking through every step
- **Goal:** confirm steps still work + every external contact method is current

## External contacts (for reference)

| Party | Contact |
|---|---|
| HMRC Developer Hub | https://developer.service.hmrc.gov.uk/developer/support |
| ICO | https://ico.org.uk/for-organisations/report-a-breach/ |
| Apple Developer | https://developer.apple.com/contact/ |
| Stripe | https://support.stripe.com/ |
| Brevo | https://www.brevo.com/contact/ |
| Pixelish (hosting) | James (per memory: shared MySQL on managed server) |

## How this document is kept current

- Reviewed quarterly alongside `docs/COMPLIANCE_AUDIT_YYYY-MM-DD.md`
- Updated immediately after any real incident
- Version controlled in git — every change is a commit with rationale
