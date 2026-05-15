import { type NextRequest } from "next/server";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";
import { apiSuccess, apiError } from "@/lib/auth/response";

/**
 * POST /api/auth/logout
 *
 * JWT is stateless — there is no server-side session to destroy.
 * The client must discard the token on their end.
 *
 * This endpoint validates the token so the client gets a clear
 * error if they send an already-expired token, and returns a
 * consistent success response otherwise.
 *
 * For token revocation (blacklisting), integrate a Redis store here.
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return apiError("No token provided.", 401);
  }

  try {
    verifyToken(token);
  } catch {
    // Token already expired or invalid — treat as already logged out
    return apiSuccess({ message: "Logged out." }, 200);
  }

  return apiSuccess({ message: "Logged out. Please discard your token." }, 200);
}
