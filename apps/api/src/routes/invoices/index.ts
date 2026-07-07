// Sole-trader invoice tracker — Laura Joyce request, shipped 10 May 2026.
//
// Scope has grown deliberately in stages (Get Paid, Jul 2026):
//   - Tracker (May 2026): simple list + paid/unpaid status.
//   - Chase draft (5 Jul): pre-filled mailto in the user's own mail app,
//     statutory-interest wording from the shared template.
//   - Builder (6 Jul): clients, line items, VAT, numbering, branded PDF.
//   - Send (7 Jul): POST /:id/send emails the PDF to the client at the
//     user's explicit request — transactional one-to-one correspondence,
//     Reply-To the user, never marketing-gated. Auto-chase is the
//     scheduled version (jobs/invoices.ts).
//
// Tax basis interaction:
//   - cash basis (default, most gig drivers): Tax Readiness counts
//     invoices when paidAt is set
//   - accruals: Tax Readiness counts invoices when sent regardless of
//     payment
// Toggle on User.taxBasis; logic lives in the Tax Readiness aggregator.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { resolvePremiumStatus } from "../../services/referral.js";
import {
  INVOICE_STATUSES,
  computeStatus,
  findPotentialEarningMatches,
  allocateInvoiceNumber,
  ensureInvoiceNumber,
} from "../../services/invoices.js";
import { computeInvoiceTotals, invoiceChaseStages } from "@mileclear/shared";
import { generateInvoicePdf } from "../../services/export.js";
import { sendInvoiceEmail } from "../../services/email.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// Client email: full RFC validation is overkill for a pre-addressed
// draft — accept anything that looks like an address, treat "" as null.
const clientEmailField = z
  .string()
  .max(255)
  .email("Client email doesn't look like an email address")
  .or(z.literal(""))
  .nullable()
  .optional()
  // "" → null (clear), but ABSENT stays undefined so PATCHes that don't
  // touch the field don't wipe it.
  .transform((v) => (v === undefined ? undefined : v || null));

// Invoice builder (Get Paid, Jul 2026): optional line items + optional VAT.
// Totals contract — the server recomputes, never trusts client totals:
//   - lineItems present:     subtotal = Σ round(qty × unitPrice); any client
//                            amountPence is ignored.
//   - no lines, vatRate set: amountPence is treated as the NET subtotal and
//                            VAT is added on top.
//   - no lines, no vatRate:  legacy — amountPence stored as-is (gross).
const lineItemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive().max(100_000),
  unitPricePence: z.number().int().min(0).max(1_000_000_000),
});

const vatRateField = z
  .union([z.literal(20), z.literal(5), z.literal(0)])
  .nullable()
  .optional();

const createSchema = z
  .object({
    company: z.string().min(1).max(200).optional(),
    clientId: z.string().uuid().nullable().optional(),
    clientEmail: clientEmailField,
    reference: z.string().max(80).optional().nullable(),
    amountPence: z.number().int().min(1).max(1_000_000_000).optional(),
    lineItems: z.array(lineItemSchema).max(50).optional(),
    vatRate: vatRateField,
    sentAt: isoDate,
    /** Optional — defaults to sentAt + 30 days. */
    dueAt: isoDate.optional(),
    paidAt: isoDate.nullable().optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((v) => v.company || v.clientId, {
    message: "Who is the invoice to? Provide a company name or pick a client.",
  })
  .refine((v) => (v.lineItems && v.lineItems.length > 0) || v.amountPence, {
    message: "Enter an amount or add at least one line item.",
  });

const updateSchema = z.object({
  company: z.string().min(1).max(200).optional(),
  clientId: z.string().uuid().nullable().optional(),
  clientEmail: clientEmailField,
  reference: z.string().max(80).nullable().optional(),
  amountPence: z.number().int().min(1).max(1_000_000_000).optional(),
  /** Replace-all semantics: send the full array. Empty array clears the
   *  builder data and reverts to direct-amount entry. */
  lineItems: z.array(lineItemSchema).max(50).optional(),
  vatRate: vatRateField,
  sentAt: isoDate.optional(),
  dueAt: isoDate.optional(),
  paidAt: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  writeOff: z.boolean().optional(),
  /** Auto-chase opt-in (Pro). Enabling schedules the next reminder from
   *  the fixed stage list; disabling clears the schedule instantly. */
  autoChaseEnabled: z.boolean().optional(),
});

/** Verify a clientId belongs to the caller; returns the client row. */
async function requireOwnedClient(userId: string, clientId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, userId },
    select: { id: true, name: true, email: true },
  });
}

/** Resolve the stored totals triple from the contract above. */
function resolveTotals(args: {
  lineItems?: Array<z.infer<typeof lineItemSchema>>;
  vatRate: number | null;
  amountPence?: number;
}): {
  subtotalPence: number | null;
  vatPence: number | null;
  amountPence: number;
  lines: Array<z.infer<typeof lineItemSchema> & { totalPence: number }>;
} {
  const { lineItems, vatRate, amountPence } = args;
  if (lineItems && lineItems.length > 0) {
    const t = computeInvoiceTotals(lineItems, vatRate);
    return { subtotalPence: t.subtotalPence, vatPence: t.vatPence, amountPence: t.amountPence, lines: t.lines };
  }
  if (vatRate != null && amountPence != null) {
    const vatPence = Math.round((amountPence * vatRate) / 100);
    return { subtotalPence: amountPence, vatPence, amountPence: amountPence + vatPence, lines: [] };
  }
  return { subtotalPence: null, vatPence: null, amountPence: amountPence ?? 0, lines: [] };
}

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
    // Canonical premium check (resolvePremiumStatus) — the previous inline
    // isPremium/premiumExpiresAt test ignored referralProUntil, so users on
    // banked referral Pro months were wrongly capped (fixed Jul 2026).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        premiumExpiresAt: true,
        referralProUntil: true,
      },
    });
    const premiumActive = user ? resolvePremiumStatus(user).active : false;

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

    // Client-book link: verify ownership and snapshot the name into
    // `company` (the snapshot survives client edits/archival, so old
    // invoices keep saying who they were for).
    let clientId: string | null = null;
    let company = data.company ?? "";
    if (data.clientId) {
      const client = await requireOwnedClient(userId, data.clientId);
      if (!client) {
        return reply.status(400).send({ error: "Client not found" });
      }
      clientId = client.id;
      company = data.company || client.name;
    }

    // Default due-by: 30 days after sent. Matches the Late Payment of
    // Commercial Debts Act default — even though we don't surface the
    // legal helper, the date is the same default UK accounting uses.
    const dueAt = data.dueAt
      ? new Date(`${data.dueAt}T00:00:00.000Z`)
      : new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const paidAt = data.paidAt ? new Date(`${data.paidAt}T00:00:00.000Z`) : null;

    const status = computeStatus({ paidAt, dueAt });
    const totals = resolveTotals({
      lineItems: data.lineItems,
      vatRate: data.vatRate ?? null,
      amountPence: data.amountPence,
    });

    // Create in a transaction with the per-user number allocation. The
    // atomic counter is concurrency-safe; the unique(userId, invoiceNumber)
    // constraint is the backstop — retry once if two creates ever race.
    const createOnce = () =>
      prisma.$transaction(async (tx) => {
        const invoiceNumber = await allocateInvoiceNumber(tx, userId);
        const created = await tx.invoice.create({
          data: {
            userId,
            company,
            clientId,
            clientEmail: data.clientEmail ?? null,
            reference: data.reference ?? null,
            invoiceNumber,
            amountPence: totals.amountPence,
            subtotalPence: totals.subtotalPence,
            vatRate: totals.subtotalPence != null ? data.vatRate ?? null : null,
            vatPence: totals.vatPence,
            sentAt,
            dueAt,
            paidAt,
            status,
            notes: data.notes ?? null,
          },
        });
        if (totals.lines.length > 0) {
          await tx.invoiceLineItem.createMany({
            data: totals.lines.map((l, i) => ({
              invoiceId: created.id,
              position: i,
              description: l.description,
              quantity: l.quantity,
              unitPricePence: l.unitPricePence,
              totalPence: l.totalPence,
            })),
          });
        }
        return created;
      });

    let invoice;
    try {
      invoice = await createOnce();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        invoice = await createOnce();
      } else {
        throw err;
      }
    }

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
      include: {
        lineItems: { orderBy: { position: "asc" } },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postcode: true,
          },
        },
      },
    });
    if (!invoice) return reply.status(404).send({ error: "Invoice not found" });
    return reply.send({ data: invoice });
  });

  // GET /invoices/:id/pdf — branded invoice PDF (Pro).
  // The invoices plugin can't be premium-gated wholesale (tracking is
  // free), so the check is per-route via the canonical helper.
  app.get("/:id/pdf", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, premiumExpiresAt: true, referralProUntil: true },
    });
    if (!user || !resolvePremiumStatus(user).active) {
      return reply.status(402).send({
        error: {
          code: "PREMIUM_REQUIRED",
          message: "Branded invoice PDFs are a Pro feature.",
          hint: "Generate professional invoices with your logo — £4.99/month.",
          feature: "invoice_pdf",
          retryable: false,
        },
      });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!invoice) return reply.status(404).send({ error: "Invoice not found" });

    const { buffer, filename } = await generateInvoicePdf(userId, id);
    logEvent("invoice.pdf_generated", userId, { invoiceId: id });
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buffer);
  });

  // POST /invoices/:id/send — email the branded PDF to the client (Pro).
  // Transactional one-to-one correspondence at the user's request: never
  // gated on marketing consent, Reply-To is the user.
  app.post("/:id/send", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        fullName: true,
        tradingName: true,
        isPremium: true,
        premiumExpiresAt: true,
        referralProUntil: true,
      },
    });
    if (!user || !resolvePremiumStatus(user).active) {
      return reply.status(402).send({
        error: {
          code: "PREMIUM_REQUIRED",
          message: "Sending invoices by email is a Pro feature.",
          hint: "Send branded invoices straight to your clients — £4.99/month.",
          feature: "invoice_send",
          retryable: false,
        },
      });
    }

    // A dead Reply-To silently eats every client reply — worse than
    // blocking. Placeholder addresses can't receive mail.
    if (user.email.endsWith("@private.mileclear.com")) {
      return reply.status(400).send({
        error:
          "Add a real email address to your account first — your client's replies would go nowhere. You can change it in Settings → Profile.",
      });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId },
      include: { client: { select: { email: true } } },
    });
    if (!invoice) return reply.status(404).send({ error: "Invoice not found" });

    const toEmail = invoice.clientEmail ?? invoice.client?.email ?? null;
    if (!toEmail) {
      return reply.status(400).send({
        error: "Add a client email first — edit the invoice or the saved client.",
      });
    }

    // Resend cooldown: 10 minutes between successful sends per invoice.
    const recent = await prisma.invoiceEmail.findFirst({
      where: {
        invoiceId: id,
        kind: "send",
        status: "sent",
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return reply.status(409).send({
        error: "This invoice was emailed in the last few minutes — give it a moment before resending.",
        lastSentAt: recent.createdAt,
      });
    }

    const invoiceNumber = await ensureInvoiceNumber(invoice);
    const { buffer } = await generateInvoicePdf(userId, id);

    try {
      const { subject } = await sendInvoiceEmail({
        user,
        invoice: {
          company: invoice.company,
          invoiceNumber,
          amountPence: invoice.amountPence,
          sentAt: invoice.sentAt,
          dueAt: invoice.dueAt,
          reference: invoice.reference,
        },
        toEmail,
        pdf: buffer,
        kind: "send",
      });
      const emailedAt = new Date();
      await prisma.$transaction([
        prisma.invoiceEmail.create({
          data: { invoiceId: id, userId, kind: "send", toEmail, subject, status: "sent" },
        }),
        prisma.invoice.update({ where: { id }, data: { emailedAt } }),
      ]);
      logEvent("invoice.emailed", userId, { invoiceId: id, toEmail });
      return reply.send({ data: { sent: true, toEmail, emailedAt } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      await prisma.invoiceEmail.create({
        data: {
          invoiceId: id,
          userId,
          kind: "send",
          toEmail,
          subject: `Invoice send failed`,
          status: "failed",
          error: message.slice(0, 500),
        },
      });
      request.log.error({ err, invoiceId: id }, "invoice send failed");
      return reply.status(502).send({
        error: "The email couldn't be sent — try again in a few minutes.",
      });
    }
  });

  // GET /invoices/:id/emails — send + chase history for the detail UI.
  app.get("/:id/emails", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: request.userId! },
      select: { id: true },
    });
    if (!invoice) return reply.status(404).send({ error: "Invoice not found" });
    const emails = await prisma.invoiceEmail.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, kind: true, toEmail: true, subject: true, status: true, createdAt: true },
    });
    return reply.send({ data: emails });
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

    // Client-book link change: verify ownership; snapshot name into
    // company unless the caller sent an explicit company override.
    let clientPatch: { clientId?: string | null; company?: string } = {};
    if (updates.clientId === null) {
      clientPatch = { clientId: null };
    } else if (typeof updates.clientId === "string") {
      const client = await requireOwnedClient(request.userId!, updates.clientId);
      if (!client) return reply.status(400).send({ error: "Client not found" });
      clientPatch = {
        clientId: client.id,
        ...(updates.company === undefined && { company: client.name }),
      };
    }

    const status = computeStatus({
      paidAt: newPaidAt,
      dueAt: newDueAt,
      writtenOff: updates.writeOff ?? existing.status === "written_off",
    });

    // Auto-chase toggle (Pro). Enabling picks the first FUTURE stage of
    // the fixed schedule; an invoice past every stage gets the final
    // reminder queued for the next send window. Disabling clears state.
    let chasePatch: Prisma.InvoiceUncheckedUpdateInput = {};
    if (updates.autoChaseEnabled === true && !existing.autoChaseEnabled) {
      const chaseUser = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { isPremium: true, premiumExpiresAt: true, referralProUntil: true },
      });
      if (!chaseUser || !resolvePremiumStatus(chaseUser).active) {
        return reply.status(402).send({
          error: {
            code: "PREMIUM_REQUIRED",
            message: "Automatic payment chasing is a Pro feature.",
            hint: "MileClear chases late payers for you — £4.99/month.",
            feature: "invoice_chase",
            retryable: false,
          },
        });
      }
      const clientRow = existing.clientId
        ? await prisma.client.findUnique({ where: { id: existing.clientId }, select: { email: true } })
        : null;
      if (!(updates.clientEmail ?? existing.clientEmail ?? clientRow?.email)) {
        return reply.status(400).send({
          error: "Add a client email before turning on auto-chase.",
        });
      }
      const stages = invoiceChaseStages(newDueAt);
      const nextStage = stages.find((s) => s.at.getTime() > Date.now());
      chasePatch = {
        autoChaseEnabled: true,
        nextChaseAt: nextStage?.at ?? new Date(),
        chaseWarnedAt: null,
      };
    } else if (updates.autoChaseEnabled === false && existing.autoChaseEnabled) {
      chasePatch = { autoChaseEnabled: false, nextChaseAt: null, chaseWarnedAt: null };
    }

    // Totals recompute — only when a totals input actually changed, so
    // date-only or notes-only PATCHes never disturb stored amounts.
    const totalsTouched =
      updates.lineItems !== undefined ||
      updates.vatRate !== undefined ||
      updates.amountPence !== undefined;

    let totalsPatch: Prisma.InvoiceUncheckedUpdateInput = {};
    let newLines: ReturnType<typeof resolveTotals>["lines"] | null = null;
    if (totalsTouched) {
      const effectiveLines =
        updates.lineItems !== undefined
          ? updates.lineItems
          : (
              await prisma.invoiceLineItem.findMany({
                where: { invoiceId: id },
                orderBy: { position: "asc" },
              })
            ).map((l) => ({
              description: l.description,
              quantity: Number(l.quantity),
              unitPricePence: l.unitPricePence,
            }));
      const effectiveVatRate =
        updates.vatRate !== undefined ? updates.vatRate : existing.vatRate;
      // Direct-entry base: an explicit new amount, else the stored net
      // subtotal, else the legacy gross amount.
      const baseAmount =
        updates.amountPence ?? existing.subtotalPence ?? existing.amountPence;
      const totals = resolveTotals({
        lineItems: effectiveLines,
        vatRate: effectiveVatRate,
        amountPence: baseAmount,
      });
      totalsPatch = {
        amountPence: totals.amountPence,
        subtotalPence: totals.subtotalPence,
        vatRate: totals.subtotalPence != null ? effectiveVatRate : null,
        vatPence: totals.vatPence,
      };
      if (updates.lineItems !== undefined) newLines = totals.lines;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newLines !== null) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        if (newLines.length > 0) {
          await tx.invoiceLineItem.createMany({
            data: newLines.map((l, i) => ({
              invoiceId: id,
              position: i,
              description: l.description,
              quantity: l.quantity,
              unitPricePence: l.unitPricePence,
              totalPence: l.totalPence,
            })),
          });
        }
      }
      return tx.invoice.update({
        where: { id },
        data: {
          ...(updates.company !== undefined && { company: updates.company }),
          ...clientPatch,
          ...chasePatch,
          ...(updates.clientEmail !== undefined && { clientEmail: updates.clientEmail }),
          ...(updates.reference !== undefined && { reference: updates.reference }),
          ...totalsPatch,
          sentAt: newSentAt,
          dueAt: newDueAt,
          paidAt: newPaidAt,
          status,
          // Paid or written-off invoices never auto-chase.
          ...((newPaidAt || status === "written_off") && {
            nextChaseAt: null,
            chaseWarnedAt: null,
          }),
          ...(updates.notes !== undefined && { notes: updates.notes }),
        },
      });
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
