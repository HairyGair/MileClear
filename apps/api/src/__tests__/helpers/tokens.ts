/**
 * Token helpers for use in tests.
 *
 * These functions generate real JWT tokens signed with the test secrets defined
 * in vitest.config.ts (process.env.JWT_SECRET / JWT_REFRESH_SECRET).  The auth
 * middleware in the application verifies using the same env var, so tokens
 * generated here are accepted by routes under test.
 */
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

/** Generate a valid access token for the given userId. */
export function makeAccessToken(userId: string, isAdmin = false): string {
  return jwt.sign({ userId, isAdmin }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

/** Generate a valid refresh token for the given userId. */
export function makeRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: "30d",
  });
}

/** Generate a token that has already expired (for rejection tests). */
export function makeExpiredAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: -1, // Immediately expired
  });
}
