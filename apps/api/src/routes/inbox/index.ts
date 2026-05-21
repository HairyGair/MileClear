// Bank-transaction inbox routes (Phase 1 of the "Money Picture" stack,
// 22 May 2026).
//
// TrueLayer feeds raw transactions into `bank_transactions`. This module
// gives the mobile + web UIs a way to triage them: list pending rows,
// accept into Earnings or Expenses, or ignore.
//
//   GET    /inbox                    — paginated pending transactions
//   GET    /inbox/count              — pending count for badge / nudges
//   POST   /inbox/:id/accept         — body decides: earning | expense
//   POST   /inbox/:id/ignore         — dismiss without creating anything
//
// Pro-gated end-to-end because the upstream bank feed is Pro.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { EXPENSE_CATEGORIES, GIG_PLATFORMS } from "@mileclear/shared";
import { logEvent } from "../../services/appEvents.js";

const expenseCategoryValues = EXPENSE_CATEGORIES.map((c) => c.value) as [
  string,
  ...string[]
];
const platformValues = GIG_PLATFORMS.map((p) => p.value) as [string, ...string[]];

const acceptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("earning"),
    platform: z.enum(platformValues),
    /** Override the amount if the user wants to (e.g. tip split). Defaults
     *  to the bank_transaction amount. */
    amountPenceOverride: z.number().int().positive().optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("expense"),
    category: z.enum(expenseCategoryValues),
    amountPenceOverride: z.number().int().positive().optional(),
    description: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
    vehicleId: z.string().uuid().optional(),
  }),
]);

export async function inboxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", premiumMiddleware);

  // ── GET /inbox — list pending bank transactions ───────────────────
  app.get("/", async (request, reply) => {
    const { page, pageSize } = request.query as {
      page?: string;
      pageSize?: string;
    };
    const userId = request.userId!;
    const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize || "30", 10) || 30));
    const skip = (pageNum - 1) * size;

    const [data, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { userId, status: "pending" },
        orderBy: { transactionDate: "desc" },
        skip,
        take: size,
      }),
      prisma.bankTransaction.count({
        where: { userId, status: "pending" },
      }),
    ]);

    return reply.send({
      data,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    });
  });

  // ── GET /inbox/count — for the AvatarDropdown badge ───────────────
  app.get("/count", async (request, reply) => {
    const userId = request.userId!;
    const count = await prisma.bankTransaction.count({
      where: { userId, status: "pending" },
    });
    return reply.send({ data: { count } });
  });

  // ── POST /inbox/:id/accept — promote into Earning OR Expense ──────
  app.post("/:id/accept", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = acceptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const userId = request.userId!;

    const txn = await prisma.bankTransaction.findFirst({
      where: { id, userId, status: "pending" },
    });
    if (!txn) {
      return reply.status(404).send({ error: "Transaction not found or already resolved" });
    }

    // Absolute amount in pence — bank_transaction stores signed, but
    // Earning + Expense both store unsigned (positive integer pence).
    const absPence = Math.abs(txn.amountPence);
    const usePence = parsed.data.amountPenceOverride ?? absPence;

    if (parsed.data.kind === "earning") {
      const earning = await prisma.earning.create({
        data: {
          userId,
          platform: parsed.data.platform,
          amountPence: usePence,
          periodStart: txn.transactionDate,
          periodEnd: txn.transactionDate,
          source: "open_banking",
          // Suffix to avoid collision with the auto-import unique-key path
          // (a CREDIT can only be auto-promoted OR manually accepted, not
          // both, so suffixing the inbox path keeps the constraint clean).
          externalId: `inbox:${txn.externalId}`,
          notes: parsed.data.notes ?? null,
        },
        select: { id: true },
      });
      await prisma.bankTransaction.update({
        where: { id: txn.id },
        data: {
          status: "accepted",
          resolvedEarningId: earning.id,
          reviewedAt: new Date(),
        },
      });
      logEvent("inbox.accepted_earning", userId, {
        bankTransactionId: txn.id,
        platform: parsed.data.platform,
      });
      return reply.send({ data: { ok: true, earningId: earning.id } });
    }

    // kind === "expense"
    if (parsed.data.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: parsed.data.vehicleId, userId },
        select: { id: true },
      });
      if (!vehicle) {
        return reply.status(400).send({ error: "Vehicle not found" });
      }
    }
    const expense = await prisma.expense.create({
      data: {
        userId,
        vehicleId: parsed.data.vehicleId ?? null,
        category: parsed.data.category,
        amountPence: usePence,
        date: txn.transactionDate,
        vendor: txn.merchant,
        description: parsed.data.description ?? null,
        notes: parsed.data.notes ?? null,
      },
      select: { id: true },
    });
    await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: {
        status: "accepted",
        resolvedExpenseId: expense.id,
        reviewedAt: new Date(),
      },
    });
    logEvent("inbox.accepted_expense", userId, {
      bankTransactionId: txn.id,
      category: parsed.data.category,
    });
    return reply.send({ data: { ok: true, expenseId: expense.id } });
  });

  // ── POST /inbox/:id/ignore — dismiss without resolving ────────────
  app.post("/:id/ignore", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;
    const txn = await prisma.bankTransaction.findFirst({
      where: { id, userId, status: "pending" },
    });
    if (!txn) {
      return reply.status(404).send({ error: "Transaction not found or already resolved" });
    }
    await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: { status: "ignored", reviewedAt: new Date() },
    });
    logEvent("inbox.ignored", userId, {
      bankTransactionId: txn.id,
      merchant: txn.merchant,
    });
    return reply.send({ data: { ok: true } });
  });
}
