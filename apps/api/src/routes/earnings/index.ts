import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { truelayerEnabled } from "../../lib/truelayer.js";
import { parseCsvPreview, confirmCsvImport } from "../../services/csvParser.js";
import {
  buildAuthLink,
  exchangeCode,
  syncTransactions,
  getConnections,
  disconnectConnection,
} from "../../services/openBanking.js";
import {
  PLATFORM_TAGS,
  EARNING_SOURCES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@mileclear/shared";
import { logEvent } from "../../services/appEvents.js";

const createEarningSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  amountPence: z.number().int().positive("Amount must be positive"),
  periodStart: z.coerce.date({ required_error: "Period start date is required", invalid_type_error: "Invalid start date" }),
  periodEnd: z.coerce.date({ required_error: "Period end date is required", invalid_type_error: "Invalid end date" }),
});

const updateEarningSchema = z.object({
  platform: z.string().min(1).optional(),
  amountPence: z.number().int().positive().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

const listEarningsQuery = z.object({
  platform: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export async function earningRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Create earning (manual entry)
  app.post("/", async (request, reply) => {
    const parsed = createEarningSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { platform, amountPence, periodStart, periodEnd } = parsed.data;
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
      },
    });

    logEvent("earnings.created", userId, { platform, amountPence, source: "manual" });

    return reply.status(201).send({ data: earning });
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

  // OCR stub
  app.post("/ocr", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
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
        // Use userId as state to verify on callback
        const state = Buffer.from(
          JSON.stringify({ userId: request.userId, ts: Date.now() })
        ).toString("base64url");
        const authLink = buildAuthLink(state);
        return reply.send({ data: { authLink } });
      } catch (err: any) {
        request.log.error(err, "Failed to create auth link");
        return reply.status(500).send({ error: "Failed to create bank link" });
      }
    }
  );

  // Exchange auth code after TrueLayer redirect (premium only)
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
        return reply.status(201).send({ data: connection });
      } catch (err: any) {
        request.log.error(err, "Failed to exchange TrueLayer code");
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
        });
        return reply.send({ data: result });
      } catch (err: any) {
        request.log.error(err, "Failed to sync transactions");
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
        return reply.send({ message: "Bank disconnected" });
      } catch (err: any) {
        request.log.error(err, "Failed to disconnect bank");
        return reply.status(500).send({ error: "Failed to disconnect bank. Please try again." });
      }
    }
  );

  // ── TrueLayer callback page (opened in WebBrowser after bank auth) ──

  app.get("/open-banking/callback", async (request, reply) => {
    const { code, error: tlError } = request.query as {
      code?: string;
      error?: string;
    };

    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 3002}`;

    // Build the callback HTML page
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Your Bank - MileClear</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #030712; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
  .container { text-align: center; max-width: 400px; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  p { color: #9ca3af; font-size: 15px; margin-bottom: 24px; }
  .spinner { width: 40px; height: 40px; border: 3px solid #1f2937; border-top-color: #f5a623; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .btn { display: inline-block; background: #f5a623; color: #030712; font-weight: 700; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-size: 16px; cursor: pointer; border: none; }
  .success { color: #10b981; }
  .hidden { display: none; }
</style>
</head><body>
<div class="container">
  <div id="loading">
    <div class="spinner"></div>
    <h1>Connecting your bank...</h1>
    <p>Please wait while we complete the connection</p>
  </div>
  <div id="success" class="hidden">
    <h1 class="success">Bank Connected!</h1>
    <p>Your bank has been linked successfully. You can now sync your transactions.</p>
    <p style="margin-bottom: 16px;">You can close this window and return to the MileClear app.</p>
  </div>
  <div id="error" class="hidden">
    <h1>Connection Failed</h1>
    <p id="errorMsg">Something went wrong. Please try again.</p>
    <button onclick="window.close()" class="btn" style="margin-top: 16px;">Close</button>
  </div>
</div>
<script>
(async function() {
  const code = ${JSON.stringify(code || "")};
  const tlError = ${JSON.stringify(tlError || "")};

  if (tlError || !code) {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("errorMsg").textContent = tlError || "Bank authorisation was cancelled.";
    document.getElementById("error").classList.remove("hidden");
    return;
  }

  try {
    // Retrieve saved auth token from sessionStorage
    const authToken = sessionStorage.getItem("mc_ob_token");
    if (!authToken) throw new Error("Session expired. Please try again from the app.");

    const res = await fetch("${apiBaseUrl}/earnings/open-banking/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authToken,
      },
      body: JSON.stringify({ code: code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Exchange failed");
    }
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("success").classList.remove("hidden");
    sessionStorage.removeItem("mc_ob_token");
  } catch (e) {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("errorMsg").textContent = e.message || "Failed to save connection.";
    document.getElementById("error").classList.remove("hidden");
  }
})();
</script>
</body></html>`;

    return reply.type("text/html").send(html);
  });

  // ── Pre-auth page (stores JWT in sessionStorage before redirect) ──

  app.get("/open-banking/link", async (request, reply) => {
    const { authLink, token } = request.query as {
      authLink?: string;
      token?: string;
    };

    if (!authLink) {
      return reply.status(400).send({ error: "Missing authLink parameter" });
    }

    const safeAuthLink = JSON.stringify(authLink);
    const safeToken = JSON.stringify(token || "");

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Your Bank - MileClear</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #030712; }
</style>
</head><body>
<script>
  // Store the auth token so the callback page can use it
  sessionStorage.setItem("mc_ob_token", ${safeToken});
  // Redirect to TrueLayer auth dialog
  window.location.href = ${safeAuthLink};
</script>
</body></html>`;

    return reply.type("text/html").send(html);
  });
}
