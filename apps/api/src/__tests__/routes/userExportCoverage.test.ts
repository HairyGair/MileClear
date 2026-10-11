import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// GDPR audit H5 (14 Aug 2026): the data export left out ~25 of the models
// that hold a user's data while the app said it was "everything we hold".
// This guard reads the schema and the export handler and fails when a model
// with a userId column is neither exported nor deliberately left out below,
// so the next new table cannot slip past quietly.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const userRoutes = readFileSync(path.join(root, "apps/api/src/routes/user/index.ts"), "utf8");

/** Deliberately not exported, and why. */
const EXCLUDED: Record<string, string> = {
  RefreshToken: "credential (hashed session token)",
  VerificationCode: "credential (one-time code)",
  PasswordResetToken: "credential (one-time code)",
  IdempotencyKey: "24h replay cache of responses already exported elsewhere",
  InvoiceEmail: "exported nested under invoices (include: emails)",
};

function modelsWithUserId(): string[] {
  const out: string[] = [];
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/^\s+userId\s/m.test(m[2])) out.push(m[1]);
  }
  return out;
}

describe("GDPR export covers every user-bearing model", () => {
  const start = userRoutes.indexOf('app.get("/export"');
  const end = userRoutes.indexOf("app.delete(", start);
  const handler = userRoutes.slice(start, end);

  it("finds the handler and the models", () => {
    expect(start).toBeGreaterThan(-1);
    expect(modelsWithUserId().length).toBeGreaterThan(30);
  });

  for (const model of modelsWithUserId()) {
    it(`${model} is exported or deliberately excluded`, () => {
      const accessor = `prisma.${model[0].toLowerCase()}${model.slice(1)}.`;
      expect(handler.includes(accessor) || model in EXCLUDED).toBe(true);
    });
  }

  it("exports the NINO decrypted and the admin notes", () => {
    expect(handler).toMatch(/nino: decryptIfEncrypted\(hmrcConnection\.nino\)/);
    expect(handler).toMatch(/adminNotes:/);
  });

  it("never exports the password hash itself", () => {
    expect(handler).toMatch(/hasPassword: Boolean\(userExtra\?\.passwordHash\)/);
    expect(handler).not.toMatch(/passwordHash: userExtra/);
  });
});
