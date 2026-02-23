import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import { plaidClient } from "../../lib/plaid.js";
import { parseCsvPreview, confirmCsvImport } from "../../services/csvParser.js";
import {
  createLinkToken,
  exchangePublicToken,
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

const createEarningSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  amountPence: z.number().int().positive("Amount must be positive"),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
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
    const { id } = request.params as { id: string };
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
    const { id } = request.params as { id: string };
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
    const { id } = request.params as { id: string };
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
  app.post("/csv/preview", async (request, reply) => {
    const schema = z.object({
      csvContent: z.string().min(1, "CSV content is required"),
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
  app.post("/csv/confirm", async (request, reply) => {
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
      return reply.send({ data: result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // OCR stub
  app.post("/ocr", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });

  // ── Open Banking (Plaid) ──────────────────────────────────────────

  // Create Plaid link token (premium only)
  app.post(
    "/open-banking/link-token",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      if (!plaidClient) {
        return reply
          .status(503)
          .send({ error: "Open Banking is not configured. Please try again later." });
      }

      try {
        const linkToken = await createLinkToken(request.userId!);
        return reply.send({ data: { linkToken } });
      } catch (err: any) {
        request.log.error(err, "Failed to create Plaid link token");
        return reply.status(500).send({ error: "Failed to create bank link" });
      }
    }
  );

  // Exchange public token after Plaid Link (premium only)
  app.post(
    "/open-banking/exchange",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      if (!plaidClient) {
        return reply
          .status(503)
          .send({ error: "Open Banking is not configured" });
      }

      const schema = z.object({
        publicToken: z.string().min(1),
        institutionId: z.string().optional(),
        institutionName: z.string().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      try {
        const connection = await exchangePublicToken(
          request.userId!,
          parsed.data.publicToken,
          parsed.data.institutionId,
          parsed.data.institutionName
        );
        return reply.status(201).send({ data: connection });
      } catch (err: any) {
        request.log.error(err, "Failed to exchange Plaid token");
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
      if (!plaidClient) {
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
        return reply.send({ data: result });
      } catch (err: any) {
        request.log.error(err, "Failed to sync transactions");
        return reply.status(500).send({ error: err.message || "Sync failed" });
      }
    }
  );

  // Disconnect a bank (premium only)
  app.delete(
    "/open-banking/connections/:id",
    { preHandler: premiumMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await disconnectConnection(request.userId!, id);
        return reply.send({ message: "Bank disconnected" });
      } catch (err: any) {
        request.log.error(err, "Failed to disconnect bank");
        return reply.status(500).send({ error: err.message || "Disconnect failed" });
      }
    }
  );

  // ── Plaid Link HTML pages (unauthenticated, opened in WebBrowser) ──

  // Serves HTML page that loads Plaid Link JS SDK
  app.get("/open-banking/link", async (request, reply) => {
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.status(400).send({ error: "Missing link token" });
    }

    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 3002}`;

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
  .error { color: #ef4444; margin-top: 16px; }
  .hidden { display: none; }
</style>
</head><body>
<div class="container">
  <div id="loading">
    <div class="spinner"></div>
    <h1>Connecting to your bank...</h1>
    <p>Plaid Link will open momentarily</p>
  </div>
  <div id="success" class="hidden">
    <h1>Bank Connected!</h1>
    <p>Your bank has been linked successfully. You can now sync your transactions.</p>
    <a href="${apiBaseUrl}/earnings/open-banking/callback" class="btn">Return to App</a>
  </div>
  <div id="error" class="hidden">
    <h1>Connection Failed</h1>
    <p id="errorMsg">Something went wrong. Please try again.</p>
    <button onclick="window.close()" class="btn" style="margin-top: 16px;">Close</button>
  </div>
</div>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<script>
  const linkToken = "${token}";
  const handler = Plaid.create({
    token: linkToken,
    onSuccess: async function(publicToken, metadata) {
      document.getElementById("loading").classList.add("hidden");
      try {
        const res = await fetch("${apiBaseUrl}/earnings/open-banking/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken: publicToken,
            institutionId: metadata.institution ? metadata.institution.institution_id : null,
            institutionName: metadata.institution ? metadata.institution.name : null,
          }),
        });
        if (!res.ok) throw new Error("Exchange failed");
        document.getElementById("success").classList.remove("hidden");
      } catch (e) {
        document.getElementById("errorMsg").textContent = "Failed to save connection: " + e.message;
        document.getElementById("error").classList.remove("hidden");
      }
    },
    onExit: function(err) {
      if (err) {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("errorMsg").textContent = err.display_message || "Connection was cancelled.";
        document.getElementById("error").classList.remove("hidden");
      } else {
        window.close();
      }
    },
  });
  handler.open();
</script>
</body></html>`;

    return reply.type("text/html").send(html);
  });

  // Success callback page
  app.get("/open-banking/callback", async (request, reply) => {
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bank Connected - MileClear</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #030712; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
  .container { text-align: center; max-width: 400px; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #10b981; }
  p { color: #9ca3af; font-size: 15px; margin-bottom: 24px; }
</style>
</head><body>
<div class="container">
  <h1>Bank Connected Successfully</h1>
  <p>You can close this window and return to the MileClear app.</p>
</div>
</body></html>`;

    return reply.type("text/html").send(html);
  });
}
