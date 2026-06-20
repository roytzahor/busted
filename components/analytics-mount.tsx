"use client";

import { installGlobalErrorReporting } from "@/lib/error-reporter";
import { track } from "@/lib/track";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Mounted once at the layout level. Fires a `page_view` event on every
 * pathname change AND installs the global window.error /
 * unhandledrejection listeners so client crashes get captured to /api/errors.
 */
export function AnalyticsMount() {
  const pathname = usePathname();

  useEffect(() => {
    installGlobalErrorReporting();
  }, []);

  useEffect(() => {
    track("page_view", { props: { path: pathname } });
  }, [pathname]);

  return null;
}
