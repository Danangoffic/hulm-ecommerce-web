import { type NextRequest } from "next/server";
import { extractBearerToken, verifyToken } from "./jwt";
import { apiError } from "./response";
import type { JwtPayload, Role } from "./types";

interface GuardResult {
  ok: true;
  payload: JwtPayload;
  error?: never;
}

interface GuardError {
  ok: false;
  error: Response;
  payload?: never;
}

/**
 * Verify the JWT on an incoming request.
 *
 * Usage in a Route Handler:
 *
 *   const guard = requireAuth(request);
 *   if (!guard.ok) return guard.error;
 *   const { payload } = guard;
 */
export function requireAuth(request: NextRequest): GuardResult | GuardError {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return { ok: false, error: apiError("Authentication required.", 401) };
  }

  try {
    const payload = verifyToken(token);
    return { ok: true, payload };
  } catch (err: unknown) {
    const isExpired =
      err instanceof Error && err.name === "TokenExpiredError";
    return {
      ok: false,
      error: apiError(
        isExpired ? "Token expired." : "Invalid token.",
        401
      ),
    };
  }
}

/**
 * Verify the JWT and enforce a minimum role.
 *
 * Role hierarchy: customer < admin < super_admin
 *
 * Usage:
 *   const guard = requireRole(request, "admin");
 *   if (!guard.ok) return guard.error;
 */
export function requireRole(
  request: NextRequest,
  requiredRole: Role
): GuardResult | GuardError {
  const authResult = requireAuth(request);
  if (!authResult.ok) return authResult;

  const hierarchy: Role[] = ["customer", "admin", "super_admin"];
  const userLevel = hierarchy.indexOf(authResult.payload.role);
  const requiredLevel = hierarchy.indexOf(requiredRole);

  if (userLevel < requiredLevel) {
    return {
      ok: false,
      error: apiError("Insufficient permissions.", 403),
    };
  }

  return authResult;
}
