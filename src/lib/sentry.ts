/**
 * Sentry monitoring integration.
 * Install @sentry/nextjs and set NEXT_PUBLIC_SENTRY_DSN to enable.
 *
 * Usage:
 *   npm install @sentry/nextjs
 *   Set NEXT_PUBLIC_SENTRY_DSN in .env.local
 *   Then uncomment the import below.
 */

// import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let Sentry: { init: (opts: Record<string, unknown>) => void; captureException: (err: unknown) => void } | null = null;

if (SENTRY_DSN) {
  try {
    // Dynamic import to avoid build errors when @sentry/nextjs is not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SentryModule = require("@sentry/nextjs");
    SentryModule.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
    Sentry = SentryModule;
  } catch {
    console.warn("@sentry/nextjs not installed. Sentry monitoring disabled.");
  }
}

export default Sentry;
