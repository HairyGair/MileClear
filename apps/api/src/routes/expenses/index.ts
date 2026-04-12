import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import {
  EXPENSE_CATEGORIES,
  getTaxYear,
  parseTaxYear,
  estimateUkTax,
  calculateHmrcDeduction,
  formatPence,
} from "@mileclear/shared";

const expenseCategoryValues = EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]];

const createExpenseSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  category: z.enum(expenseCategoryValues),
  amountPence: z.number().int().min(1),
  date: z.string(),
  description: z.string().max(500).optional(),
  vendor: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const updateExpenseSchema = createExpenseSchema.partial();

export async function expenseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /expenses
  app.get("/", async (request, reply) => {
    const { page, pageSize, category, from, to } = request.query as {
      page?: string;
      pageSize?: string;
      category?: string;
      from?: string;
      to?: string;
    };

    const userId = request.userId!;
    const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize || "20", 10) || 20));
    const skip = (pageNum - 1) * size;

    const where: Record<string, unknown> = { userId };
    if (category) where.category = category;
    if (from || to) {
      where.date = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: size,
        include: {
          vehicle: { select: { id: true, make: true, model: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    return reply.send({
      data,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    });
  });

  // POST /expenses
  app.post("/", async (request, reply) => {
    const parsed = createExpenseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = parsed.data;

    if (data.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: data.vehicleId, userId },
        select: { id: true },
      });
      if (!vehicle) {
        return reply.status(400).send({ error: "Vehicle not found" });
      }
    }

    const expense = await prisma.expense.create({
      data: {
        userId,
        vehicleId: data.vehicleId ?? null,
        category: data.category,
        amountPence: data.amountPence,
        date: new Date(data.date),
        description: data.description ?? null,
        vendor: data.vendor ?? null,
        notes: data.notes ?? null,
      },
      include: {
        vehicle: { select: { id: true, make: true, model: true } },
      },
    });

    return reply.status(201).send({ data: expense });
  });

  // PATCH /expenses/:id
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateExpenseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const existing = await prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Expense not found" });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.amountPence !== undefined) updateData.amountPence = parsed.data.amountPence;
    if (parsed.data.date !== undefined) updateData.date = new Date(parsed.data.date);
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.vendor !== undefined) updateData.vendor = parsed.data.vendor;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.vehicleId !== undefined) updateData.vehicleId = parsed.data.vehicleId;

    const updated = await prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        vehicle: { select: { id: true, make: true, model: true } },
      },
    });

    return reply.send({ data: updated });
  });

  // DELETE /expenses/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;

    const existing = await prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Expense not found" });
    }

    await prisma.expense.delete({ where: { id } });
    return reply.send({ message: "Deleted" });
  });

  // GET /expenses/summary?taxYear=2025-26
  app.get("/summary", async (request, reply) => {
    const userId = request.userId!;
    const { taxYear } = request.query as { taxYear?: string };
    const ty = taxYear || getTaxYear(new Date());
    const { start, end } = parseTaxYear(ty);

    const expenses = await prisma.expense.groupBy({
      by: ["category"],
      where: {
        userId,
        date: { gte: start, lt: end },
      },
      _sum: { amountPence: true },
      _count: { _all: true },
    });

    const categoryMap = new Map<string, typeof EXPENSE_CATEGORIES[number]>(EXPENSE_CATEGORIES.map((c) => [c.value, c]));
    const result = expenses.map((row) => ({
      category: row.category,
      totalPence: row._sum.amountPence ?? 0,
      count: row._count._all,
      deductibleWithMileage: categoryMap.get(row.category)?.deductibleWithMileage ?? false,
    }));

    return reply.send({ data: result, taxYear: ty });
  });

  // GET /expenses/tax-estimate?taxYear=2025-26
  app.get("/tax-estimate", async (request, reply) => {
    const userId = request.userId!;
    const { taxYear } = request.query as { taxYear?: string };
    const ty = taxYear || getTaxYear(new Date());
    const { start, end } = parseTaxYear(ty);

    const [earningsAgg, expenseRows, mileageSummaries] = await Promise.all([
      prisma.earning.aggregate({
        where: { userId, periodStart: { gte: start, lt: end } },
        _sum: { amountPence: true },
      }),
      prisma.expense.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { category: true, amountPence: true },
      }),
      prisma.mileageSummary.findMany({
        where: { userId, taxYear: ty },
      }),
    ]);

    const grossEarningsPence = earningsAgg._sum?.amountPence ?? 0;

    // HMRC mileage deduction from stored summaries
    const mileageDeductionPence = mileageSummaries.reduce((s, m) => s + m.deductionPence, 0);

    // Split expenses by deductibility
    const categoryMap = new Map<string, typeof EXPENSE_CATEGORIES[number]>(EXPENSE_CATEGORIES.map((c) => [c.value, c]));
    let allowableExpensesPence = 0;
    let vehicleExpensesPence = 0;
    const byCat: Record<string, { totalPence: number; count: number; deductible: boolean }> = {};

    for (const exp of expenseRows) {
      const cat = categoryMap.get(exp.category);
      const deductible = cat?.deductibleWithMileage ?? false;
      if (deductible) {
        allowableExpensesPence += exp.amountPence;
      } else {
        vehicleExpensesPence += exp.amountPence;
      }
      if (!byCat[exp.category]) byCat[exp.category] = { totalPence: 0, count: 0, deductible };
      byCat[exp.category].totalPence += exp.amountPence;
      byCat[exp.category].count++;
    }

    // Taxable profit = gross earnings - mileage deduction - allowable expenses
    // (Vehicle expenses are shown but NOT deducted when using mileage allowance)
    const taxableProfitPence = Math.max(0,
      grossEarningsPence - mileageDeductionPence - allowableExpensesPence
    );

    const { incomeTaxPence, class2NiPence, class4NiPence } = estimateUkTax(taxableProfitPence);
    const totalTaxOwedPence = incomeTaxPence + class2NiPence + class4NiPence;
    const effectiveRatePercent = grossEarningsPence > 0
      ? Math.round((totalTaxOwedPence / grossEarningsPence) * 1000) / 10
      : 0;

    const expensesByCategory = Object.entries(byCat).map(([cat, data]) => ({
      category: cat,
      totalPence: data.totalPence,
      count: data.count,
      deductibleWithMileage: data.deductible,
    }));

    return reply.send({
      data: {
        taxYear: ty,
        grossEarningsPence,
        mileageDeductionPence,
        allowableExpensesPence,
        vehicleExpensesPence,
        taxableProfitPence,
        incomeTaxPence,
        class2NiPence,
        class4NiPence,
        totalTaxOwedPence,
        effectiveRatePercent,
        expensesByCategory,
      },
    });
  });
}
