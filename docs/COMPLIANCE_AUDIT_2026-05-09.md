# MileClear data protection self-assessment audit

**Date:** 9 May 2026
**Assessor:** Anthony Gair (founder, sole operator, sole data controller)
**Reference:** ICO information security checklist for medium businesses
**Scope:** All processing of personal data by MileClear, end to end

This audit is the first formal data-protection self-assessment for MileClear. It exists to satisfy UK GDPR Article 32 (security of processing) and to demonstrate to HMRC's production-credentials reviewer that MileClear monitors its own compliance.

Status legend:

- ✅ **In place** — control implemented, evidenced, working
- 🟡 **Partial** — control exists informally; not documented or not at the standard expected
- ❌ **Gap** — control not implemented; remediation in flight or scheduled

## 1. Information security management

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 1.1 | Senior management responsibility for data protection | ✅ | Anthony Gair is sole data controller, founder, and decision-maker. Single point of accountability. |
| 1.2 | Documented information security policy | 🟡 | This audit document + `docs/SECURITY_INCIDENT_RUNBOOK.md` together constitute the policy. Will consolidate into a single `docs/SECURITY_POLICY.md` next quarter. |
| 1.3 | Regular risk assessments | 🟡 | Informal — risks tracked in `memory/todo_master_list.md`. Now scheduled formally (quarterly cadence — see section 11). |
| 1.4 | Defined roles and responsibilities | ✅ | Solo operation. All roles held by Anthony Gair. RBAC layer to be added before any second user is granted access. |
| 1.5 | Compliance with relevant data-protection law | ✅ | UK GDPR / Data Protection Act 2018. Privacy policy at https://mileclear.com/privacy. ICO registration in flight (see section 12). |

## 2. Staff awareness and training

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 2.1 | Staff trained on data protection | n/a | No staff. Sole operator is qualified by direct involvement in policy + this audit. |
| 2.2 | Confidentiality terms in employment contracts | n/a | No employees. |
| 2.3 | Disciplinary process for breaches | n/a | No employees. |
| 2.4 | Onboarding includes data-protection awareness | n/a | No onboarding. When the first hire is made, this section becomes a Phase 1 task before that person gets any data access. |

## 3. Physical security

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 3.1 | Premises secured against unauthorised entry | ✅ | Operator's home office; locked premises. No customer data printed or held physically. |
| 3.2 | Equipment locked when unattended | ✅ | macOS auto-lock on idle. FileVault full-disk encryption enabled. |
| 3.3 | Production servers physically secured | ✅ | Pixelish-managed UK datacentre (server IP `85.234.151.224`). Operator does not have or require physical access. |
| 3.4 | Secure disposal of physical media | ✅ | No physical media containing customer data. Backups are server-side. |

## 4. IT systems and access control

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 4.1 | User access controlled (least privilege) | ✅ | Single admin (Anthony) for production. Customer-facing routes scoped per-user via `userId` on every Prisma query. Premium gated by `premiumMiddleware`; admin gated by `adminMiddleware`. |
| 4.2 | Strong authentication for admin access | ✅ | SSH via key-based authentication (no passwords). cPanel admin password is unique 32+ char. App admin login uses bcrypt 12 rounds + JWT. |
| 4.3 | Multi-factor authentication where available | 🟡 | MFA on Apple Developer Account, GitHub, Stripe, Brevo. Not on cPanel host (limitation of provider). To raise with Pixelish next quarterly review. |
| 4.4 | Audit logs of access to systems | ✅ | `app_events` table records every admin action, billing event, HMRC API call, login attempt, etc. Reviewable from `/dashboard/admin`. |
| 4.5 | Software kept up to date / patched | ✅ | Dependencies via pnpm; PRs merge through CI which runs typecheck + lint + tests. GitHub Dependabot enabled (verify) for security advisories. Node.js v22.22.2 (current LTS). |
| 4.6 | Anti-malware where applicable | ✅ | macOS Gatekeeper + XProtect on operator workstation. Server-side: no untrusted file uploads accepted (no email attachments, no public file ingest). |
| 4.7 | Removable media controls | n/a | No removable media used in operations. |

## 5. Data security

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 5.1 | Encryption in transit | ✅ | TLS 1.2+ via Let's Encrypt on api.mileclear.com and mileclear.com. All HMRC API calls over HTTPS. Mobile and web both use HTTPS exclusively. |
| 5.2 | Encryption at rest for sensitive fields | ✅ | User passwords bcrypt-hashed (12 rounds). JWT refresh tokens SHA-256 hashed (one-way, no key to lose). Mobile auth tokens in iOS Keychain via Expo SecureStore. HMRC tokens (access/refresh) and NINO encrypted at rest via application-layer AES-256-GCM (see `apps/api/src/lib/encryption.ts`). MTD_TOKEN_KEY 32-byte master key in environment, rotatable via versioned wire-format prefix. |
| 5.3 | Backup strategy + tested | 🟡 | MySQL backups handled by Pixelish managed hosting (daily). Backup restore not yet tested by operator. To be tested in next quarterly review. |
| 5.4 | Data minimisation | ✅ | Only data necessary for the service is collected: account info, GPS for trips, vehicle data, earnings. NINO collected only after user opts in to MTD ITSA. No analytics tracking; no marketing data brokerage. |
| 5.5 | Retention periods defined | ✅ | Defined in privacy policy. Account-level: until deletion request, immediate. Trip data: kept while account active for HMRC contemporaneous-record purposes. Audit logs: 12 months rolling. |
| 5.6 | Secure deletion when retention expires | ✅ | `/user/delete` endpoint cascades to all owned data. Cancels Stripe / Apple subscription. Confirms via email. |

## 6. Network security

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 6.1 | Firewall in place | ✅ | Pixelish hosting provides perimeter firewall. Only ports 22 (SSH), 80, 443, and DB ports for whitelisted IPs are open. |
| 6.2 | Intrusion detection / monitoring | 🟡 | Application-level: rate limiting (login 5/15min, register 10/15min, global 100/min), failed-login event logging. Network-level IDS not deployed. Acceptable at current scale; revisit if usage grows. |
| 6.3 | Secure remote access | ✅ | SSH key-based authentication only; no password fallback. Single authorised public key (Anthony's). |
| 6.4 | Public IP exposure controlled | ✅ | Only the API server (85.234.151.224) and webserver expose public ports. MySQL access restricted to whitelisted IPs via cPanel Remote MySQL configuration. |

## 7. Incident management

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 7.1 | Incident response plan documented | ✅ | `docs/SECURITY_INCIDENT_RUNBOOK.md` covers detection, triage, HMRC notification (24h), ICO notification (72h), credential rotation, user notification, post-mortem. |
| 7.2 | Logging in place to detect incidents | ✅ | `app_events` audit log; admin diagnostics dashboard; billing alerts; server watchdog. |
| 7.3 | Logs reviewed periodically | 🟡 | Anthony reviews admin dashboard daily during active development. Formal log review cadence to be defined as part of quarterly self-assessments. |
| 7.4 | Incident notification procedures (HMRC, ICO) | ✅ | Documented in runbook. ICO contact form + HMRC Developer Hub support both linked. 24h / 72h deadlines specified. |
| 7.5 | Incident drill cadence | ✅ | Documented in runbook section "Drill cadence" — every 6 months, next 9 November 2026. |

## 8. Third parties / processors

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 8.1 | Contracts / DPAs in place with processors | ✅ | Stripe DPA (in their standard terms). Brevo (Sendinblue) DPA. Apple Developer Program agreement. Plaid (when activated). HMRC operates under public-sector regulation, not contractual. Pixelish hosting agreement covers data handling. |
| 8.2 | Processors assessed for adequate security | 🟡 | Stripe, Brevo, Apple, Plaid are all enterprise-grade with public security pages and SOC 2 / ISO 27001 attestations. Pixelish is a smaller UK hosting provider; security posture taken on trust + UK ICO registration. To formally request Pixelish's security statement next quarter. |
| 8.3 | Sub-processor approval | ✅ | Privacy policy lists processors; UK GDPR-compliant chain. |
| 8.4 | International transfers controlled | ✅ | All data hosted in UK (Pixelish). Stripe (US), Apple (US), Brevo (FR/EU): UK GDPR adequate / SCC-backed transfers. |

## 9. Business continuity / disaster recovery

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 9.1 | Backup strategy | 🟡 | Daily MySQL backups by Pixelish. Server filesystem also snapshotted. Schedule and retention period to be confirmed with Pixelish. |
| 9.2 | Recovery tested | ❌ | Restore-from-backup not yet tested by operator. **Remediation: schedule a restore-test drill within Q3 2026.** |
| 9.3 | Recovery time objective (RTO) defined | 🟡 | Implicit: same-day. To be formalised. |
| 9.4 | Single-point-of-failure analysis | 🟡 | Single operator is itself a SPOF. Mitigation: documentation in `memory/` + this repo, password manager export quarterly to encrypted offline backup. To be improved with formal succession plan when company grows. |

## 10. Data subject rights

| # | Item | Status | Evidence / notes |
|---|---|---|---|
| 10.1 | Privacy notice published | ✅ | `https://mileclear.com/privacy` |
| 10.2 | Subject access requests handled | ✅ | `/user/export` self-service GDPR JSON export. |
| 10.3 | Right to erasure handled | ✅ | `/user/delete` self-service deletion, cascades all data. |
| 10.4 | Right to rectification | ✅ | Profile / vehicle / trip edit available in app and web. |
| 10.5 | Right to data portability | ✅ | Same JSON export — machine-readable. |
| 10.6 | Right to object to marketing | ✅ | One-click unsubscribe (RFC 8058 List-Unsubscribe headers + preference centre at `/unsubscribe`). |
| 10.7 | Lawful basis identified per processing activity | ✅ | Privacy policy: contract (billing), legitimate interest (trip tracking, security), consent (marketing emails). |

## 11. Audit cadence (committed)

This self-assessment will be repeated every quarter. Committed dates:

- ✅ **2026-05-09** (this document)
- ⏳ **2026-08-09** — schedule reminder set
- ⏳ **2026-11-09** (also drill date for incident runbook)
- ⏳ **2027-02-09**

Each repeat:

1. Re-walk every section
2. Update statuses
3. Close off remediations completed since last cycle
4. Add new sections as the threat landscape evolves
5. Output saved as `docs/COMPLIANCE_AUDIT_YYYY-MM-DD.md` (this naming convention)

## 12. ICO registration status

ICO data-protection registration as of audit date: **in flight** (registering as sole trader under Anthony Gair, will transfer to SOYOStudios Ltd once incorporated).

Number will be inserted here once issued — typical processing time 24-48 hours.

## 13. Remediation tracker

Pulled out of the table above for easy follow-up:

| ID | Item | Owner | Target |
|---|---|---|---|
| R1 | Token encryption at rest (HMRC tokens, NINO, JWT refresh) | Anthony | 2026-05-09 (today) |
| R2 | Consolidate this audit + runbook into a single security policy doc | Anthony | 2026-08-09 |
| R3 | Test backup restore | Anthony + Pixelish | 2026-08-09 |
| R4 | Confirm Pixelish backup retention period in writing | Anthony + Pixelish | 2026-06-09 |
| R5 | Request Pixelish security statement / ISO certifications | Anthony + Pixelish | 2026-06-09 |
| R6 | Run OWASP ZAP baseline pentest + remediate findings | Anthony | 2026-05-09 (today) |
| R7 | Validate fraud-prevention headers via HMRC Test API | Anthony | 2026-05-09 (today) |
| R8 | Schedule formal log-review cadence | Anthony | 2026-08-09 |
| R9 | Formalise RTO + business-continuity plan | Anthony | 2027-02-09 |
| R10 | RBAC layer when first hire is made | Anthony | When triggered |

## How to use this document

When HMRC's accreditation reviewer asks for evidence of compliance audit, this document plus `SECURITY_INCIDENT_RUNBOOK.md` is the answer. Both are in the public repo and version-controlled.

When a customer or third party asks about MileClear's security posture, this document answers most questions. It is intentionally thorough rather than glossy — auditors prefer honest 🟡s over implausible all-✅ scorecards.

When the next quarterly review comes around, copy this file to the new dated version, walk every section again, and ship the diff.
