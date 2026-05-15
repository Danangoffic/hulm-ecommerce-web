import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import { verifyToken, extractBearerToken } from "@/lib/auth/jwt";

/** Routes that require a valid JWT (any role) */
const PROTECTED_PREFIXES = ["/profile", "/orders", "/addresses", "/checkout"];

/** Routes that require admin role */
const ADMIN_PREFIXES = ["/admin"];

/** Routes that should redirect to /login if not authenticated */
const AUTH_REDIRECT_PREFIXES = [...PROTECTED_PREFIXES, ...ADMIN_PREFIXES];

function getJwtFromRequest(request: NextRequest): ReturnType<typeof verifyToken> | null {
  // 1. Try Authorization header (for API clients)
  const headerToken = extractBearerToken(request.headers.get("authorization"));
  if (headerToken) {
    try {
      return verifyToken(headerToken);
    } catch {
      return null;
    }
  }

  // 2. Try cookie (for browser sessions)
  const cookieToken = request.cookies.get("auth_token")?.value;
  if (cookieToken) {
    try {
      return verifyToken(cookieToken);
    } catch {
      return null;
    }
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Refresh Supabase session (keeps SSR auth working)
  const { supabaseResponse } = createClient(request);

  // Skip auth checks for API auth routes themselves
  if (pathname.startsWith("/api/auth")) {
    return supabaseResponse;
  }

  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isProtectedRoute = AUTH_REDIRECT_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );

  if (!isProtectedRoute) {
    return supabaseResponse;
  }

  const payload = getJwtFromRequest(request);

  // Not authenticated → redirect to login
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin route but user is not admin/super_admin
  if (isAdminRoute && payload.role === "customer") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Attach user info to request headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-email", payload.email);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
