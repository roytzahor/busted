/**
 * URL validation with SSRF protection.
 * Blocks private IP ranges, loopback, link-local, and cloud metadata endpoints.
 */

// RFC 1918 private ranges + loopback + link-local + cloud metadata
const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,  // link-local (AWS metadata: 169.254.169.254)
  /^::1$/,                   // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,       // IPv6 unique local (fc00::/7)
  /^fe80:/i,                 // IPv6 link-local
  /^0\./,                    // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGN (100.64.0.0/10)
];

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
]);

export function isValidProductUrl(rawUrl: string): { ok: true } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "URL is not valid." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only HTTP and HTTPS URLs are supported." };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "This URL is not a public product page." };
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { ok: false, reason: "This URL is not a public product page." };
    }
  }

  // Reject numeric-only hostnames that look like raw IPs but aren't caught by the patterns above
  // (e.g., IPv6 addresses in brackets)
  if (parsed.hostname.startsWith("[")) {
    const ipv6 = parsed.hostname.slice(1, -1).toLowerCase();
    if (ipv6 === "::1" || ipv6.startsWith("fc") || ipv6.startsWith("fe80")) {
      return { ok: false, reason: "This URL is not a public product page." };
    }
  }

  return { ok: true };
}
