// HMRC MTD ITSA routes — Phase 1 (OAuth + status).
//
// /hmrc/authorize  — start the OAuth handshake (auth-required). Generates
//                    a state token, persists it on a draft HmrcConnection
//                    row, redirects to HMRC's authorize URL.
// /hmrc/callback   — HMRC redirects here with code+state. We verify the
//                    state, exchange code for tokens, persist on the row.
// /hmrc/disconnect — clear the user's HmrcConnection (auth-required).
// /hmrc/status     — return whether the user is connected + scopes +
//                    expiry (auth-required).

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { encrypt, decryptIfEncrypted } from "../../lib/encryption.js";
import {
  getHmrcConfig,
  generateStateToken,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  expiryFromExpiresIn,
  HMRC_SCOPES,
  fetchObligations,
  buildClientContext,
  buildServerContext,
  HmrcNotConnectedError,
  HmrcReauthRequiredError,
  HmrcError,
  listBusinesses,
  retrieveBusiness,
  listPeriodSummaries,
  retrievePeriodSummary,
  submitPeriodSummary,
  amendPeriodSummary,
  buildPeriodSubmission,
  triggerCalculation,
  listCalculations,
  retrieveCalculation,
  isValidCalculationType,
  triggerBsas,
  listBsas,
  retrieveSelfEmploymentBsas,
  isValidBsasBusinessType,
  isValidHmrcTaxYear,
  type CalculationType,
  type BsasBusinessType,
} from "../../services/hmrc/index.js";
import { logEvent } from "../../services/appEvents.js";

// UK NINO regex. AA prefixes excluded (BG, GB, KN, NK, NT, TN, ZZ are also
// reserved/invalid but the standard regex catches the common errors).
const NINO_REGEX = /^[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}\d{6}[A-D ]?$/i;

function normaliseNino(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export async function hmrcRoutes(app: FastifyInstance) {
  // GET /hmrc/status — connection state for the current user.
  // Returns the four setup flags (connected / hasNino / hasBusinessId /
  // businessId) so the mobile entry screen can render its setup-state
  // machine off a single round-trip instead of probing several endpoints.
  // The actual NINO is never returned — only its presence.
  app.get("/status", { preHandler: authMiddleware }, async (request, reply) => {
    const config = getHmrcConfig();
    if (!config) {
      return reply.status(503).send({ error: "HMRC integration not configured" });
    }

    const connection = await prisma.hmrcConnection.findUnique({
      where: { userId: request.userId! },
      select: {
        environment: true,
        scope: true,
        expiresAt: true,
        connectedAt: true,
        disconnectedAt: true,
        nino: true,
        businessId: true,
      },
    });

    if (!connection || connection.disconnectedAt) {
      return reply.send({
        data: {
          connected: false,
          environment: config.environment,
          hasNino: false,
          hasBusinessId: false,
        },
      });
    }

    return reply.send({
      data: {
        connected: true,
        environment: connection.environment,
        scopes: connection.scope.split(" "),
        expiresAt: connection.expiresAt.toISOString(),
        connectedAt: connection.connectedAt.toISOString(),
        hasNino: Boolean(connection.nino),
        hasBusinessId: Boolean(connection.businessId),
        businessId: connection.businessId ?? null,
      },
    });
  });

  // GET /hmrc/authorize — kicks off the OAuth handshake
  app.get("/authorize", { preHandler: authMiddleware }, async (request, reply) => {
    const config = getHmrcConfig();
    if (!config) {
      return reply.status(503).send({ error: "HMRC integration not configured" });
    }

    const state = generateStateToken();

    // Upsert a draft HmrcConnection row holding the state token. If the
    // user is already connected, we replace the existing row's state but
    // leave the active tokens in place until the new ones land.
    await prisma.hmrcConnection.upsert({
      where: { userId: request.userId! },
      update: { lastStateToken: state },
      create: {
        userId: request.userId!,
        accessToken: "",
        refreshToken: "",
        scope: "",
        environment: config.environment,
        expiresAt: new Date(0),
        lastStateToken: state,
      },
    });

    const url = buildAuthorizationUrl({ config, state });

    logEvent("hmrc.authorize_started", request.userId!, {
      environment: config.environment,
    });

    // Return the URL as JSON so the mobile client can open it in an
    // in-app browser. A 302 redirect doesn't work here because the
    // browser session has no Authorization header, so the redirect
    // origin must be requested via an authenticated API call first.
    return reply.send({ data: { url } });
  });

  // GET /hmrc/callback — HMRC redirects here after consent
  app.get<{
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>(
    "/callback",
    async (request, reply) => {
      const config = getHmrcConfig();
      if (!config) {
        return reply.status(503).send({ error: "HMRC integration not configured" });
      }

      const { code, state, error, error_description } = request.query;

      if (error) {
        logEvent("hmrc.authorize_denied", null, { error, error_description });
        return reply
          .status(400)
          .type("text/html")
          .send(
            `<!DOCTYPE html><html><body style="font-family:system-ui;padding:32px;">` +
              `<h1>HMRC connection cancelled</h1>` +
              `<p>${error_description ? String(error_description) : String(error)}</p>` +
              `<p>Return to MileClear and try again, or contact support@mileclear.com.</p>` +
              `</body></html>`
          );
      }

      if (!code || !state) {
        return reply.status(400).send({ error: "Missing code or state on callback" });
      }

      // Match the state token to a user. The lastStateToken is unique enough
      // for a single in-flight handshake per user; collisions across users
      // are astronomically unlikely (24 bytes of randomness).
      const connection = await prisma.hmrcConnection.findFirst({
        where: { lastStateToken: state },
      });
      if (!connection) {
        logEvent("hmrc.callback_state_mismatch", null, { state });
        return reply.status(400).send({ error: "Unknown or expired state token" });
      }

      let tokens;
      try {
        tokens = await exchangeCodeForTokens({ config, code });
      } catch (err) {
        logEvent("hmrc.token_exchange_failed", connection.userId, {
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(502).send({ error: "Failed to exchange code with HMRC" });
      }

      await prisma.hmrcConnection.update({
        where: { id: connection.id },
        data: {
          // Encrypt access/refresh tokens at the write boundary. Pairs
          // with decryptIfEncrypted in services/hmrc/client.ts on read.
          // See apps/api/src/lib/encryption.ts for wire format.
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          scope: tokens.scope,
          expiresAt: expiryFromExpiresIn(tokens.expires_in),
          environment: config.environment,
          disconnectedAt: null,
          lastStateToken: null,
        },
      });

      logEvent("hmrc.connected", connection.userId, {
        environment: config.environment,
        scopes: tokens.scope.split(" ").length,
      });

      // Bounce back to the mobile app via the deep-link scheme.
      return reply.redirect("mileclear://hmrc-connected");
    }
  );

  // POST /hmrc/disconnect — soft-disconnect (clears active tokens)
  app.post("/disconnect", { preHandler: authMiddleware }, async (request, reply) => {
    await prisma.hmrcConnection.updateMany({
      where: { userId: request.userId!, disconnectedAt: null },
      data: {
        accessToken: "",
        refreshToken: "",
        disconnectedAt: new Date(),
      },
    });

    logEvent("hmrc.disconnected", request.userId!);
    return reply.send({ data: { disconnected: true } });
  });

  // GET /hmrc/scopes — debugging / introspection: full set we ask for
  app.get("/scopes", async (_request, reply) => {
    return reply.send({ data: { scopes: HMRC_SCOPES } });
  });

  // POST /hmrc/nino — set the user's NINO. Required before any MTD API
  // call that needs it as a path parameter (most of them).
  const ninoSchema = z.object({ nino: z.string().min(8).max(13) });
  app.post("/nino", { preHandler: authMiddleware }, async (request, reply) => {
    const parsed = ninoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const nino = normaliseNino(parsed.data.nino);
    if (!NINO_REGEX.test(nino)) {
      return reply.status(400).send({ error: "That doesn't look like a valid NINO." });
    }

    const conn = await prisma.hmrcConnection.findUnique({
      where: { userId: request.userId! },
    });
    if (!conn || conn.disconnectedAt) {
      return reply.status(400).send({ error: "Connect to HMRC before setting your NINO." });
    }

    await prisma.hmrcConnection.update({
      where: { id: conn.id },
      // NINO is sensitive PII under UK GDPR. Stored encrypted at rest.
      data: { nino: encrypt(nino) },
    });

    logEvent("hmrc.nino_set", request.userId!);
    return reply.send({ data: { nino } });
  });

  // GET /hmrc/obligations — list this user's quarterly obligations.
  // Drives the "Q3 due in 14 days" countdown on the dashboard once the
  // mobile UI lands in Phase 3.
  const obligationsQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    status: z.enum(["Open", "Fulfilled"]).optional(),
  });
  app.get("/obligations", { preHandler: authMiddleware }, async (request, reply) => {
    const parsed = obligationsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    // Use the shared helper so NINO decryption happens in one place. The
    // helper only returns nino; we still need businessId via a separate
    // read since it's not sensitive PII (HMRC-issued public identifier).
    const ctx = await loadConnectionWithNino(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });
    const conn = await prisma.hmrcConnection.findUnique({
      where: { userId: request.userId! },
      select: { businessId: true },
    });

    try {
      const obligations = await fetchObligations({
        userId: request.userId!,
        nino: ctx.nino,
        businessId: conn?.businessId ?? undefined,
        from: parsed.data.from,
        to: parsed.data.to,
        status: parsed.data.status,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });

      return reply.send({ data: { obligations } });
    } catch (err) {
      return handleHmrcError(reply, err);
    }
  });

  // ── Self Employment Business + Business Details (Phase 2 day 2) ─────

  // GET /hmrc/businesses — list every self-assessment trade HMRC has on
  // file for this user. Most gig drivers have one self-employment
  // business; some have additional landlord trades. Front-end picks one
  // for submission.
  app.get("/businesses", { preHandler: authMiddleware }, async (request, reply) => {
    const ctx = await loadConnectionWithNino(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });
    try {
      const businesses = await listBusinesses({
        userId: request.userId!,
        nino: ctx.nino,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      return reply.send({ data: { businesses } });
    } catch (err) {
      return handleHmrcError(reply, err);
    }
  });

  // GET /hmrc/businesses/:businessId — full detail for one trade.
  // Shows accounting type, commencement date, address; used to confirm
  // before locking the businessId on HmrcConnection.
  app.get("/businesses/:businessId", { preHandler: authMiddleware }, async (request, reply) => {
    const businessId = (request.params as { businessId?: string }).businessId?.trim();
    if (!businessId) {
      return reply.status(400).send({ error: "businessId is required." });
    }
    const ctx = await loadConnectionWithNino(request.userId!);
    if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

    try {
      const business = await retrieveBusiness({
        userId: request.userId!,
        nino: ctx.nino,
        businessId,
        client: buildClientContext(request),
        server: await buildServerContext(),
      });
      return reply.send({ data: business });
    } catch (err) {
      return handleHmrcError(reply, err);
    }
  });

  // POST /hmrc/business-id — persist the user's chosen businessId on
  // their HmrcConnection. After this every period-summary call uses it.
  // The id format is HMRC's (e.g. "XAIS12345678910"); we trust HMRC's
  // own list-businesses response and only require the user to have
  // already fetched it.
  const businessIdSchema = z.object({
    businessId: z
      .string()
      .min(8)
      .max(40)
      .regex(/^[A-Za-z0-9]+$/, "businessId must be alphanumeric."),
  });
  app.post("/business-id", { preHandler: authMiddleware }, async (request, reply) => {
    const parsed = businessIdSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const conn = await prisma.hmrcConnection.findUnique({
      where: { userId: request.userId! },
    });
    if (!conn || conn.disconnectedAt) {
      return reply.status(400).send({ error: "Connect to HMRC first." });
    }
    await prisma.hmrcConnection.update({
      where: { id: conn.id },
      data: { businessId: parsed.data.businessId },
    });
    logEvent("hmrc.business_id_set", request.userId!, {
      businessId: parsed.data.businessId,
    });
    return reply.send({ data: { businessId: parsed.data.businessId } });
  });

  // GET /hmrc/businesses/:businessId/periods?taxYear=2025-26 — list the
  // quarterly period summaries already submitted for the tax year.
  // Drives the "Q1 ✓, Q2 not yet" UI on the obligations screen.
  const periodsQuery = z.object({
    taxYear: z
      .string()
      .refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format (e.g. 2025-26)."),
  });
  app.get(
    "/businesses/:businessId/periods",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const businessId = (request.params as { businessId?: string }).businessId?.trim();
      if (!businessId) return reply.status(400).send({ error: "businessId is required." });
      const queryParsed = periodsQuery.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({ error: queryParsed.error.issues[0].message });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      try {
        const periods = await listPeriodSummaries({
          userId: request.userId!,
          nino: ctx.nino,
          businessId,
          taxYear: queryParsed.data.taxYear,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });
        return reply.send({ data: { periods } });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // GET /hmrc/businesses/:businessId/periods/:periodId?taxYear=2025-26
  // — full income/expense detail for one previously-submitted period.
  app.get(
    "/businesses/:businessId/periods/:periodId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const params = request.params as { businessId?: string; periodId?: string };
      const businessId = params.businessId?.trim();
      const periodId = params.periodId?.trim();
      if (!businessId) return reply.status(400).send({ error: "businessId is required." });
      if (!periodId) return reply.status(400).send({ error: "periodId is required." });
      const queryParsed = periodsQuery.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({ error: queryParsed.error.issues[0].message });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      try {
        const period = await retrievePeriodSummary({
          userId: request.userId!,
          nino: ctx.nino,
          businessId,
          periodId,
          taxYear: queryParsed.data.taxYear,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });
        return reply.send({ data: period });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // ── Period submission (Phase 2 day 3+) ────────────────────────────────
  // Pro-gated. The mapping → preview → submit flow is the headline feature
  // of the 1.2.0 MTD release; £4.99/mo gates the whole pipeline.

  // ISO calendar date (YYYY-MM-DD) — calendar-only, no time component.
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const submitBodySchema = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
    periodStartDate: z.string().regex(isoDateRegex, "periodStartDate must be YYYY-MM-DD."),
    periodEndDate: z.string().regex(isoDateRegex, "periodEndDate must be YYYY-MM-DD."),
  });

  // GET /hmrc/businesses/:businessId/periods/preview?taxYear=&from=&to=
  // — runs the mapper without submitting. Drives the mobile preview screen
  // ("here's what we're about to send to HMRC"). Pro-gated; returns the
  // full breakdown so the UI can show the per-platform / per-bucket split.
  const previewQuery = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
    from: z.string().regex(isoDateRegex, "from must be YYYY-MM-DD."),
    to: z.string().regex(isoDateRegex, "to must be YYYY-MM-DD."),
  });
  app.get(
    "/businesses/:businessId/periods/preview",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const businessId = (request.params as { businessId?: string }).businessId?.trim();
      if (!businessId) return reply.status(400).send({ error: "businessId is required." });
      const parsed = previewQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const submission = await buildPeriodSubmission({
          prisma,
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
          periodStartDate: parsed.data.from,
          periodEndDate: parsed.data.to,
        });
        return reply.send({ data: submission });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to build period preview.";
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // POST /hmrc/businesses/:businessId/periods — submit a quarterly period
  // summary to HMRC. Body: { taxYear, periodStartDate, periodEndDate }.
  // Mapping happens server-side from MileClear data; the client never sees
  // raw figures it could mutate before send. Returns the HMRC-assigned
  // periodId on success.
  app.post(
    "/businesses/:businessId/periods",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const businessId = (request.params as { businessId?: string }).businessId?.trim();
      if (!businessId) return reply.status(400).send({ error: "businessId is required." });
      const parsed = submitBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      let submission;
      try {
        submission = await buildPeriodSubmission({
          prisma,
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
          periodStartDate: parsed.data.periodStartDate,
          periodEndDate: parsed.data.periodEndDate,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to build submission payload.";
        return reply.status(400).send({ error: msg });
      }

      try {
        const result = await submitPeriodSummary({
          userId: request.userId!,
          nino: ctx.nino,
          businessId,
          taxYear: parsed.data.taxYear,
          body: {
            periodDates: submission.periodDates,
            periodIncome: submission.periodIncome,
            periodExpenses: submission.periodExpenses,
          },
          client: buildClientContext(request),
          server: await buildServerContext(),
        });

        logEvent("hmrc.period_submitted", request.userId!, {
          businessId,
          taxYear: parsed.data.taxYear,
          periodId: result.periodId,
          turnoverPence: submission.breakdown.income.turnoverPence,
          mileagePence: submission.breakdown.mileage.deductionPence,
        });

        return reply.send({
          data: {
            periodId: result.periodId,
            breakdown: submission.breakdown,
          },
        });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // PUT /hmrc/businesses/:businessId/periods/:periodId — amend an existing
  // period summary. Same body shape as create; periodDates are immutable
  // on HMRC's side but we still need from/to so we know which range to
  // re-aggregate from MileClear data.
  app.put(
    "/businesses/:businessId/periods/:periodId",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const params = request.params as { businessId?: string; periodId?: string };
      const businessId = params.businessId?.trim();
      const periodId = params.periodId?.trim();
      if (!businessId) return reply.status(400).send({ error: "businessId is required." });
      if (!periodId) return reply.status(400).send({ error: "periodId is required." });
      const parsed = submitBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      let submission;
      try {
        submission = await buildPeriodSubmission({
          prisma,
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
          periodStartDate: parsed.data.periodStartDate,
          periodEndDate: parsed.data.periodEndDate,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to build amendment payload.";
        return reply.status(400).send({ error: msg });
      }

      try {
        await amendPeriodSummary({
          userId: request.userId!,
          nino: ctx.nino,
          businessId,
          taxYear: parsed.data.taxYear,
          periodId,
          body: {
            periodIncome: submission.periodIncome,
            periodExpenses: submission.periodExpenses,
          },
          client: buildClientContext(request),
          server: await buildServerContext(),
        });

        logEvent("hmrc.period_amended", request.userId!, {
          businessId,
          taxYear: parsed.data.taxYear,
          periodId,
          turnoverPence: submission.breakdown.income.turnoverPence,
          mileagePence: submission.breakdown.mileage.deductionPence,
        });

        return reply.send({
          data: {
            periodId,
            breakdown: submission.breakdown,
          },
        });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // ── Individual Calculations API (Phase 2 day 4) ──────────────────────
  // Triggers HMRC's tax calc against the user's submitted period data,
  // then reads back the headline figures (income tax, NI2, NI4, total).
  // Drives the Tax Readiness cross-check ("here's what HMRC thinks vs
  // what we estimated"). Pro-gated like the rest of MTD.

  // POST /hmrc/calculations — trigger a new calculation. HMRC runs the
  // calc asynchronously; the returned calculationId is then polled via
  // GET /hmrc/calculations/:id until ready.
  const triggerCalcSchema = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
    calculationType: z
      .string()
      .refine(isValidCalculationType, "calculationType must be one of in-year, intent-to-finalise, intent-to-amend.")
      .optional(),
  });
  app.post(
    "/calculations",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = triggerCalcSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      const calculationType: CalculationType =
        (parsed.data.calculationType as CalculationType | undefined) ?? "in-year";

      try {
        const result = await triggerCalculation({
          userId: request.userId!,
          nino: ctx.nino,
          taxYear: parsed.data.taxYear,
          calculationType,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });

        logEvent("hmrc.calculation_triggered", request.userId!, {
          taxYear: parsed.data.taxYear,
          calculationType,
          calculationId: result.calculationId,
        });

        return reply.send({ data: result });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // GET /hmrc/calculations?taxYear=YYYY-YY — list calculations for the
  // tax year, most recent first.
  const calcListQuery = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
  });
  app.get(
    "/calculations",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = calcListQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      try {
        const calculations = await listCalculations({
          userId: request.userId!,
          nino: ctx.nino,
          taxYear: parsed.data.taxYear,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });
        return reply.send({ data: { calculations } });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // GET /hmrc/calculations/:calculationId — full breakdown of one calc.
  // Mobile/web polls this with backoff (start 2s, double up to 30s) until
  // `data.ready === true`. The `raw` field contains HMRC's full response
  // for any deeper "view full breakdown" UI we add later.
  app.get(
    "/calculations/:calculationId",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const calculationId = (request.params as { calculationId?: string }).calculationId?.trim();
      if (!calculationId) {
        return reply.status(400).send({ error: "calculationId is required." });
      }
      const ctx = await loadConnectionWithNino(request.userId!);
      if ("error" in ctx) return reply.status(ctx.status).send({ error: ctx.error });

      try {
        const summary = await retrieveCalculation({
          userId: request.userId!,
          nino: ctx.nino,
          calculationId,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });
        return reply.send({ data: summary });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // ── Business Source Adjustable Summary (Phase 2 day 5) ───────────────
  // BSAS is the year-end snapshot mechanism — not on the 7 August 2026
  // critical path, but the API surface ships now so Phase 3 mobile UI
  // has it available when we add the year-end review screen later.
  // All routes Pro-gated.

  // POST /hmrc/bsas — trigger a BSAS for a business + accounting period.
  // Body: { taxYear, businessId, accountingPeriodStartDate, accountingPeriodEndDate, typeOfBusiness? }.
  const triggerBsasSchema = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
    businessId: z
      .string()
      .min(8)
      .max(40)
      .regex(/^[A-Za-z0-9]+$/, "businessId must be alphanumeric."),
    accountingPeriodStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "accountingPeriodStartDate must be YYYY-MM-DD."),
    accountingPeriodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "accountingPeriodEndDate must be YYYY-MM-DD."),
    typeOfBusiness: z
      .string()
      .refine(isValidBsasBusinessType, "typeOfBusiness invalid.")
      .optional(),
  });
  app.post(
    "/bsas",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = triggerBsasSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const result = await triggerBsas({
          userId: request.userId!,
          businessId: parsed.data.businessId,
          taxYear: parsed.data.taxYear,
          accountingPeriodStartDate: parsed.data.accountingPeriodStartDate,
          accountingPeriodEndDate: parsed.data.accountingPeriodEndDate,
          typeOfBusiness: parsed.data.typeOfBusiness as BsasBusinessType | undefined,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });

        logEvent("hmrc.bsas_triggered", request.userId!, {
          taxYear: parsed.data.taxYear,
          businessId: parsed.data.businessId,
          calculationId: result.calculationId,
        });

        return reply.send({ data: result });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // GET /hmrc/bsas?taxYear=&typeOfBusiness=&businessId= — list BSASes.
  const bsasListQuery = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
    typeOfBusiness: z
      .string()
      .refine(isValidBsasBusinessType, "typeOfBusiness invalid.")
      .optional(),
    businessId: z.string().optional(),
  });
  app.get(
    "/bsas",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const parsed = bsasListQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const list = await listBsas({
          userId: request.userId!,
          taxYear: parsed.data.taxYear,
          typeOfBusiness: parsed.data.typeOfBusiness as BsasBusinessType | undefined,
          businessId: parsed.data.businessId,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });
        return reply.send({ data: list });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );

  // GET /hmrc/bsas/:bsasId?taxYear=YYYY-YY — retrieve one self-employment
  // BSAS with the headline summary projected. Like calculations, callers
  // can poll until `data.ready === true`.
  const bsasRetrieveQuery = z.object({
    taxYear: z.string().refine(isValidHmrcTaxYear, "taxYear must be in YYYY-YY format."),
  });
  app.get(
    "/bsas/:bsasId",
    { preHandler: [authMiddleware, premiumMiddleware] },
    async (request, reply) => {
      const bsasId = (request.params as { bsasId?: string }).bsasId?.trim();
      if (!bsasId) return reply.status(400).send({ error: "bsasId is required." });
      const parsed = bsasRetrieveQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const summary = await retrieveSelfEmploymentBsas({
          userId: request.userId!,
          calculationId: bsasId,
          taxYear: parsed.data.taxYear,
          client: buildClientContext(request),
          server: await buildServerContext(),
        });
        return reply.send({ data: summary });
      } catch (err) {
        return handleHmrcError(reply, err);
      }
    }
  );
}

// ── Helpers (route-internal) ──────────────────────────────────────────

/**
 * Load the active HmrcConnection and validate that NINO is set. Returns
 * either the resolved nino or an error envelope; callers do
 * `if ("error" in ctx)` to short-circuit. Centralised so each new route
 * doesn't reimplement the same three checks.
 */
async function loadConnectionWithNino(
  userId: string
): Promise<{ nino: string } | { error: string; status: 400 }> {
  const conn = await prisma.hmrcConnection.findUnique({
    where: { userId },
    select: { nino: true, disconnectedAt: true },
  });
  if (!conn || conn.disconnectedAt) {
    return { error: "Connect to HMRC first.", status: 400 };
  }
  if (!conn.nino) {
    return {
      error: "Set your NINO via POST /hmrc/nino before this call.",
      status: 400,
    };
  }
  // Decrypt at the read boundary. decryptIfEncrypted handles legacy
  // plaintext rows transparently for the migration window.
  const nino = decryptIfEncrypted(conn.nino);
  if (!nino) {
    return {
      error: "Set your NINO via POST /hmrc/nino before this call.",
      status: 400,
    };
  }
  return { nino };
}

/**
 * Map HMRC errors thrown by hmrcCall onto the response shape. Single
 * source of truth for "what does each HmrcError class become on the
 * wire" so every route handles them identically.
 */
function handleHmrcError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof HmrcNotConnectedError) {
    return reply.status(400).send({
      error: {
        code: "HMRC_NOT_CONNECTED",
        message: "Connect to HMRC first.",
        retryable: false,
      },
    });
  }
  if (err instanceof HmrcReauthRequiredError) {
    // Modern error shape so parseApiError on the client picks up the code
    // and routes to the re-OAuth prompt instead of the generic
    // session-expired flow.
    return reply.status(401).send({
      error: {
        code: "HMRC_REAUTH_REQUIRED",
        message: "HMRC connection expired. Please reconnect.",
        retryable: false,
      },
    });
  }
  if (err instanceof HmrcError) {
    return reply.status(err.httpStatus >= 500 ? 502 : err.httpStatus).send({
      error: {
        code: err.hmrcCode ?? "HMRC_API_ERROR",
        message: err.message,
        retryable: err.httpStatus >= 500,
      },
    });
  }
  throw err;
}
