import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

interface JwtPayload {
  userId: string;
  isAdmin?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    isAdmin?: boolean;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid token" });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
      { algorithms: ["HS256"] }
    ) as JwtPayload;
    request.userId = decoded.userId;
    request.isAdmin = decoded.isAdmin ?? false;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}

export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return;

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
      { algorithms: ["HS256"] }
    ) as JwtPayload;
    request.userId = decoded.userId;
    request.isAdmin = decoded.isAdmin ?? false;
  } catch {
    /* proceed as anonymous */
  }
}
