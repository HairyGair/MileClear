import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { sendVerificationEmail } from "./email.js";

/** Six-digit email code. */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Codes last 10 minutes. */
export function otpExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000);
}

/**
 * Replace any unused codes for this driver with a fresh one and email it.
 * Used after an email change (5 Oct 2026): the profile screen said "please
 * verify your new email address" but nothing was sent until the driver asked.
 */
export async function issueVerificationCode(userId: string, email: string): Promise<void> {
  await prisma.verificationCode.updateMany({ where: { userId, used: false }, data: { used: true } });
  const code = generateOtp();
  await prisma.verificationCode.create({ data: { userId, code, expiresAt: otpExpiry() } });
  await sendVerificationEmail(email, code);
}
