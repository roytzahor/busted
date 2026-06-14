const DEFAULT_TIMEOUT_MS = 10_000;

export async function validateAffiliateLink(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Busted/1.0; +https://buy-pass-silk.vercel.app)",
        Range: "bytes=0-0",
      },
    });

    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
