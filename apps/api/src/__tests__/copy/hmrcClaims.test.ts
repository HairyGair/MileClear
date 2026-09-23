/**
 * Copy guard: no HMRC endorsement claims in product copy.
 *
 * HMRC (support ref 2026-NIP751, 23 Sep 2026) told us we may not call
 * MileClear "HMRC-ready", and must not claim or imply the software is HMRC
 * recognised, approved, accredited, certified or similar until production
 * credentials are granted and we are listed on HMRC's software choices page.
 * A 10 Sep sweep missed an "HMRC COMPLIANT" stamp on the Pro PDF, so this
 * test scans the user-facing source on every `pnpm test` (pre-push + CI).
 *
 * Still allowed (HMRC's own terms and rules): "HMRC rates", "HMRC Approved
 * Mileage Allowance" (AMAP), "HMRC accepts digital copies of records",
 * "HMRC may request inspection", "HMRC Deduction" as a column label,
 * "Sign in with HMRC", MTD beta/sandbox wording.
 *
 * If this fails: reword the copy. Only add to ALLOWLIST when the match is
 * genuinely not about HMRC endorsing MileClear, and say why.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

/** Directories scanned recursively (source files only). */
const SCAN_DIRS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/lib/help",
  "packages/shared/src/data",
];

/** Individual files scanned. `email*.ts` is expanded below. */
const SCAN_FILES = [
  "apps/api/src/services/export.ts",
  "docs/app-store-listing.md",
  "docs/play-console-submission.md",
];
const API_SERVICES_DIR = "apps/api/src/services";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|md|mdx|json|css|html)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".expo"]);

/** Banned patterns, case-insensitive. */
const BANNED: RegExp[] = [
  /HMRC[- ]?ready/i,
  /HMRC[- ]?compliant/i,
  /HMRC[- ]?accepted/i,
  /HMRC[- ]?(recognised|recognized|certified|accredited|endorsed|approved (app|software|export|report|log|format))/i,
  /accredit\w*/i,
  /inspectors? recognise/i,
  /recogni[sz]ed by HMRC/i,
  /HMRC attestation/i,
  /direct to HMRC/i,
  /sent to HMRC\./i,
  /HMRC Self-Assessment/i,
  /in a format HMRC accepts/i,
  /ready for HMRC/i,
];

/**
 * Legitimate matches. Keyed by repo-relative file plus a substring that must
 * appear on the matched line (not a line number, so edits elsewhere in the
 * file don't break it). Keep each entry commented.
 */
const ALLOWLIST: { file: string; lineContains: string; reason: string }[] = [
  {
    // TrueLayer beta banner: "accreditation" refers to TrueLayer's banking
    // partners granting production access, not to HMRC.
    file: "apps/mobile/app/open-banking.tsx",
    lineContains: "Real bank imports go live with our next round of accreditation",
    reason: "bank-partner accreditation, not HMRC",
  },
];

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name)) out.push(full);
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(REPO_ROOT, d), files);
  for (const f of SCAN_FILES) {
    const full = path.join(REPO_ROOT, f);
    if (existsSync(full)) files.push(full);
  }
  const services = path.join(REPO_ROOT, API_SERVICES_DIR);
  for (const name of readdirSync(services)) {
    if (/^email.*\.ts$/.test(name)) files.push(path.join(services, name));
  }
  return files;
}

interface Hit {
  file: string;
  line: number;
  match: string;
}

function findHmrcClaims(): Hit[] {
  const hits: Hit[] = [];
  for (const full of collectFiles()) {
    const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((text, i) => {
      for (const re of BANNED) {
        const m = text.match(re);
        if (!m) continue;
        const allowed = ALLOWLIST.some(
          (a) => a.file === rel && text.includes(a.lineContains)
        );
        if (!allowed) hits.push({ file: rel, line: i + 1, match: m[0] });
      }
    });
  }
  return hits;
}

describe("HMRC endorsement copy guard (HMRC ref 2026-NIP751)", () => {
  it("scans a non-trivial number of files", () => {
    // Guards against a path typo silently scanning nothing.
    expect(collectFiles().length).toBeGreaterThan(100);
  });

  it("every allowlist entry still matches a line (no stale entries)", () => {
    for (const a of ALLOWLIST) {
      const full = path.join(REPO_ROOT, a.file);
      expect(existsSync(full), `${a.file} missing`).toBe(true);
      expect(readFileSync(full, "utf8").includes(a.lineContains), `stale allowlist: ${a.file}`).toBe(true);
    }
  });

  it("product copy makes no HMRC recognised/approved/ready claims", () => {
    const hits = findHmrcClaims();
    if (hits.length > 0) {
      const report = hits
        .map((h) => `  ${h.file}:${h.line}  "${h.match}"`)
        .join("\n");
      throw new Error(
        `HMRC endorsement claim found in product copy. HMRC (ref 2026-NIP751) ` +
          `forbids claiming or implying MileClear is HMRC ready/recognised/approved/` +
          `accredited/compliant until we are on HMRC's software choices page:\n${report}`
      );
    }
  });
});
