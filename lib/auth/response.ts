/** Consistent JSON error/success response helpers for API routes */

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

export function apiError(message: string, status: number, details?: unknown): Response {
  return Response.json(
    { success: false, error: { message, ...(details ? { details } : {}) } },
    { status }
  );
}
