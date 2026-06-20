/**
 * Resolve the public site URL.
 *
 * Order of preference:
 *  1. NEXT_PUBLIC_APP_URL  (we set this in Vercel)
 *  2. VERCEL_URL           (Vercel injects this automatically)
 *  3. localhost            (dev fallback)
 *
 * Always returns a URL with no trailing slash so callers can append paths
 * with a single `${base}${path}` template.
 */
export function getSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  }

  return "http://localhost:3000";
}
