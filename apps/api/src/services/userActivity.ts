import { prisma } from "../lib/prisma.js";

export async function advanceLastTripAt(
  userId: string,
  tripStartedAt: Date,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE users
      SET lastTripAt = GREATEST(COALESCE(lastTripAt, '1970-01-01 00:00:00'), ${tripStartedAt})
      WHERE id = ${userId}
    `;
  } catch (err) {
    console.error("Failed to advance lastTripAt:", err);
  }
}
