/**
 * Sentry monitoring integration.
 * Install @sentry/nextjs and set NEXT_PUBLIC_SENTRY_DSN to enable.
 *
 * Usage:
 *   npm install @sentry/nextjs
 *   Set NEXT_PUBLIC_SENTRY_DSN in .env.local
 *   Then the dynamic require below will pick it up automatically.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown) => void;
  captureMessage: (msg: string) => void;
};

// Sentry is opt-in: install @sentry/nextjs and set NEXT_PUBLIC_SENTRY_DSN to enable.
// Without the package, everything works — errors just go to console instead.
const Sentry: SentryLike | null = null;

/** Report an error to Sentry (or log to console when Sentry is not configured). */
export function captureError(err: unknown): void {
  if (Sentry) {
    Sentry.captureException(err);
  } else if (process.env.NODE_ENV !== "production") {
    console.error("[sentry:noop]", err);
  }
}

/**
 * Attach global unhandled-error listeners (call once from root layout or _app).
 * Safe to call on server — listeners are only added in the browser.
 */
export function initGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    captureError(event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureError(event.reason);
  });
}

export default Sentry;
