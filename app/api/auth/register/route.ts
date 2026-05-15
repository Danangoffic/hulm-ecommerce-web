import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { registerSchema } from "@/lib/auth/validation";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { apiSuccess, apiError } from "@/lib/auth/response";
import type { Role } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed, remaining } = checkRateLimit(`register:${ip}`);
  if (!allowed) {
    return apiError("Too many requests. Please try again later.", 429);
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed.", 422, parsed.error.flatten().fieldErrors);
  }

  const { name, email, password } = parsed.data;

  // Check duplicate email
  const existing = await prisma.users.findFirst({ where: { email } });
  if (existing) {
    return apiError("Email already registered.", 409);
  }

  // Create user
  const password_hash = await hashPassword(password);
  const user = await prisma.users.create({
    data: { name, email, password_hash, role: "customer" },
    select: { id: true, name: true, email: true, role: true, created_at: true },
  });

  const token = signToken({ id: user.id, email: user.email, role: user.role as Role });

  const response = apiSuccess({ user, token }, 201);
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  return response;
}
