import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { attachIdempotency } from "../../middleware/idempotency.js";
import { premiumMiddleware, hasPremiumAccess } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import {
  truelayerEnabled,
  TRUELAYER_AUTH_BASE,
  TRUELAYER_CLIENT_ID,
} from "../../lib/truelayer.js";
import {
  issueOpenBankingState,
  readOpenBankingState,
  consumeOpenBankingState,
  type OpenBankingReturnTo,
} from "../../lib/openBankingState.js";
import {
  renderCallbackPage,
  linkedAccountLabel,
  CALLBACK_PAGE_CSP,
  type CallbackOutcome,
} from "./openBankingPages.js";

/** Banks one driver can link in 24 hours before we stop and ask them to wait. */
const MAX_LINKS_PER_DAY = 5;
import { parseCsvPreview, confirmCsvImport } from "../../services/csvParser.js";
import {
  buildAuthLink,
  exchangeCode,
  syncTransactions,
  getConnections,
  disconnectConnection,
  TRUELAYER_REDIRECT_URI,
} from "../../services/openBanking.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@mileclear/shared";
import { logEvent } from "../../services/appEvents.js";

const createEarningSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  amountPence: z.number().int().positive("Amount must be positive"),
  periodStart: z.coerce.date({ required_error: "Period start date is required", invalid_type_error: "Invalid start date" }),
  periodEnd: z.coerce.date({ required_error: "Period end date is required", invalid_type_error: "Invalid end date" }),
  projectLabel: z.string().max(100).optional(),
});

const updateEarningSchema = z.object({
  platform: z.string().min(1).optional(),
  amountPence: z.number().int().positive().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  projectLabel: z.string().max(100).nullable().optional(),
});

const listEarningsQuery = z.object({
  platform: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export async function earningRoutes(app: FastifyInstance) {
  // Two Open Banking routes are opened by a plain browser, not our API
  // client, so they MUST be public:
  //   - /open-banking/link     old app builds start here; it redirects to
  //                            TrueLayer (any ?token= is ignored)
  //   - /open-banking/callback TrueLayer's redirect back after the bank
  //                            approves; it exchanges the code itself
  // The callback knows the driver from the signed, single-use `state`
  // issued by /open-banking/link-token (lib/openBankingState.ts), so no
  // JWT ever has to travel in a URL or sit in browser storage. TrueLayer
  // can't send a Bearer header on its redirect, so gating either route
  // behind authMiddleware would break the flow.
  // request.url includes the /earnings prefix from server.ts, so we match
  // the full path here (not just the route-local path).
  const PUBLIC_PATHS = new Set([
    "/earnings/open-banking/link",
    "/earnings/open-banking/callback",
  ]);
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) return;
    return authMiddleware(request, reply);
  });
  attachIdempotency(app);

  // Create earning (manual entry)
  app.post("/", async (request, reply) => {
    const parsed = createEarningSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { platform, amountPence, periodStart, periodEnd, projectLabel } = parsed.data;
    const userId = request.userId!;

    if (periodEnd < periodStart) {
      return reply.status(400).send({ error: "Period end must be on or after period start" });
    }

    const earning = await prisma.earning.create({
      data: {
        userId,
        platform,
        amountPence,
        periodStart,
        periodEnd,
        source: "manual",
        projectLabel: projectLabel ?? null,
      },
    });

    logEvent("earnings.created", userId, { platform, amountPence, source: "manual" });

    return reply.status(201).send({ data: earning });
  });

  // Snap your statement (Pro). The app reads a screenshot of a platform's
  // earnings summary on the device, the driver confirms the figures, and this
  // saves them. Duplicates are answered with 200 + `duplicate`, not an error:
  //   exact   - the same externalId (platform + period + amount) is saved
  //             already; never saved twice (the unique key would refuse it).
  //   similar - an earning for the same platform, period and amount exists
  //             from another source (typed in, CSV, bank). Saved only when
  //             the driver says so (`force: true`).
  app.post("/statement", { preHandler: premiumMiddleware }, async (request, reply) => {
    const schema = createEarningSchema.extend({
      externalId: z.string().min(1).max(255),
      notes: z.string().max(500).optional(),
      force: z.boolean().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { platform, amountPence, periodStart, periodEnd, projectLabel, externalId, notes, force } =
      parsed.data;
    const userId = request.userId!;

    if (periodEnd < periodStart) {
      return reply.status(400).send({ error: "Period end must be on or after period start" });
    }

    const exact = await prisma.earning.findUnique({
      where: { userId_externalId: { userId, externalId } },
    });
    if (exact) {
      return reply.send({ data: null, duplicate: { kind: "exact", earning: exact } });
    }

    if (!force) {
      const similar = await prisma.earning.findFirst({
        where: { userId, platform, amountPence, periodStart, periodEnd },
      });
      if (similar) {
        return reply.send({ data: null, duplicate: { kind: "similar", earning: similar } });
      }
    }

    try {
      const earning = await prisma.earning.create({
        data: {
          userId,
          platform,
          amountPence,
          periodStart,
          periodEnd,
          source: "ocr",
          externalId,
          notes: notes ?? null,
          projectLabel: projectLabel ?? null,
        },
      });
      logEvent("earnings.created", userId, { platform, amountPence, source: "ocr", via: "snap_statement" });
      return reply.status(201).send({ data: earning });
    } catch (err: any) {
      // Two taps racing past the check above.
      if (err?.code === "P2002") {
        const existing = await prisma.earning.findUnique({
          where: { userId_externalId: { userId, externalId } },
        });
        return reply.send({ data: null, duplicate: { kind: "exact", earning: existing } });
      }
      throw err;
    }
  });

  // List earnings with pagination
  app.get("/", async (request, reply) => {
    const parsed = listEarningsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { platform, from, to, page, pageSize } = parsed.data;
    const userId = request.userId!;

    const where: Record<string, unknown> = { userId };
    if (platform) where.platform = platform;
    if (from) where.periodStart = { ...(where.periodStart as object), gte: from };
    if (to) where.periodEnd = { ...(where.periodEnd as object), lte: to };

    const [data, total, sumResult] = await Promise.all([
      prisma.earning.findMany({
        where,
        orderBy: { periodStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.earning.count({ where }),
      prisma.earning.aggregate({ where, _sum: { amountPence: true } }),
    ]);

    return reply.send({
      data,
      total,
      totalAmountPence: sumResult._sum.amountPence ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Get single earning
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const earning = await prisma.earning.findFirst({
      where: { id, userId },
    });

    if (!earning) {
      return reply.status(404).send({ error: "Earning not found" });
    }

    return reply.send({ data: earning });
  });

  // Update earning
  app.patch("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = updateEarningSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const updates = parsed.data;

    const existing = await prisma.earning.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Earning not found" });
    }

    // Validate date range with merged values
    const newStart = updates.periodStart ?? existing.periodStart;
    const newEnd = updates.periodEnd ?? existing.periodEnd;
    if (newEnd < newStart) {
      return reply.status(400).send({ error: "Period end must be on or after period start" });
    }

    const earning = await prisma.earning.update({
      where: { id },
      data: updates,
    });

    return reply.send({ data: earning });
  });

  // Delete earning
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const existing = await prisma.earning.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Earning not found" });
    }

    await prisma.earning.delete({ where: { id } });

    return reply.send({ message: "Earning deleted" });
  });

  // ── CSV Import ─────────────────────────────────────────────────────

  // Preview parsed CSV before confirming import
  app.post("/csv/preview", { preHandler: premiumMiddleware }, async (request, reply) => {
    const schema = z.object({
      csvContent: z.string().min(1, "CSV content is required").max(500_000, "CSV file too large (max 500KB)"),
      platform: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    try {
      const preview = await parseCsvPreview(
        request.userId!,
        parsed.data.csvContent,
        parsed.data.platform
      );
      return reply.send({ data: preview });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Confirm CSV import after preview
  app.post("/csv/confirm", { preHandler: premiumMiddleware }, async (request, reply) => {
    const schema = z.object({
      rows: z.array(
        z.object({
          platform: z.string(),
          amountPence: z.number().int().positive(),
          periodStart: z.string(),
          periodEnd: z.string(),
          externalId: z.string(),
          isDuplicate: z.boolean(),
        })
      ),
      filename: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    try {
      const result = await confirmCsvImport(
        request.userId!,
        parsed.data.rows,
        parsed.data.filename
      );
      logEvent("earnings.csv_imported", request.userId!, {
        rowCount: result.imported,
        filename: parsed.data.filename,
      });
      return reply.send({ data: result });
    } catch (err: any) {
      request.log.error(err, "CSV confirm import failed");
      return reply.status(500).send({ error: "Import failed. Please try again." });
    }
  });

  // ── Open Banking (TrueLayer) ──────────────────────────────────────

  // Generate auth link (premium only)
  app.post(
    "/open-banking/link-token",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      if (!truelayerEnabled) {
        return reply
          .status(503)
          .send({ error: "Open Banking is not configured. Please try again later." });
      }

      try {
        // Signed, expiring, single-use state naming this driver. The
        // callback trusts nothing else. ?return=web marks a link started
        // from the website, so the page afterwards points back there.
        const { return: returnTo } = request.query as { return?: string };
        const state = issueOpenBankingState(
          request.userId!,
          returnTo === "web" ? "web" : "app"
        );
        const authLink = buildAuthLink(state);
        logEvent("earnings.open_banking_link_issued", request.userId!);
        return reply.send({ data: { authLink } });
      } catch (err: any) {
        request.log.error(err, "Failed to create auth link");
        return reply.status(500).send({ error: "Failed to create bank link" });
      }
    }
  );

  // Exchange auth code after TrueLayer redirect (premium only). The
  // callback now exchanges the code itself; this stays for any callback
  // page from before 17 Oct still open in a browser that posts here.
  // Remove it around 31 Oct 2026, once old builds have moved on (check
  // app_events for open_banking_connected without via: "callback").
  app.post(
    "/open-banking/exchange",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      if (!truelayerEnabled) {
        return reply
          .status(503)
          .send({ error: "Open Banking is not configured" });
      }

      const schema = z.object({
        code: z.string().min(1),
        institutionName: z.string().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const connection = await exchangeCode(
          request.userId!,
          parsed.data.code,
          parsed.data.institutionName
        );
        logEvent("earnings.open_banking_connected", request.userId!, {
          connectionId: connection.id,
          institution: connection.institutionName ?? null,
        });
        return reply.status(201).send({ data: connection });
      } catch (err: any) {
        request.log.error(err, "Failed to exchange TrueLayer code");
        // The one step nobody can retry from the app: the auth code is
        // single-use. Record why it failed so a silent flow is visible.
        logEvent("earnings.open_banking_exchange_failed", request.userId!, {
          message: String(err?.message ?? err).slice(0, 300),
        });
        return reply.status(500).send({ error: "Failed to connect bank" });
      }
    }
  );

  // List connected banks (premium only)
  app.get(
    "/open-banking/connections",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      const connections = await getConnections(request.userId!);
      return reply.send({ data: connections });
    }
  );

  // Sync transactions for a connection (premium only)
  app.post(
    "/open-banking/sync",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      if (!truelayerEnabled) {
        return reply
          .status(503)
          .send({ error: "Open Banking is not configured" });
      }

      const schema = z.object({
        connectionId: z.string().uuid(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const result = await syncTransactions(
          request.userId!,
          parsed.data.connectionId,
          parsed.data.fromDate,
          parsed.data.toDate
        );
        logEvent("earnings.open_banking_synced", request.userId!, {
          connectionId: parsed.data.connectionId,
          ...(result && typeof result === "object" ? result : {}),
        });
        return reply.send({ data: result });
      } catch (err: any) {
        request.log.error(err, "Failed to sync transactions");
        logEvent("earnings.open_banking_sync_failed", request.userId!, {
          connectionId: parsed.data.connectionId,
          message: String(err?.message ?? err).slice(0, 300),
        });
        return reply.status(500).send({ error: "Transaction sync failed. Please try again later." });
      }
    }
  );

  // Disconnect a bank (premium only)
  app.delete(
    "/open-banking/connections/:id",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      try {
        await disconnectConnection(request.userId!, id);
        logEvent("earnings.open_banking_disconnected", request.userId!, { connectionId: id });
        return reply.send({ message: "Bank disconnected" });
      } catch (err: any) {
        request.log.error(err, "Failed to disconnect bank");
        return reply.status(500).send({ error: "Failed to disconnect bank. Please try again." });
      }
    }
  );

  // ── TrueLayer callback (the bank sends the driver back here) ──
  //
  // The code exchange happens HERE, on the server, authenticated by the
  // signed single-use state issued with the link (lib/openBankingState.ts).
  // It used to happen in this page's JavaScript with a JWT kept in
  // sessionStorage, which failed whenever the bank's own app did the
  // approval: the driver came back in Safari, not the in-app browser that
  // held the token, so the exchange was never called and nothing was
  // logged. Every outcome below now logs its own event.

  app.get("/open-banking/callback", async (request, reply) => {
    const { code, error: tlError, state } = request.query as {
      code?: string;
      error?: string;
      state?: string;
    };
    const send = (
      outcome: CallbackOutcome,
      returnTo: OpenBankingReturnTo | null,
      linkedTo: string | null = null
    ) =>
      reply
        .type("text/html")
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", CALLBACK_PAGE_CSP)
        .send(renderCallbackPage(outcome, returnTo, linkedTo));

    // Attribute the landing before deciding anything. A state that fails
    // its signature is not trusted to name anyone.
    const signed = readOpenBankingState(state);
    logEvent("earnings.open_banking_callback", signed?.userId ?? null, {
      outcome: tlError ? "error" : code ? "code" : "cancelled",
      error: tlError ? String(tlError).slice(0, 100) : null,
    });

    if (tlError || !code || typeof code !== "string") {
      // Use the state up anyway, so the address of a cancelled attempt
      // can't be finished later with someone else's code.
      consumeOpenBankingState(state);
      return send("cancelled", signed?.returnTo ?? null);
    }

    const check = consumeOpenBankingState(state);
    if (!check.ok) {
      const userId = check.payload?.userId ?? null;
      logEvent("earnings.open_banking_state_invalid", userId, { reason: check.reason });
      const returnTo = check.payload?.returnTo ?? null;
      if (check.reason === "expired") return send("expired", returnTo);
      if (check.reason === "replayed" && check.payload) {
        // Most often the driver reloaded the page after it worked. Say so
        // if a bank was saved for them since this state was issued.
        const linked = await prisma.plaidConnection
          .findFirst({
            where: {
              userId: check.payload.userId,
              status: "active",
              updatedAt: { gte: new Date(check.payload.issuedAt) },
            },
            select: { id: true },
          })
          .catch(() => null);
        if (linked) {
          return send("connected", returnTo, await accountLabel(check.payload.userId));
        }
        return send("replayed", returnTo);
      }
      return send("bad_state", returnTo);
    }

    const { userId, returnTo } = check.payload;

    if (!truelayerEnabled) {
      logEvent("earnings.open_banking_exchange_failed", userId, { reason: "not_configured" });
      return send("unavailable", returnTo);
    }

    let entitled = false;
    try {
      entitled = await hasPremiumAccess(userId);
    } catch (err) {
      request.log.error(err, "Pro check failed in Open Banking callback");
      logEvent("earnings.open_banking_exchange_failed", userId, { reason: "pro_check_error" });
      return send("exchange_failed", returnTo);
    }
    if (!entitled) {
      logEvent("earnings.open_banking_not_premium", userId);
      return send("not_premium", returnTo);
    }

    // A driver links one or two banks. Many in a day means something is
    // wrong (or someone is being talked into approving links), so stop.
    const linkedToday = await prisma.appEvent
      .count({
        where: {
          userId,
          type: "earnings.open_banking_connected",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      })
      .catch(() => 0);
    if (linkedToday >= MAX_LINKS_PER_DAY) {
      logEvent("earnings.open_banking_link_limit", userId, { linkedToday });
      return send("too_many", returnTo);
    }

    try {
      const connection = await exchangeCode(userId, code);
      logEvent("earnings.open_banking_connected", userId, {
        connectionId: connection.id,
        institution: connection.institutionName ?? null,
        via: "callback",
      });
      return send("connected", returnTo, await accountLabel(userId));
    } catch (err: any) {
      request.log.error(err, "Failed to exchange TrueLayer code");
      const message = String(err?.message ?? err);
      logEvent("earnings.open_banking_exchange_failed", userId, {
        reason: message.includes("belongs to another account") ? "another_account" : "exchange_error",
        message: message.slice(0, 300),
      });
      return send("exchange_failed", returnTo);
    }
  });

  // ── Start page (kept for app builds and website tabs from before 17 Oct) ──
  //
  // Older app builds open /link?authLink=...&token=<JWT>. The token is now
  // ignored (the callback no longer needs it) and this simply sends the
  // driver on to TrueLayer, so those builds can link a bank too. Only a
  // link to TrueLayer for our client and our callback is followed:
  // anything else would make this an open redirect on our domain.

  app.get("/open-banking/link", async (request, reply) => {
    const { authLink } = request.query as { authLink?: string };
    const target = typeof authLink === "string" ? trueLayerAuthLink(authLink) : null;
    if (!target) {
      return reply
        .status(400)
        .send({ error: "Invalid bank link. Please start again from MileClear." });
    }
    return reply.header("Cache-Control", "no-store").redirect(target);
  });
}

/**
 * The normalised link when it is one buildAuthLink would make (TrueLayer's
 * auth address, our client, our callback), otherwise null.
 */
function trueLayerAuthLink(link: string): string | null {
  try {
    const url = new URL(link);
    const base = new URL(TRUELAYER_AUTH_BASE);
    if (url.protocol !== "https:" || url.origin !== base.origin) return null;
    if (url.username || url.password) return null;
    if (!TRUELAYER_CLIENT_ID || url.searchParams.get("client_id") !== TRUELAYER_CLIENT_ID) return null;
    if (url.searchParams.get("redirect_uri") !== TRUELAYER_REDIRECT_URI) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Which MileClear account the bank went to, masked, for the page. */
async function accountLabel(userId: string): Promise<string | null> {
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { email: true } })
    .catch(() => null);
  return linkedAccountLabel(user?.email ?? null);
}
