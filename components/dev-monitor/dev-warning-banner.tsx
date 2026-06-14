import { AlertTriangle } from "lucide-react";

export function DevWarningBanner() {
  return (
    <div
      role="alert"
      className="border-b border-amber-500/40 bg-amber-500/15 px-4 py-3"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-center">
        <AlertTriangle
          className="size-4 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
        <p className="font-mono text-xs font-semibold tracking-widest text-amber-900 uppercase sm:text-sm dark:text-amber-300">
          Development Monitor — Internal Use Only
        </p>
        <AlertTriangle
          className="size-4 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
