"use client";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/error-reporter";
import { BRAND_NAME } from "@/lib/brand";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Catches render/data-load errors inside the route segment. Auto-reports the
 * error to /api/errors so we have visibility, then shows a friendly retry +
 * "back home" affordance. Never white-screens.
 */

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      source: "route_error",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <div
        aria-hidden="true"
        className="mb-5 inline-flex size-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10"
      >
        <AlertTriangle className="size-7 text-destructive" />
      </div>
      <h1 className="mb-2 text-2xl font-black tracking-tight sm:text-3xl">
        Something went sideways.
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        We logged it — try again, and if it keeps happening, take a screenshot and
        send it our way. {BRAND_NAME} doesn’t crash quietly.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => reset()}
          className="gap-1.5 bg-primary text-primary-foreground"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/">
            <Home className="size-4" aria-hidden="true" />
            Back home
          </Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="mt-6 text-[11px] text-muted-foreground/50">
          ref: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
