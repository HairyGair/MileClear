// Xero integration routes.
//
//   GET  /xero/connect          auth'd + Pro — returns OAuth URL + signed state
//   GET  /xero/callback         public — Xero redirects here with ?code+state
//   GET  /xero/status           auth'd — connection state for the mobile/web UI
//   POST /xero/disconnect       auth'd — revoke + clear connection
//   GET  /xero/accounts         auth'd + Pro — chart of accounts + current mapping
//   POST /xero/account-mapping  auth'd + Pro — persist expense/pay-from choice
//   POST /xero/sync             auth'd + Pro — push a tax year as SPEND transactions
//   GET  /xero/sync/preview     auth'd + Pro — counts, no Xero write
//
// Mirrors the QuickBooks routes exactly: state is a short-lived JWT
// signed with JWT_SECRET carrying the MileClear user ID across the
// OAuth roundtrip; the connect step is premium-gated so non-Pro users
// fail fast before ever reaching Xero. One difference from Intuit:
// Xero's redirect carries no org identifier — the tenant is discovered
// AFTER token exchange via GET /connections (we store the first org).

import type { FastifyInstance } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/encryption.js";
import { logEvent } from "../../services/appEvents.js";
import {
  getXeroConfig,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  listTenants,
  upsertConnection,
  revokeRefreshToken,
} from "../../services/xero.js";
import {
  pushTaxYearToXero,
  previewTaxYearForXero,
  listXeroAccounts,
  setXeroAccountMapping,
} from "../../services/xeroSync.js";

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

/** Mobile deep link the callback redirects to. Mirrors
 *  `mileclear://quickbooks-linked`. */
const MOBILE_DEEP_LINK = "mileclear://xero-linked";

export async function xeroRoutes(app: FastifyInstance) {
  // ── GET /xero/connect ───────────────────────────────────────────
  app.get(
    "/connect",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const config = getXeroConfig();
      if (!config) {
        return reply.status(503).send({
          error: "Xero integration is not configured on this server.",
        });
      }
      const state = await signState(request.userId!);
      const url = buildAuthorizeUrl({ config, state });
      return reply.send({ data: { url } });
    }
  );

  // ── GET /xero/callback ─────────────────────────────────────────
  // Public — Xero can't carry MileClear auth; the signed `state`
  // token binds the redirect to the user that initiated the connect.
  app.get("/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=bad_request`);
    }
    const { code, state, error } = query.data;

    if (error || !code || !state) {
      const reason = error ? `denied_${error}` : "missing_params";
      return reply.redirect(
        `${MOBILE_DEEP_LINK}?ok=false&reason=${encodeURIComponent(reason)}`
      );
    }

    const statePayload = await verifyState(state);
    if (!statePayload) {
      return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=bad_state`);
    }

    const config = getXeroConfig();
    if (!config) {
      return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=not_configured`);
    }

    try {
      const tokens = await exchangeCodeForTokens({ config, code });
      // Xero's redirect has no org identifier — discover the tenant(s)
      // this grant covers and store the first (one org per user, like
      // QuickBooks' one realm).
      const tenants = await listTenants(tokens.access_token);
      const org = tenants.find((t) => t.tenantType === "ORGANISATION") ?? tenants[0];
      if (!org) {
        return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=no_organisation`);
      }
      await upsertConnection({
        userId: statePayload.uid,
        tenantId: org.tenantId,
        tenantName: org.tenantName,
        tokens,
      });
      logEvent("xero.linked", statePayload.uid, {
        tenantId: org.tenantId,
        tenantName: org.tenantName,
      });
      return reply.redirect(
        `${MOBILE_DEEP_LINK}?ok=true&company=${encodeURIComponent(org.tenantName ?? "")}`
      );
    } catch (err) {
      app.log.error({ err }, "Xero OAuth callback failed");
      return reply.redirect(`${MOBILE_DEEP_LINK}?ok=false&reason=exchange_failed`);
    }
  });

  // ── GET /xero/status ───────────────────────────────────────────
  app.get("/status", { preHandler: authMiddleware }, async (request, reply) => {
    const connection = await prisma.xeroConnection.findUnique({
      where: { userId: request.userId! },
      select: {
        tenantId: true,
        tenantName: true,
        lastSyncedAt: true,
        status: true,
        createdAt: true,
      },
    });
    return reply.send({
      data: {
        linked: !!connection && connection.status === "active",
        tenantId: connection?.tenantId ?? null,
        companyName: connection?.tenantName ?? null,
        lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
        connectedAt: connection?.createdAt?.toISOString() ?? null,
      },
    });
  });

  // ── POST /xero/disconnect ──────────────────────────────────────
  app.post("/disconnect", { preHandler: authMiddleware }, async (request, reply) => {
    const connection = await prisma.xeroConnection.findUnique({
      where: { userId: request.userId! },
    });
    if (!connection) {
      return reply.send({ data: { disconnected: false, already: true } });
    }

    // Best-effort revoke — don't let a network blip on Xero's side
    // block us from clearing our local state.
    const config = getXeroConfig();
    if (config) {
      try {
        const refreshToken = decrypt(connection.refreshTokenEncrypted);
        await revokeRefreshToken({ config, refreshToken });
      } catch {
        // swallow — we still wipe locally
      }
    }

    await prisma.xeroConnection.delete({ where: { id: connection.id } });
    logEvent("xero.disconnected", request.userId!, {
      tenantId: connection.tenantId,
    });
    return reply.send({ data: { disconnected: true } });
  });

  // ── GET /xero/accounts ─────────────────────────────────────────
  app.get(
    "/accounts",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const connection = await prisma.xeroConnection.findUnique({
        where: { userId: request.userId! },
      });
      if (!connection || connection.status !== "active") {
        return reply.status(409).send({ error: "Xero is not connected." });
      }
      try {
        const accounts = await listXeroAccounts(connection);
        return reply.send({
          data: {
            ...accounts,
            expenseAccountCode: connection.expenseAccountCode,
            payFromAccountId: connection.payFromAccountId,
          },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, "Xero account list failed");
        return reply.status(502).send({ error: reason });
      }
    }
  );

  // ── POST /xero/account-mapping ─────────────────────────────────
  app.post(
    "/account-mapping",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = z
        .object({
          expenseAccountCode: z.string().min(1).max(20),
          payFromAccountId: z.string().min(1).max(64),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid account mapping" });
      }
      const connection = await prisma.xeroConnection.findUnique({
        where: { userId: request.userId! },
      });
      if (!connection || connection.status !== "active") {
        return reply.status(409).send({ error: "Xero is not connected." });
      }
      await setXeroAccountMapping({ userId: request.userId!, ...parsed.data });
      return reply.send({ data: { ok: true } });
    }
  );

  const taxYearSchema = z.object({ taxYear: z.string().regex(/^\d{4}-\d{2}$/) });

  // ── POST /xero/sync ────────────────────────────────────────────
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
        const result = await pushTaxYearToXero({
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
        });
        return reply.send({ data: result });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, "Xero sync failed");
        return reply
          .status(reason.includes("not connected") ? 409 : 500)
          .send({ error: reason });
      }
    }
  );

  // ── GET /xero/sync/preview?taxYear= ────────────────────────────
  app.get(
    "/sync/preview",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = taxYearSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid tax year" });
      }
      try {
        const preview = await previewTaxYearForXero({
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
