/**
 * Sentry browser-side initialisation.
 * This file is automatically imported by @sentry/nextjs when present.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  // Capture 10 % of browser transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  // Associate releases with source maps
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  // Replay 1 % of sessions, 100 % of sessions with errors
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
