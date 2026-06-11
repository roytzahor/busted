import { NextRequest, NextResponse } from "next/server";
import { findValidCachedProduct, normalizeProductUrl } from "@/lib/cache/product-cache";
import { persistScannedProduct } from "@/lib/cache/persist-product";
import { scrapeProductUrl } from "@/lib/scraping/router";
import { simulateAliExpressMatch } from "@/lib/scraping/simulate-match";
import { ScraperError } from "@/lib/scraping/types";
import {
  type AnalyzeRequestBody,
  type AnalyzeResponse,
  parseAliExpressData,
} from "@/lib/types/analyze";

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function errorResponse(
  originalUrl: string,
  message: string,
  code: string,
  status: number,
): NextResponse<AnalyzeResponse> {
  return NextResponse.json(
    {
      status: "error",
      cache: "MISS",
      originalUrl,
      message,
      code,
      aliexpressData: null,
    } satisfies AnalyzeResponse,
    { status, headers: { "X-Cache": "MISS" } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  let normalizedUrl = "";

  try {
    const body = (await request.json()) as AnalyzeRequestBody;

    if (!body.url || typeof body.url !== "string" || !isValidHttpUrl(body.url)) {
      return errorResponse(
        body.url ?? "",
        "A valid HTTP or HTTPS product URL is required.",
        "INVALID_URL",
        400,
      );
    }

    normalizedUrl = normalizeProductUrl(body.url);
    const cached = await findValidCachedProduct(normalizedUrl);

    if (cached) {
      const hitResponse: AnalyzeResponse = {
        status: "success",
        cache: "HIT",
        originalUrl: cached.originalUrl,
        aliexpressUrl: cached.aliexpressUrl,
        aliexpressData: parseAliExpressData(cached.aliexpressData),
        lastScrapedAt: cached.lastScrapedAt.toISOString(),
      };

      return NextResponse.json(hitResponse, {
        status: 200,
        headers: { "X-Cache": "HIT" },
      });
    }

    const { attributes, raw } = await scrapeProductUrl(normalizedUrl);
    const match = simulateAliExpressMatch(attributes);

    const persisted = await persistScannedProduct({
      originalUrl: normalizedUrl,
      aliexpressUrl: match.aliexpressUrl,
      aliexpressData: match.aliexpressData,
    });

    const successResponse: AnalyzeResponse = {
      status: "success",
      cache: "MISS",
      originalUrl: persisted.originalUrl,
      aliexpressUrl: persisted.aliexpressUrl,
      aliexpressData: match.aliexpressData,
      lastScrapedAt: persisted.lastScrapedAt.toISOString(),
      scrapeProvider: raw.provider,
    };

    return NextResponse.json(successResponse, {
      status: 200,
      headers: { "X-Cache": "MISS" },
    });
  } catch (error) {
    if (error instanceof ScraperError) {
      return errorResponse(
        normalizedUrl,
        error.message,
        error.code,
        error.statusCode,
      );
    }

    return errorResponse(
      normalizedUrl,
      "Unable to process analyze request.",
      "INTERNAL_ERROR",
      500,
    );
  }
}
