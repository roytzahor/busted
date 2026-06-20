"use client";

import { reportClientError } from "@/lib/error-reporter";
import { useEffect } from "react";

/**
 * Root-level error boundary. Renders its own <html>/<body> per Next.js spec.
 *
 * This catches errors thrown above the route segment (e.g. in the layout
 * itself). Kept dead-simple — anything fancy could itself throw.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      source: "global_error",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#170b04",
          color: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
            Something went sideways.
          </h1>
          <p style={{ marginTop: 12, color: "rgba(255,255,255,0.7)" }}>
            We logged it. Reload the page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "#f59e0b",
              border: "none",
              borderRadius: 10,
              color: "#170b04",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
