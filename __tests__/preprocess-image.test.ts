/**
 * Unit tests for preprocessForSmartMatch — the Gemini image-cleanup arm.
 *
 * These exist because of a measured production bug: the module used to ask one
 * call for `responseModalities: ["TEXT", "IMAGE"]` while giving the model two
 * tasks, and the model legally satisfied that by answering only the TEXT half.
 * gemini-2.5-flash-image returned an image part in 3/11 attempts on this exact
 * prompt; every miss became GEMINI_NO_IMAGE_OUTPUT and silently dropped the
 * caller back to the raw source URL, taking the OCR/material keyword arms with
 * it. The split into an IMAGE-only generation call plus a TEXT-only review call
 * is the fix, so the shape of those two calls is what these tests pin down.
 *
 * No network: the Gemini SDK, the cache layer and `fetch` are all mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/generative-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/generative-ai")>();
  return {
    ...actual,
    // Records which model each call was dispatched to as a second argument, so
    // the tests can assert generation and review landed on different models.
    GoogleGenerativeAI: class {
      getGenerativeModel(opts: { model: string }) {
        return {
          generateContent: (params: unknown) => generateContent(params, opts.model),
        };
      }
    },
  };
});

vi.mock("@/lib/ai/preprocess-cache", () => ({
  getCachedPreprocessed: vi.fn(),
  savePreprocessedAsync: vi.fn(),
}));

import { getCachedPreprocessed, savePreprocessedAsync } from "@/lib/ai/preprocess-cache";
import { imageModel, visionModel } from "@/lib/ai/models";
import {
  isPreprocessEnabled,
  PreprocessError,
  preprocessForSmartMatch,
} from "@/lib/ai/preprocess-image";

const mockedGetCached = vi.mocked(getCachedPreprocessed);
const mockedSave = vi.mocked(savePreprocessedAsync);

const SOURCE_URL = "https://store.example/img/roller.jpg";
const CATEGORY = "pet grooming tool";

/** Minimal PNG whose IHDR carries real dimensions — readDimensions parses it. */
function pngBase64(width: number, height: number): string {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf.toString("base64");
}

/** Queue an image-generation response containing an inline image part. */
function respondWithImage(width = 1024, height = 1024) {
  generateContent.mockResolvedValueOnce({
    response: {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: { mimeType: "image/png", data: pngBase64(width, height) },
              },
            ],
          },
        },
      ],
    },
  });
}

/** Queue a review response. `payload` is serialised as the JSON text part. */
function respondWithReview(payload: Record<string, unknown>) {
  generateContent.mockResolvedValueOnce({
    response: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    },
  });
}

/** Queue an image-generation response with a text part and NO image part. */
function respondWithTextOnly(text: string) {
  generateContent.mockResolvedValueOnce({
    response: { candidates: [{ content: { parts: [{ text }] } }] },
  });
}

function generationConfigOf(callIndex: number) {
  return generateContent.mock.calls[callIndex][0].generationConfig;
}

function modelOf(callIndex: number): string {
  return generateContent.mock.calls[callIndex][1];
}

beforeEach(() => {
  generateContent.mockReset();
  mockedGetCached.mockReset();
  mockedSave.mockReset();
  mockedGetCached.mockResolvedValue(null);
  vi.stubEnv("GOOGLE_AI_API_KEY", "test-key-not-a-real-credential");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isPreprocessEnabled", () => {
  it("is off when the flag is unset — the kill switch defaults closed", () => {
    vi.stubEnv("PREPROCESS_ENABLED", "");
    expect(isPreprocessEnabled()).toBe(false);
  });

  it("is off for any value other than the exact string 'true'", () => {
    vi.stubEnv("PREPROCESS_ENABLED", "1");
    expect(isPreprocessEnabled()).toBe(false);
    vi.stubEnv("PREPROCESS_ENABLED", "TRUE");
    expect(isPreprocessEnabled()).toBe(false);
  });

  it("is on only for 'true'", () => {
    vi.stubEnv("PREPROCESS_ENABLED", "true");
    expect(isPreprocessEnabled()).toBe(true);
  });
});

describe("preprocessForSmartMatch — the two-call split", () => {
  it("makes exactly two calls: image generation then review", async () => {
    respondWithImage();
    respondWithReview({ score: 9, issues: [] });

    await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(modelOf(0)).toBe(imageModel());
    expect(modelOf(1)).toBe(visionModel());
  });

  it("asks the generation call for IMAGE only — never TEXT", async () => {
    respondWithImage();
    respondWithReview({ score: 9, issues: [] });

    await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    // The regression guard. Adding "TEXT" back here re-opens the door for the
    // model to answer with prose and no image at all.
    expect(generationConfigOf(0).responseModalities).toEqual(["IMAGE"]);
  });

  it("sends imageConfig on the generation call rather than trusting prompt text", async () => {
    respondWithImage();
    respondWithReview({ score: 9, issues: [] });

    await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    // Prompt text asking for "1:1, approximately 800x800" was measured to be
    // ignored by every image model; imageConfig is the only knob that works.
    expect(generationConfigOf(0).imageConfig).toEqual({
      aspectRatio: "1:1",
      imageSize: "1K",
    });
  });

  it("leaves the review call as a plain text-out read (no image modality)", async () => {
    respondWithImage();
    respondWithReview({ score: 9, issues: [] });

    await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    expect(generationConfigOf(1)?.responseModalities).toBeUndefined();
    expect(generationConfigOf(1)?.imageConfig).toBeUndefined();
  });

  it("gives the reviewer both the source and the cleaned image", async () => {
    respondWithImage();
    respondWithReview({ score: 9, issues: [] });

    await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    const parts = generateContent.mock.calls[1][0].contents[0].parts;
    const inlineParts = parts.filter((p: Record<string, unknown>) => "inlineData" in p);
    expect(inlineParts).toHaveLength(2);
  });
});

describe("preprocessForSmartMatch — results", () => {
  it("returns the generated image with dimensions read off the bytes", async () => {
    respondWithImage(1024, 1024);
    respondWithReview({ score: 8, issues: [] });

    const result = await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    expect(result.format).toBe("png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.cacheHit).toBe(false);
    expect(result.qualityScore).toBe(8);
    expect(result.lightPromptUsed).toBe(false);
    // The counterpart to the reviewer-down cases below: a real review DOES
    // get cached.
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it("surfaces the analysis arms extracted by the review call", async () => {
    respondWithImage();
    respondWithReview({
      score: 9,
      issues: [],
      ocrTraces: ["XZ-9900", ""],
      materialTokens: ["TPU"],
      technicalSpecs: ["450ml", 42],
    });

    const result = await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    // Empty strings and non-strings are dropped — these feed keyword searches.
    expect(result.ocrTraces).toEqual(["XZ-9900"]);
    expect(result.materialTokens).toEqual(["TPU"]);
    expect(result.technicalSpecs).toEqual(["450ml"]);
  });

  it("serves a cache hit without touching Gemini at all", async () => {
    mockedGetCached.mockResolvedValue({
      base64: pngBase64(800, 800),
      format: "jpg",
      width: 800,
      height: 800,
      ocrTraces: ["TC-500"],
      materialTokens: [],
      technicalSpecs: [],
    });

    const result = await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    expect(result.cacheHit).toBe(true);
    expect(result.ocrTraces).toEqual(["TC-500"]);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("preprocessForSmartMatch — failure paths stay PreprocessError", () => {
  it("throws GEMINI_NO_IMAGE_OUTPUT when the generation call answers in text", async () => {
    respondWithTextOnly("I cannot edit this image.");

    const err = await preprocessForSmartMatch(SOURCE_URL, CATEGORY).catch((e) => e);

    expect(err).toBeInstanceOf(PreprocessError);
    expect((err as PreprocessError).code).toBe("GEMINI_NO_IMAGE_OUTPUT");
    // No point paying the reviewer for an image that does not exist.
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("wraps an SDK throw as GEMINI_CALL_FAILED rather than leaking it", async () => {
    generateContent.mockRejectedValueOnce(new Error("503 upstream unavailable"));

    const err = await preprocessForSmartMatch(SOURCE_URL, CATEGORY).catch((e) => e);

    expect(err).toBeInstanceOf(PreprocessError);
    expect((err as PreprocessError).code).toBe("GEMINI_CALL_FAILED");
  });

  it("wraps a source-image fetch failure as PreprocessError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers() }),
    );

    const err = await preprocessForSmartMatch(SOURCE_URL, CATEGORY).catch((e) => e);

    expect(err).toBeInstanceOf(PreprocessError);
    expect((err as PreprocessError).code).toBe("SOURCE_FETCH_FAILED");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("throws PreprocessError when no API key is configured", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");

    const err = await preprocessForSmartMatch(SOURCE_URL, CATEGORY).catch((e) => e);

    expect(err).toBeInstanceOf(PreprocessError);
    expect((err as PreprocessError).code).toBe("GEMINI_NOT_CONFIGURED");
  });
});

describe("preprocessForSmartMatch — graceful degradation", () => {
  it("keeps the cleaned image when the reviewer is down (optimistic score)", async () => {
    respondWithImage();
    generateContent.mockRejectedValueOnce(new Error("reviewer 500"));

    const result = await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    // A reviewer outage must not downgrade every scan to the raw-URL path.
    expect(result.qualityScore).toBe(7);
    expect(result.ocrTraces).toEqual([]);
    // ...but it must not be cached either: the cache is keyed on
    // (imageUrl, category) and never expires, so persisting the empty analysis
    // would pin that pair to empty ocrTraces long after the outage ended.
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("keeps the cleaned image when the reviewer returns unparseable JSON", async () => {
    respondWithImage();
    respondWithTextOnly("Sure! Here is my assessment: it looks pretty good.");

    const result = await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    expect(result.qualityScore).toBe(7);
    // Unparseable is the same evidence state as unreachable — do not cache it.
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("retries with the light prompt when the full pass scores below threshold", async () => {
    respondWithImage();
    respondWithReview({ score: 2, issues: ["brand still visible"], ocrTraces: ["AB1234"] });
    respondWithImage(900, 1200);
    respondWithReview({ score: 6, issues: [] });

    const result = await preprocessForSmartMatch(SOURCE_URL, CATEGORY);

    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(result.lightPromptUsed).toBe(true);
    expect(result.qualityScore).toBe(6);
    expect(result.width).toBe(900);
    // The light retry omits aspectRatio on purpose — forcing a square would
    // make the model invent background, which is what the retry is avoiding.
    expect(generationConfigOf(2).imageConfig).toEqual({ imageSize: "1K" });
    expect(generationConfigOf(2).responseModalities).toEqual(["IMAGE"]);
    // Analysis comes from the first review; the retry's copy is discarded.
    expect(result.ocrTraces).toEqual(["AB1234"]);
  });

  it("throws LOW_QUALITY when both passes score below threshold", async () => {
    respondWithImage();
    respondWithReview({ score: 1, issues: ["product destroyed"] });
    respondWithImage();
    respondWithReview({ score: 2, issues: ["still bad"] });

    const err = await preprocessForSmartMatch(SOURCE_URL, CATEGORY).catch((e) => e);

    expect(err).toBeInstanceOf(PreprocessError);
    expect((err as PreprocessError).code).toBe("LOW_QUALITY");
    expect(mockedSave).not.toHaveBeenCalled();
  });
});
