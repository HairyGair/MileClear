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

// Duplicate-detection window for the "you might have already logged this
// as a manual earning" prompt that fires when an invoice flips to paid.
// 50p tolerance handles VAT / rounding fuzz on small invoices; 14 days
// either side of paidAt covers "I logged the earning when the work
// happened, but the invoice took two weeks to pay". Wider windows turned
// up too many false positives on Laura's data.
const DUPLICATE_AMOUNT_TOLERANCE_PENCE = 50;
const DUPLICATE_DAYS_WINDOW = 14;

/**
 * Find manual earnings that look like they might already represent the
 * money on this invoice — within ±50p and ±14 days of the invoice's
 * paid (or sent, if not yet paid) date.
 *
 * Excludes earnings already linked to another invoice. Also excludes
 * earnings already linked to THIS invoice (they're already counted
 * once and we don't want to surface them as a "match" the user could
 * re-link).
 *
 * Returns up to 10 matches so a sole trader who tracks daily can roll
 * up a week of entries into one invoice (Laura's case). Sort: closest
 * date first since multi-day rollups are date-clustered rather than
 * amount-clustered.
 */
async function findPotentialEarningMatches(args: {
  userId: string;
  invoiceId: string;
  amountPence: number;
  anchorDate: Date;
}): Promise<
  Array<{
    id: string;
    platform: string;
    amountPence: number;
    periodStart: string;
    notes: string | null;
    daysFromAnchor: number;
  }>
> {
  const { userId, invoiceId, amountPence, anchorDate } = args;
  const windowMs = DUPLICATE_DAYS_WINDOW * 24 * 60 * 60 * 1000;
  const windowStart = new Date(anchorDate.getTime() - windowMs);
  const windowEnd = new Date(anchorDate.getTime() + windowMs);

  const candidates = await prisma.earning.findMany({
    where: {
      userId,
      periodStart: { gte: windowStart, lte: windowEnd },
      amountPence: {
        gte: amountPence - DUPLICATE_AMOUNT_TOLERANCE_PENCE,
        lte: amountPence + DUPLICATE_AMOUNT_TOLERANCE_PENCE,
      },
      // Exclude anything already linked to any invoice — once linked
      // we don't re-surface it.
      replacedByInvoiceId: null,
    },
    select: {
      id: true,
      platform: true,
      amountPence: true,
      periodStart: true,
      notes: true,
    },
  });
  // invoiceId arg is reserved for symmetry with the link/unlink flow;
  // candidates are already filtered to unlinked rows so we never need
  // to exclude rows pointing at the current invoice.
  void invoiceId;

  return candidates
    .map((c) => ({
      id: c.id,
      platform: c.platform,
      amountPence: c.amountPence,
      periodStart: c.periodStart.toISOString().slice(0, 10),
      notes: c.notes,
      daysFromAnchor: Math.round(
        (c.periodStart.getTime() - anchorDate.getTime()) / 86_400_000
      ),
    }))
    .sort(
      // Closest date first — multi-day rollups cluster on date, not
      // amount. Tie-break by amount proximity.
      (a, b) => {
        const dateDelta = Math.abs(a.daysFromAnchor) - Math.abs(b.daysFromAnchor);
        if (dateDelta !== 0) return dateDelta;
        return (
          Math.abs(a.amountPence - amountPence) -
          Math.abs(b.amountPence - amountPence)
        );
      }
    )
    .slice(0, 10);
}

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

    // If the invoice was created directly as paid, look for duplicate
    // earnings so the client can prompt the user to link them. We anchor
    // on paidAt (when the money arrived), falling back to sentAt for the
    // accruals-basis edge case where a user pre-records future income.
    const potentialEarningMatches = paidAt
      ? await findPotentialEarningMatches({
          userId,
          invoiceId: invoice.id,
          amountPence: invoice.amountPence,
          anchorDate: paidAt,
        })
      : [];

    return reply.status(201).send({
      data: invoice,
      potentialEarningMatches,
    });
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
    const justMarkedPaid = !existing.paidAt && updated.paidAt;
    if (justMarkedPaid) {
      logEvent("invoice.marked_paid", request.userId!, {
        invoiceId: id,
        amountPence: updated.amountPence,
        daysToPay: Math.round(
          (updated.paidAt!.getTime() - updated.sentAt.getTime()) / 86_400_000
        ),
      });
    } else if (updates.writeOff && existing.status !== "written_off") {
      logEvent("invoice.written_off", request.userId!, {
        invoiceId: id,
        amountPence: updated.amountPence,
      });
    }

    // Surface duplicate-earning candidates only on the transition to
    // paid. We deliberately skip this on amount/date edits to avoid
    // re-nagging the user about something they've already resolved.
    // The current linkedEarningId is excluded so the user isn't shown
    // a match they already chose.
    const potentialEarningMatches = justMarkedPaid
      ? await findPotentialEarningMatches({
          userId: request.userId!,
          invoiceId: updated.id,
          amountPence: updated.amountPence,
          anchorDate: updated.paidAt!,
        })
      : [];

    return reply.send({
      data: updated,
      potentialEarningMatches,
    });
  });

  // POST /invoices/:id/link-earning — link one or more manual earnings
  // to a paid invoice. Many earnings can point at one invoice (Laura's
  // case: 7 daily £57.14 entries → single £400 invoice). Once linked,
  // the Tax Readiness aggregator counts the invoice and skips the
  // earnings. Anti-duplicate flow (Laura Joyce, 21 May 2026).
  //
  // Accepts either `earningId` (single) or `earningIds` (array) — the
  // client uses single for one-at-a-time taps in the link sheet and
  // array for batch from a settings flow.
  app.post("/:id/link-earning", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        earningId: z.string().uuid().optional(),
        earningIds: z.array(z.string().uuid()).optional(),
      })
      .refine((v) => v.earningId || (v.earningIds && v.earningIds.length > 0), {
        message: "earningId or earningIds is required",
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "earningId or earningIds is required" });
    }
    const earningIds = body.data.earningId
      ? [body.data.earningId]
      : body.data.earningIds!;

    // Both sides must belong to the caller.
    const [invoice, earnings] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id, userId: request.userId! },
      }),
      prisma.earning.findMany({
        where: { id: { in: earningIds }, userId: request.userId! },
      }),
    ]);
    if (!invoice) return reply.status(404).send({ error: "Invoice not found" });
    if (earnings.length !== earningIds.length) {
      return reply.status(404).send({ error: "One or more earnings not found" });
    }

    await prisma.earning.updateMany({
      where: { id: { in: earningIds }, userId: request.userId! },
      data: { replacedByInvoiceId: id },
    });

    logEvent("invoice.linked_earning", request.userId!, {
      invoiceId: id,
      earningIds,
      count: earningIds.length,
      amountPence: invoice.amountPence,
    });

    return reply.send({
      data: { invoiceId: id, linkedEarningIds: earningIds },
    });
  });

  // POST /invoices/:id/unlink-earning — clear one or all earning links
  // from an invoice. Without args, clears every earning that points at
  // this invoice. With an `earningId`, clears only that one.
  app.post("/:id/unlink-earning", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ earningId: z.string().uuid().optional() })
      .safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const existing = await prisma.invoice.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) return reply.status(404).send({ error: "Invoice not found" });

    const where = body.data.earningId
      ? { id: body.data.earningId, userId: request.userId!, replacedByInvoiceId: id }
      : { userId: request.userId!, replacedByInvoiceId: id };

    const result = await prisma.earning.updateMany({
      where,
      data: { replacedByInvoiceId: null },
    });

    logEvent("invoice.unlinked_earning", request.userId!, {
      invoiceId: id,
      cleared: result.count,
    });
    return reply.send({ data: { invoiceId: id, cleared: result.count } });
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
