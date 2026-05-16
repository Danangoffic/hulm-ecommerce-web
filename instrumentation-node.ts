/**
 * Node.js-only instrumentation.
 * Imported by instrumentation.ts only when NEXT_RUNTIME === 'nodejs'.
 *
 * Install dependencies before enabling:
 *   npm install newrelic @sentry/nextjs
 */

// ── New Relic ──────────────────────────────────────────────────────────────
// New Relic must be the very first require/import in the process.
// It reads configuration from environment variables (see .env.example).
if (process.env.NEW_RELIC_LICENSE_KEY) {
  // Dynamic import keeps the module out of the bundle when the key is absent.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("newrelic");
  console.info("[instrumentation] New Relic APM initialised");
} else {
  console.warn(
    "[instrumentation] NEW_RELIC_LICENSE_KEY not set — New Relic disabled"
  );
}

// ── Sentry ─────────────────────────────────────────────────────────────────
// @sentry/nextjs exposes a server-side init that must run before any requests.
if (process.env.SENTRY_DSN) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    // Capture 10 % of transactions for performance monitoring in production
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    // Associate releases with source maps for better stack traces
    release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  });
  console.info("[instrumentation] Sentry initialised");
} else {
  console.warn("[instrumentation] SENTRY_DSN not set — Sentry disabled");
}

export {};
