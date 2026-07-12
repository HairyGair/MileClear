// QuickBooks Online integration routes.
//
//   GET  /quickbooks/connect     auth'd — returns OAuth URL + signed state
//   GET  /quickbooks/callback    public — Intuit redirects here with ?code+state+realmId
//   GET  /quickbooks/status      auth'd — connection state for the mobile/web UI
//   POST /quickbooks/disconnect  auth'd — revoke + clear connection
//
// State token is a short-lived JWT signed with JWT_SECRET, mirrors
// the Discord OAuth flow. Carries the MileClear user ID across the
// OAuth roundtrip so the callback re-identifies the user.
//
// Premium-gated at the connect-step level — non-Pro users see a 402
// redirect to the paywall, never enter the OAuth flow. The connect
// route is the right place for this gate (rather than the callback)
// because we want to fail FAST, before sending the user to Intuit.
//
// Phase A of the QuickBooks roadmap (21 May 2026).

import type { FastifyInstance } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/encryption.js";
import { logEvent } from "../../services/appEvents.js";
import {
  getQboConfig,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  revokeRefreshToken,
  upsertConnection,
  fetchCompanyName,
} from "../../services/quickbooks.js";
import {
  pushTaxYear,
  previewTaxYear,
  listQboAccounts,
  setAccountMapping,
} from "../../services/quickbooksSync.js";

const STATE_TTL_SECONDS = 600; // 10 minutes
const stateSecret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-only-secret");

interface StatePayload {
  uid: string;
  iat: number;
  exp: number;
}

async function signState(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + STATE_TTL_SECONDS)
    .sign(stateSecret());
}

async function verifyState(token: string): Promise<StatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, stateSecret());
    if (!payload.uid || typeof payload.uid !== "string") return null;
    return payload as unknown as StatePayload;
  } catch {
    return null;
  }
}

/** Mobile deep link the callback redirects to. Mirrors the
 *  `mileclear://discord-linked` pattern used by the Discord OAuth. */
const MOBILE_DEEP_LINK = "mileclear://quickbooks-linked";

export async function quickbooksRoutes(app: FastifyInstance) {
  // ── GET /quickbooks/connect ─────────────────────────────────────
  // Auth-required, premium-gated. Returns the URL the mobile client
  // should open in an in-app browser via WebBrowser.openAuthSessionAsync.
  app.get(
    "/connect",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const config = getQboConfig();
      if (!config) {
        return reply.status(503).send({
          error: "QuickBooks integration is not configured on this server.",
        });
      }
      const state = await signState(request.userId!);
      const url = buildAuthorizeUrl({ config, state });
      return reply.send({ data: { url } });
    }
  );

  // ── GET /quickbooks/callback ───────────────────────────────────
  // Intuit redirects here with ?code+state+realmId. Public route —
  // Intuit can't carry MileClear auth; the signed `state` token is
  // what binds the redirect to the user that initiated the connect.
  app.get("/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        realmId: z.string().min(1).optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=bad_request`);
    }
    const { code, state, realmId, error } = query.data;

    if (error || !code || !state || !realmId) {
      const reason = error ? `denied_${error}` : "missing_params";
      return reply.redirect(
        `${MOBILE_DEEP_LINK}?ok=false&reason=${encodeURIComponent(reason)}`
      );
    }

    const statePayload = await verifyState(state);
    if (!statePayload) {
      return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=bad_state`);
    }

    const config = getQboConfig();
    if (!config) {
      return reply.redirect(
        `${MOBILE_DEEP_LINK}?ok=false&reason=not_configured`
      );
    }

    try {
      const tokens = await exchangeCodeForTokens({ config, code });
      const connection = await upsertConnection({
        userId: statePayload.uid,
        realmId,
        tokens,
        environment: config.environment,
      });
      // Best-effort: fetch company name + cache on the connection.
      const companyName = await fetchCompanyName(connection);
      if (companyName) {
        await prisma.quickBooksConnection.update({
          where: { id: connection.id },
          data: { companyName },
        });
      }
      logEvent("quickbooks.linked", statePayload.uid, {
        realmId,
        companyName,
        environment: config.environment,
      });
      return reply.redirect(
        `${MOBILE_DEEP_LINK}?ok=true&company=${encodeURIComponent(
          companyName ?? ""
        )}`
      );
    } catch (err) {
      app.log.error({ err }, "QuickBooks OAuth callback failed");
      return reply.redirect(
        `${MOBILE_DEEP_LINK}?ok=false&reason=exchange_failed`
      );
    }
  });

  // ── GET /quickbooks/status ─────────────────────────────────────
  // Auth-required. Tells the client whether the user has a linked
  // QBO company and surfaces the company name + last-synced time
  // so the UI can render "Connected to Acme Ltd · last synced 3h ago".
  app.get(
    "/status",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { userId: request.userId! },
        select: {
          realmId: true,
          companyName: true,
          environment: true,
          lastSyncedAt: true,
          status: true,
          createdAt: true,
        },
      });
      return reply.send({
        data: {
          linked: !!connection && connection.status === "active",
          realmId: connection?.realmId ?? null,
          companyName: connection?.companyName ?? null,
          environment: connection?.environment ?? null,
          lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
          connectedAt: connection?.createdAt?.toISOString() ?? null,
        },
      });
    }
  );

  // ── POST /quickbooks/disconnect ────────────────────────────────
  // Auth-required. Revokes the refresh token on Intuit's side
  // (best-effort) and clears our connection row. Synced-trip and
  // synced-earning rows cascade via FK.
  app.post(
    "/disconnect",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { userId: request.userId! },
      });
      if (!connection) {
        return reply.send({ data: { disconnected: false, already: true } });
      }

      // Best-effort revoke — don't let a network blip on Intuit's
      // side block us from clearing our local state.
      const config = getQboConfig();
      if (config) {
        try {
          const refreshToken = decrypt(connection.refreshTokenEncrypted);
          await revokeRefreshToken({ config, refreshToken });
        } catch {
          // swallow — we still wipe locally
        }
      }

      await prisma.quickBooksConnection.delete({
        where: { id: connection.id },
      });
      logEvent("quickbooks.disconnected", request.userId!, {
        realmId: connection.realmId,
      });
      return reply.send({ data: { disconnected: true } });
    }
  );

  // ── GET /quickbooks/accounts ───────────────────────────────────
  // Active QBO accounts, split into expense-line candidates and
  // pay-from (Bank/Cash) candidates, plus the user's current mapping.
  app.get(
    "/accounts",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { userId: request.userId! },
      });
      if (!connection || connection.status !== "active") {
        return reply.status(409).send({ error: "QuickBooks is not connected." });
      }
      try {
        const accounts = await listQboAccounts(connection);
        return reply.send({
          data: {
            ...accounts,
            expenseAccountId: connection.expenseAccountId,
            payFromAccountId: connection.payFromAccountId,
          },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, "QBO account list failed");
        return reply.status(502).send({ error: reason });
      }
    }
  );

  // ── POST /quickbooks/account-mapping ───────────────────────────
  // Persist which QBO expense + pay-from accounts sync posts into.
  app.post(
    "/account-mapping",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = z
        .object({
          expenseAccountId: z.string().min(1).max(64),
          payFromAccountId: z.string().min(1).max(64),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid account mapping" });
      }
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { userId: request.userId! },
      });
      if (!connection || connection.status !== "active") {
        return reply.status(409).send({ error: "QuickBooks is not connected." });
      }
      await setAccountMapping({ userId: request.userId!, ...parsed.data });
      return reply.send({ data: { ok: true } });
    }
  );

  const taxYearSchema = z.object({ taxYear: z.string().regex(/^\d{4}-\d{2}$/) });

  // ── POST /quickbooks/sync ──────────────────────────────────────
  // Push a tax year's AMAP mileage claim (aggregated per vehicle-type
  // month, tier-correct) + alongside-allowable expenses to QBO as
  // Purchase transactions. Idempotent + create-only.
  // Body: { taxYear: "2025-26" }
  app.post(
    "/sync",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = taxYearSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid tax year (expected e.g. 2025-26)" });
      }
      try {
        const result = await pushTaxYear({
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
        });
        return reply.send({ data: result });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, "QBO sync failed");
        return reply
          .status(reason.includes("not connected") ? 409 : 500)
          .send({ error: reason });
      }
    }
  );

  // ── GET /quickbooks/sync/preview?taxYear= ──────────────────────
  // Counts for the pre-sync UI, no QBO write.
  app.get(
    "/sync/preview",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = taxYearSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid tax year" });
      }
      try {
        const preview = await previewTaxYear({
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
        });
        return reply.send({ data: preview });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return reply
          .status(reason.includes("not connected") ? 409 : 500)
          .send({ error: reason });
      }
    }
  );
}
