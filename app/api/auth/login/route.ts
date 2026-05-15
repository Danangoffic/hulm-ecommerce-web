import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { loginSchema } from "@/lib/auth/validation";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { apiSuccess, apiError } from "@/lib/auth/response";
import type { Role } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed, remaining } = checkRateLimit(`login:${ip}`);
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed.", 422, parsed.error.flatten().fieldErrors);
  }

  const { email, password } = parsed.data;

  // Lookup user — use a generic error to avoid user enumeration
  const user = await prisma.users.findFirst({ where: { email } });
  if (!user) {
    return apiError("Invalid email or password.", 401);
  }

  if (!user.is_active) {
    return apiError("Account is disabled.", 403);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return apiError("Invalid email or password.", 401);
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role as Role });

  const response = apiSuccess(
    {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
    200
  );
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  return response;
}
