"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * `app/error.tsx` renders *inside* the layout, so it cannot catch a throw that
 * happens while the layout is rendering — and the layout is exactly where the
 * risk concentrates (`generateMetadata`, `NavBar`, and `Footer` all read the
 * CMS). Without this file, such a failure renders Next's unstyled default crash
 * screen on every route at once.
 *
 * `getSiteData` now degrades to defaults rather than throwing, so this should
 * be unreachable in practice. It exists because "should be unreachable" is not
 * the same as "is", and the cost of being wrong is the whole site.
 *
 * A global error replaces the entire document, so this component owns its own
 * <html> and <body> and cannot use the app's stylesheet, fonts, or components.
 * The styles below are inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError({
      scope: "root-layout",
      context: "global-error-boundary",
      error,
      correlationId: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#f4f4f2",
          color: "#14181d",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <main style={{ maxWidth: "34rem" }}>
          <p
            style={{
              margin: "0 0 1.25rem",
              fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#6b7280",
            }}
          >
            Error &middot; Fault in the pattern
          </p>

          <h1 style={{ margin: "0 0 1rem", fontSize: "2rem", fontWeight: 400, lineHeight: 1.15 }}>
            The studio is briefly offline.
          </h1>

          <p style={{ margin: "0 0 1.75rem", fontSize: "1rem", lineHeight: 1.6, color: "#3f4854" }}>
            Something failed before the page could be assembled. The work itself is
            intact — this is a temporary fault on our side, not a page that no longer
            exists.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                font: "inherit",
                fontSize: "0.9rem",
                padding: "0.7rem 1.4rem",
                border: "1px solid #14181d",
                background: "#14181d",
                color: "#f4f4f2",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/*
              A plain <a>, not next/link, on purpose. A global error replaces
              the whole document and tears down the router, so <Link /> has no
              context to navigate within — and a hard reload is exactly the
              recovery we want here.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                font: "inherit",
                fontSize: "0.9rem",
                padding: "0.7rem 1.4rem",
                border: "1px solid #14181d",
                color: "#14181d",
                textDecoration: "none",
              }}
            >
              Home
            </a>
          </div>

          {error.digest && (
            <p
              style={{
                margin: "1.75rem 0 0",
                fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
                fontSize: "0.7rem",
                color: "#6b7280",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
