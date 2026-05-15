/**
 * Next.js Instrumentation File
 * Called once when a new server instance starts.
 * See: node_modules/next/dist/docs/01-app/02-guides/instrumentation.md
 *
 * Initialises:
 *  - New Relic APM (Node.js runtime only)
 *  - Sentry (Node.js runtime only)
 */
export async function register() {
  // Only run in the Node.js runtime, not in the Edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
