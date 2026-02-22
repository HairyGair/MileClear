import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

interface JwtPayload {
  userId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
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
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
