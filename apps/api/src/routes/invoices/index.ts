// Sole-trader invoice tracker — Laura Joyce request, shipped 10 May 2026.
//
// Deliberate scope: simple list + paid/unpaid status. NOT a collections
// workflow. Late-payment-act interest, formal letters, and statutory
// compensation calculations were considered but rejected after user
// feedback ("no idea what that is"). Users hand the list off to their
// accountant; the app keeps it tidy.
//
// Tax basis interaction:
//   - cash basis (default, most gig drivers): Tax Readiness counts
//     invoices when paidAt is set
//   - accruals: Tax Readiness counts invoices when sent regardless of
//     payment
// Toggle on User.taxBasis; logic lives in the Tax Readiness aggregator.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";

const INVOICE_STATUSES = ["sent", "paid", "overdue", "written_off"] as const;
type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Compute the canonical status of an invoice from its date fields.
 * Server-of-truth — clients never set status directly, only paidAt /
 * dueAt. Keeps a tri-state UI (sent / overdue / paid) without the user
 * having to maintain it manually.
 */
function computeStatus(args: {
  paidAt: Date | null;
  dueAt: Date;
  writtenOff?: boolean;
}): InvoiceStatus {
  if (args.writtenOff) return "written_off";
  if (args.paidAt) return "paid";
  if (args.dueAt < new Date()) return "overdue";
  return "sent";
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const createSchema = z.object({
  company: z.string().min(1).max(200),
  reference: z.string().max(80).optional().nullable(),
  amountPence: z.number().int().min(1).max(1_000_000_000),
  sentAt: isoDate,
  /** Optional — defaults to sentAt + 30 days. */
  dueAt: isoDate.optional(),
  paidAt: isoDate.nullable().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateSchema = z.object({
  company: z.string().min(1).max(200).optional(),
  reference: z.string().max(80).nullable().optional(),
  amountPence: z.number().int().min(1).max(1_000_000_000).optional(),
  sentAt: isoDate.optional(),
  dueAt: isoDate.optional(),
  paidAt: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  writeOff: z.boolean().optional(),
});

const listQuery = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function invoiceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // POST /invoices — create
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const data = parsed.data;
    const userId = request.userId!;

    const sentAt = new Date(`${data.sentAt}T00:00:00.000Z`);

    // Free-tier cap: 3 invoices per calendar month (counted by sentAt).
    // Pro users unlimited. We pick sentAt rather than createdAt so back-
    // dating doesn't sneak past the cap — and so a user who genuinely
    // sends 3 invoices in May can't be blocked in June just because
    // they entered them all on the same day.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        premiumExpiresAt: true,
      },
    });
    const premiumActive =
      user?.isPremium && (!user.premiumExpiresAt || user.premiumExpiresAt > new Date());

    if (!premiumActive) {
      const monthStart = new Date(Date.UTC(sentAt.getUTCFullYear(), sentAt.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(sentAt.getUTCFullYear(), sentAt.getUTCMonth() + 1, 1));
      const monthCount = await prisma.invoice.count({
        where: {
          userId,
          sentAt: { gte: monthStart, lt: monthEnd },
        },
      });

      if (monthCount >= 3) {
        return reply.status(402).send({
          error: {
            code: "PREMIUM_REQUIRED",
            message: "Free plan tracks 3 invoices per month. Upgrade to Pro for unlimited.",
            hint: "Unlimited invoice tracking with Pro — £4.99/month.",
            feature: "invoice_tracker",
            retryable: false,
          },
        });
      }
    }

    // Default due-by: 30 days after sent. Matches the Late Payment of
    // Commercial Debts Act default — even though we don't surface the
    // legal helper, the date is the same default UK accounting uses.
    const dueAt = data.dueAt
      ? new Date(`${data.dueAt}T00:00:00.000Z`)
      : new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const paidAt = data.paidAt ? new Date(`${data.paidAt}T00:00:00.000Z`) : null;

    const status = computeStatus({ paidAt, dueAt });

    const invoice = await prisma.invoice.create({
      data: {
        userId,
        company: data.company,
        reference: data.reference ?? null,
        amountPence: data.amountPence,
        sentAt,
        dueAt,
        paidAt,
        status,
        notes: data.notes ?? null,
      },
    });

    logEvent("invoice.created", userId, {
      invoiceId: invoice.id,
      amountPence: invoice.amountPence,
      company: invoice.company,
    });

    return reply.status(201).send({ data: invoice });
  });

  // GET /invoices — list (paginated)
  app.get("/", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { status, page, pageSize } = parsed.data;
    const userId = request.userId!;

    // Refresh status for any "sent" invoices that have crossed dueAt
    // since we last looked. Cheap to do inline: bounded by the user's
    // own pending invoice count and only updates rows where status is
    // genuinely stale.
    await prisma.invoice.updateMany({
      where: { userId, status: "sent", dueAt: { lt: new Date() }, paidAt: null },
      data: { status: "overdue" },
    });

    const where = {
      userId,
      ...(status ? { status } : {}),
    };

    const [data, total, totals] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: [{ status: "asc" }, { sentAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.invoice.count({ where: { userId } }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { userId },
        _sum: { amountPence: true },
        _count: { id: true },
      }),
    ]);

    const summary: Record<string, { count: number; totalPence: number }> = {
      sent: { count: 0, totalPence: 0 },
      paid: { count: 0, totalPence: 0 },
      overdue: { count: 0, totalPence: 0 },
      written_off: { count: 0, totalPence: 0 },
    };
    for (const t of totals) {
      if (summary[t.status]) {
        summary[t.status].count = t._count.id;
        summary[t.status].totalPence = t._sum.amountPence ?? 0;
      }
    }

    return reply.send({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary,
    });
  });

  // GET /invoices/:id
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!invoice) return reply.status(404).send({ error: "Invoice not found" });
    return reply.send({ data: invoice });
  });

  // PATCH /invoices/:id — edit or mark paid
  app.patch("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const existing = await prisma.invoice.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) return reply.status(404).send({ error: "Invoice not found" });

    const updates = parsed.data;
    const newSentAt = updates.sentAt ? new Date(`${updates.sentAt}T00:00:00.000Z`) : existing.sentAt;
    const newDueAt = updates.dueAt ? new Date(`${updates.dueAt}T00:00:00.000Z`) : existing.dueAt;
    // paidAt: null clears it, undefined keeps existing, set value updates
    let newPaidAt: Date | null = existing.paidAt;
    if (updates.paidAt === null) newPaidAt = null;
    else if (typeof updates.paidAt === "string") newPaidAt = new Date(`${updates.paidAt}T00:00:00.000Z`);

    const status = computeStatus({
      paidAt: newPaidAt,
      dueAt: newDueAt,
      writtenOff: updates.writeOff ?? existing.status === "written_off",
    });

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...(updates.company !== undefined && { company: updates.company }),
        ...(updates.reference !== undefined && { reference: updates.reference }),
        ...(updates.amountPence !== undefined && { amountPence: updates.amountPence }),
        sentAt: newSentAt,
        dueAt: newDueAt,
        paidAt: newPaidAt,
        status,
        ...(updates.notes !== undefined && { notes: updates.notes }),
      },
    });

    // Telemetry: payment events get their own type so we can spot the
    // user-flow moment ("just marked an invoice paid") in analytics.
    if (!existing.paidAt && updated.paidAt) {
      logEvent("invoice.marked_paid", request.userId!, {
        invoiceId: id,
        amountPence: updated.amountPence,
        daysToPay: Math.round(
          (updated.paidAt.getTime() - updated.sentAt.getTime()) / 86_400_000
        ),
      });
    } else if (updates.writeOff && existing.status !== "written_off") {
      logEvent("invoice.written_off", request.userId!, {
        invoiceId: id,
        amountPence: updated.amountPence,
      });
    }

    return reply.send({ data: updated });
  });

  // DELETE /invoices/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.invoice.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) return reply.status(404).send({ error: "Invoice not found" });

    await prisma.invoice.delete({ where: { id } });
    logEvent("invoice.deleted", request.userId!, { invoiceId: id });
    return reply.send({ data: { deleted: true } });
  });
}
