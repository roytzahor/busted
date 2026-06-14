import { getAIClient } from "@/lib/ai/client";
import {
  isAliExpressApiConfigured,
  searchAliExpressProducts,
} from "@/lib/aliexpress/api-client";
import type {
  DevMonitorServiceId,
  DevMonitorServiceSnapshot,
  DevMonitorTestResult,
} from "@/lib/dev-monitor/types";
import { prisma } from "@/lib/prisma";
import { scrapeWithFirecrawl } from "@/lib/scraping/firecrawl";

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

export function isDevMonitorAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function buildServiceSnapshots(): Record<
  DevMonitorServiceId,
  DevMonitorServiceSnapshot
> {
  const firecrawlConfigured = Boolean(process.env.FIRECRAWL_API_KEY?.trim());
  const playwrightEnabled = process.env.PLAYWRIGHT_FALLBACK_ENABLED === "true";
  const aiProvider = process.env.AI_PROVIDER ?? "google";
  const aiModel = process.env.GOOGLE_AI_MODEL ?? "gemini-3.5-flash";
  const aiConfigured = Boolean(
    process.env.GOOGLE_AI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  );
  const aliexpressConfigured = isAliExpressApiConfigured();
  const admitadConfigured = Boolean(
    process.env.ADMITAD_CLIENT_ID?.trim() &&
      process.env.ADMITAD_CLIENT_SECRET?.trim() &&
      process.env.ADMITAD_WEBSITE_ID?.trim(),
  );

  return {
    database: {
      configured: Boolean(process.env.DATABASE_URL?.trim()),
      label: "Prisma / Neon Postgres",
      details: {
        pooled: process.env.DATABASE_URL?.includes("-pooler") ?? false,
        host: maskDatabaseHost(process.env.DATABASE_URL),
      },
    },
    scraper: {
      configured: firecrawlConfigured,
      label: "Firecrawl / Playwright",
      details: {
        firecrawlKey: firecrawlConfigured,
        playwrightFallback: playwrightEnabled,
        tierLimit: "Plan-dependent · ~500–3k credits/mo (placeholder)",
        timeoutMs: Number(process.env.SCRAPER_TIMEOUT_MS ?? "30000"),
      },
    },
    ai: {
      configured: aiConfigured,
      label: "Google Gemini Flash",
      details: {
        provider: aiProvider,
        model: aiModel,
        jsonMode: true,
      },
    },
    affiliate: {
      configured: aliexpressConfigured || admitadConfigured,
      label: "AliExpress Affiliate Network",
      details: {
        aliexpressApi: aliexpressConfigured,
        admitadFallback: admitadConfigured,
        routing: aliexpressConfigured
          ? "aliexpress_api"
          : admitadConfigured
            ? "admitad"
            : "firecrawl_scrape",
        shipTo: process.env.ALIEXPRESS_SHIP_TO_COUNTRY ?? "US",
      },
    },
  };
}

function maskDatabaseHost(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "not configured";

  try {
    const parsed = new URL(databaseUrl);
    return parsed.hostname.replace(/^ep-/, "ep-***");
  } catch {
    return "configured";
  }
}

export async function runServiceProbe(
  service: DevMonitorServiceId,
): Promise<DevMonitorTestResult> {
  const start = performance.now();

  try {
    switch (service) {
      case "database":
        return await probeDatabase(start);
      case "scraper":
        return await probeScraper(start);
      case "ai":
        return await probeAi(start);
      case "affiliate":
        return await probeAffiliate(start);
    }
  } catch (error) {
    return {
      service,
      status: "error",
      latencyMs: elapsed(start),
      message: "Live probe failed.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeDatabase(start: number): Promise<DevMonitorTestResult> {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      service: "database",
      status: "uninitialized",
      latencyMs: elapsed(start),
      message: "DATABASE_URL is not set.",
    };
  }

  const count = await prisma.scannedProduct.count();

  return {
    service: "database",
    status: "connected",
    latencyMs: elapsed(start),
    message: "Prisma ping succeeded.",
    details: {
      scannedProductCount: count,
    },
  };
}

async function probeScraper(start: number): Promise<DevMonitorTestResult> {
  if (!process.env.FIRECRAWL_API_KEY?.trim()) {
    return {
      service: "scraper",
      status: "uninitialized",
      latencyMs: elapsed(start),
      message: "FIRECRAWL_API_KEY is not set.",
      details: {
        playwrightFallback: process.env.PLAYWRIGHT_FALLBACK_ENABLED === "true",
      },
    };
  }

  const result = await scrapeWithFirecrawl("https://example.com");

  return {
    service: "scraper",
    status: "connected",
    latencyMs: elapsed(start),
    message: "Firecrawl scrape probe succeeded.",
    details: {
      provider: result.provider,
      markdownChars: result.markdown.length,
      playwrightFallback: process.env.PLAYWRIGHT_FALLBACK_ENABLED === "true",
    },
  };
}

async function probeAi(start: number): Promise<DevMonitorTestResult> {
  const hasKey = Boolean(
    process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim(),
  );

  if (!hasKey) {
    return {
      service: "ai",
      status: "uninitialized",
      latencyMs: elapsed(start),
      message: "GOOGLE_AI_API_KEY / GEMINI_API_KEY is not set.",
    };
  }

  const client = getAIClient();
  const result = await client.complete({
    messages: [
      {
        role: "user",
        content: 'Reply with exactly the single word "OK" and nothing else.',
      },
    ],
    maxTokens: 8,
    temperature: 0,
  });

  const normalized = result.content.trim().toUpperCase();
  const ok = normalized.includes("OK");

  return {
    service: "ai",
    status: ok ? "connected" : "error",
    latencyMs: elapsed(start),
    message: ok
      ? "Gemini Flash validation prompt succeeded."
      : `Unexpected LLM response: "${result.content.slice(0, 40)}"`,
    details: {
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
    ...(ok ? {} : { error: "Response did not contain OK." }),
  };
}

async function probeAffiliate(start: number): Promise<DevMonitorTestResult> {
  if (!isAliExpressApiConfigured()) {
    const admitadConfigured = Boolean(
      process.env.ADMITAD_CLIENT_ID?.trim() &&
        process.env.ADMITAD_CLIENT_SECRET?.trim(),
    );

    return {
      service: "affiliate",
      status: "uninitialized",
      latencyMs: elapsed(start),
      message: admitadConfigured
        ? "AliExpress API keys missing; Admitad configured but not probed in dev monitor."
        : "ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET are not set.",
      details: {
        admitadConfigured,
        fallbackRouting: "firecrawl_scrape",
      },
    };
  }

  const candidates = await searchAliExpressProducts("book stand");

  return {
    service: "affiliate",
    status: candidates.length > 0 ? "connected" : "error",
    latencyMs: elapsed(start),
    message:
      candidates.length > 0
        ? `AliExpress product.query returned ${candidates.length} ranked candidates.`
        : "AliExpress API responded but returned no products.",
    details: {
      candidateCount: candidates.length,
      topProductId: candidates[0]?.productId ?? null,
      topPriceUsd: candidates[0]?.priceUsd ?? null,
      routing: "aliexpress_api",
    },
    ...(candidates.length > 0 ? {} : { error: "Empty product search results." }),
  };
}
