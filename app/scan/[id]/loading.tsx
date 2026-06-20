export default function ScanLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-12">
      <div
        aria-label="Loading scan…"
        role="status"
        className="space-y-4"
      >
        <div className="h-10 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}
