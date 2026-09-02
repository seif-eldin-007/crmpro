"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown by the root layout itself. It replaces
 * the entire document, so it ships its own <html>/<body> and inline styles — the
 * app stylesheet and providers are unavailable at this level.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
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
          background: "#09090b",
          color: "#fafafa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>Error</p>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "8px 0" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 20px" }}>
            An unexpected error occurred. Try again, or reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              fontSize: 14,
              fontWeight: 500,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
