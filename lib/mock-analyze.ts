import {
  ANALYSIS_LOADING_STEPS,
  buildMockComparison,
  type ProductComparisonResult,
} from "@/lib/mock-data";

export type MockAnalyzePhase = (typeof ANALYSIS_LOADING_STEPS)[number];

export interface MockAnalyzeProgress {
  step: MockAnalyzePhase;
  progress: number;
}

const SIMULATED_LATENCY_MS = 3_200;
const STEP_INTERVAL_MS = SIMULATED_LATENCY_MS / ANALYSIS_LOADING_STEPS.length;

function isValidProductUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateProductUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Paste a product link to get started.";
  }

  if (!isValidProductUrl(trimmed)) {
    return "Enter a valid product URL (must start with http:// or https://).";
  }

  return null;
}

export async function mockAnalyzeProduct(
  url: string,
  onProgress?: (progress: MockAnalyzeProgress) => void,
): Promise<ProductComparisonResult> {
  const validationError = validateProductUrl(url);
  if (validationError) {
    throw new Error(validationError);
  }

  for (let index = 0; index < ANALYSIS_LOADING_STEPS.length; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, STEP_INTERVAL_MS));
    onProgress?.({
      step: ANALYSIS_LOADING_STEPS[index],
      progress: Math.round(((index + 1) / ANALYSIS_LOADING_STEPS.length) * 100),
    });
  }

  return buildMockComparison(url.trim());
}
