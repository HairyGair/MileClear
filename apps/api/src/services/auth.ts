import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { BCRYPT_SALT_ROUNDS } from "@mileclear/shared";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(userId: string, isAdmin: boolean = false): string {
  return jwt.sign({ userId, isAdmin }, process.env.JWT_SECRET!, { algorithm: "HS256", expiresIn: "15m" });
}

export function generateRefreshToken(userId: string): string {
  // jwtid makes every token unique. Without it the JWT is deterministic
  // (same userId + secret + second-granularity iat/exp → byte-identical
  // token), so two refreshes in the same second produced the same token
  // and the second insert hit the refresh_tokens_token_key unique
  // constraint → 500 (4 on 13 Jun 2026, the mobile app's concurrent
  // 401-then-refresh race). A random jti removes the collision entirely.
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, {
    algorithm: "HS256",
    expiresIn: "30d",
    jwtid: randomUUID(),
  });
}
