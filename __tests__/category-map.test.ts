/**
 * Unit tests for resolveCategoryVocab and deriveOutcomeVertical.
 *
 * Covers:
 *  - Stage 1: direct case-insensitive lookup
 *  - Stage 2: synonym regex scan
 *  - Stage 3: token-overlap match (longest-key-first)
 *  - deriveOutcomeVertical: vocab hit + fallback (normalized, capped at 3 tokens)
 *  - Edge cases: noise words, different token order, partial-token mismatch,
 *    stop-word stripping, empty/null input
 */

import { describe, it, expect } from "vitest";
import {
  resolveCategoryVocab,
  deriveOutcomeVertical,
} from "@/lib/aliexpress/category-map";

// ─── helpers ───────────────────────────────────────────────────────────────

/** Assert the resolved vertical name equals expected, or null. */
function resolvedVertical(input: string | null | undefined): string | null {
  return resolveCategoryVocab(input)?.vertical ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 1 — direct case-insensitive lookup
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveCategoryVocab — Stage 1: direct lookup", () => {
  it("matches an exact key verbatim", () => {
    expect(resolvedVertical("phone cases")).toBe("phone cases");
  });

  it("matches with different casing", () => {
    expect(resolvedVertical("Phone Cases")).toBe("phone cases");
    expect(resolvedVertical("PHONE CASES")).toBe("phone cases");
    expect(resolvedVertical("PhOnE cAsEs")).toBe("phone cases");
  });

  it("matches all other direct keys verbatim", () => {
    const directKeys = [
      ["shower steamer", "shower steamer"],
      ["slippers", "slippers"],
      ["necklace", "necklace"],
      ["apparel sizes", "apparel sizes"],
      ["shoes", "shoes"],
      ["water bottle", "water bottle"],
      ["dog harness", "dog harness"],
      ["kitchen gadget", "kitchen gadget"],
      ["beauty tool", "beauty tool"],
    ] as const;

    for (const [input, expected] of directKeys) {
      expect(resolvedVertical(input)).toBe(expected);
    }
  });

  it("strips leading/trailing whitespace before lookup", () => {
    expect(resolvedVertical("  phone cases  ")).toBe("phone cases");
    expect(resolvedVertical("\tnecklace\n")).toBe("necklace");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stage 2 — synonym regex scan
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveCategoryVocab — Stage 2: synonym regex", () => {
  const cases: Array<[string, string]> = [
    // phone cases synonyms
    ["iPhone case", "phone cases"],
    ["mobile case", "phone cases"],
    ["smartphone case", "phone cases"],
    ["Android phone case clear", "phone cases"],

    // shower steamer synonyms
    ["Shower Steamer Tablets", "shower steamer"],
    ["aromatherapy shower bomb", "shower steamer"],
    ["shower spa tablets", "shower steamer"],
    ["spa tablet eucalyptus", "shower steamer"],
    ["aroma tablet lavender", "shower steamer"],
    ["aromatherapy tablet peppermint", "shower steamer"],
    ["shower fizz tablet", "shower steamer"],
    ["Aroma Shower Tablets", "shower steamer"],   // real AI output

    // slippers synonyms
    ["cloud slides", "slippers"],
    ["house shoe comfort", "slippers"],
    ["fluffy slippers warm", "slippers"],

    // necklace synonyms
    ["gold pendant necklace", "necklace"],
    ["silver choker chain", "necklace"],
    ["chain necklace womens", "necklace"],

    // apparel synonyms
    ["graphic tee unisex", "apparel sizes"],
    ["oversized hoodie pullover", "apparel sizes"],
    ["summer dress floral", "apparel sizes"],
    ["women's jacket slim fit", "apparel sizes"],

    // shoes synonyms
    ["casual sneaker men", "shoes"],
    ["women lounger slip-on", "shoes"],
    ["leather loafer formal", "shoes"],

    // water bottle synonyms
    ["stainless steel tumbler 40oz", "water bottle"],
    ["insulated thermos travel", "water bottle"],
    ["vacuum flask hydration", "water bottle"],

    // dog harness synonyms
    ["no pull dog harness padded", "dog harness"],
    ["pet harness adjustable", "dog harness"],

    // kitchen gadget synonyms
    ["kitchen tool peeler vegetable", "kitchen gadget"],
    ["manual vegetable chopper", "kitchen gadget"],

    // beauty tool synonyms
    ["jade roller facial massager", "beauty tool"],
    ["gua sha stone face tool", "beauty tool"],
    ["led mask therapy light", "beauty tool"],
    ["microcurrent facial device", "beauty tool"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected}`, () => {
      expect(resolvedVertical(input)).toBe(expected);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Stage 3 — token-overlap match
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveCategoryVocab — Stage 3: token-overlap", () => {
  // These inputs should NOT match Stage 1 (no direct key) or Stage 2 (no synonym
  // regex fires). They land on Stage 3.

  it("matches 'Shower Spa Tablets' via the spa-tablet synonym before token-overlap", () => {
    // Covered by synonym "/spa tablet/i" — still must return correctly.
    expect(resolvedVertical("Shower Spa Tablets")).toBe("shower steamer");
  });

  it("matches 'Premium Sterling Silver Necklace' via token overlap (key=necklace)", () => {
    // "premium", "sterling", "silver" are noise; "necklace" alone is the key token.
    // No synonym fires for "sterling silver necklace" (pendant regex doesn't match),
    // but the token "necklace" overlaps with the CATEGORY_MAP key "necklace".
    expect(resolvedVertical("Premium Sterling Silver Necklace")).toBe("necklace");
  });

  it("matches regardless of word order in the input", () => {
    // "bottle water premium" — tokens "water" and "bottle" both present
    expect(resolvedVertical("bottle water premium insulated")).toBe("water bottle");
  });

  it("matches with random noise words interspersed", () => {
    // "the premium new phone cases collection" — stop words stripped; "phone" "cases" remain
    expect(resolvedVertical("the premium new phone cases collection")).toBe("phone cases");
  });

  it("returns null on partial-token match (not all tokens of the key present)", () => {
    // "phone" alone should NOT match "phone cases" (key has 2 tokens: "phone" + "cases")
    // and no synonym fires either.
    // There's also no synonym for just "phone".
    expect(resolvedVertical("new phone")).toBe(null);
  });

  it("multi-token key beats single-token key when both match", () => {
    // CATEGORY_MAP has:
    //   "dog harness" → 2 tokens: ["dog", "harness"]
    //   "shoes"       → 1 token: ["shoes"]
    //
    // Input contains tokens for "dog harness" which is longer, so it should win
    // over any hypothetical single-token match. "shoes" tokens are absent here
    // so the real test of sorting is the order of iteration.
    //
    // We test sorting indirectly: an input that matches a 2-token key must
    // NOT be swallowed by a shorter 1-token key that is a substring match.
    // "premium new kitchen gadget set" — "kitchen gadget" (2 tokens) beats "kitchen"
    // if "kitchen" were a standalone key.
    expect(resolvedVertical("premium new kitchen gadget set")).toBe("kitchen gadget");
  });

  it("'dog harness vest tactical' resolves to dog harness (2-token key)", () => {
    // The synonym /dog harness/i fires in Stage 2, confirming the vertical.
    // Adding separately to validate Stage-2/3 boundary is consistent.
    expect(resolvedVertical("dog harness vest tactical")).toBe("dog harness");
  });

  it("'beauty tool skincare facial roller' resolves to beauty tool", () => {
    // synonym /beauty tool/i fires — but also tests that even with extra tokens
    // the result is stable.
    expect(resolvedVertical("beauty tool skincare facial roller")).toBe("beauty tool");
  });

  it("input with only stop words returns null", () => {
    // "a premium set of products" — all tokens stripped; nothing to match.
    expect(resolvedVertical("a premium set of products")).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stage 3 — longest-key-first sorting proof
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveCategoryVocab — Stage 3: longest-key-first sorting", () => {
  /**
   * We add a synthetic scenario that exercises the sort purely:
   *
   * CATEGORY_MAP currently has:
   *   "water bottle"  → 2 tokens: water, bottle   (multi-token)
   *   "shoes"         → 1 token: shoes              (single-token)
   *   "slippers"      → 1 token: slippers           (single-token)
   *   "necklace"      → 1 token: necklace           (single-token)
   *   "dog harness"   → 2 tokens: dog, harness
   *   "kitchen gadget"→ 2 tokens: kitchen, gadget
   *   "beauty tool"   → 2 tokens: beauty, tool
   *   "shower steamer"→ 2 tokens: shower, steamer
   *   "phone cases"   → 2 tokens: phone, cases
   *   "apparel sizes" → 2 tokens: apparel, sizes
   *
   * A 2-token key must always beat any 1-token key that is a subset match.
   * We verify "water bottle" beats any single "bottle" lookahead by confirming
   * the result is always "water bottle" and not null.
   */

  it("'insulated water bottle camping' → 'water bottle' (2-token key wins)", () => {
    // "water" + "bottle" both in input → 2-token key "water bottle" fires first.
    expect(resolvedVertical("insulated water bottle camping")).toBe("water bottle");
  });

  it("'casual shoes slippers house' — slippers synonym wins (Stage 2 before Stage 3)", () => {
    // Stage 2 synonym /slipper/i fires → "slippers" returned; "shoes" never evaluated.
    expect(resolvedVertical("casual shoes slippers house")).toBe("slippers");
  });

  it("'shower steamer aromatherapy tablets' — 2-token key wins over 'steamer' alone", () => {
    // Both tokens "shower" and "steamer" appear → "shower steamer" wins.
    expect(resolvedVertical("shower aromatherapy steamer tablets")).toBe("shower steamer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stop-word stripping
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveCategoryVocab — stop-word stripping", () => {
  it("articles (a, an, the) are ignored", () => {
    expect(resolvedVertical("the necklace")).toBe("necklace");
    expect(resolvedVertical("a new necklace pendant")).toBe("necklace");
    expect(resolvedVertical("an elegant necklace")).toBe("necklace");
  });

  it("generic descriptors (premium, new, classic, deluxe, luxury) are ignored", () => {
    expect(resolvedVertical("premium deluxe slippers")).toBe("slippers");
    expect(resolvedVertical("classic luxury necklace")).toBe("necklace");
    expect(resolvedVertical("new modern shoes collection")).toBe("shoes");
  });

  it("set/kit/pack/bundle are ignored", () => {
    expect(resolvedVertical("kitchen gadget set")).toBe("kitchen gadget");
    expect(resolvedVertical("beauty tool kit")).toBe("beauty tool");
    expect(resolvedVertical("dog harness bundle")).toBe("dog harness");
  });

  it("AI-tacked suffixes (online, shop, store) are ignored", () => {
    expect(resolvedVertical("necklace online shop")).toBe("necklace");
    expect(resolvedVertical("slippers store")).toBe("slippers");
  });

  it("stop words alone never produce a match", () => {
    expect(resolvedVertical("premium professional")).toBe(null);
    expect(resolvedVertical("set kit bundle pack")).toBe(null);
    expect(resolvedVertical("online shop store")).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Null / empty / falsy inputs
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveCategoryVocab — null / empty inputs", () => {
  it("returns null for null", () => {
    expect(resolveCategoryVocab(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(resolveCategoryVocab(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveCategoryVocab("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(resolveCategoryVocab("   ")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deriveOutcomeVertical — vocab hit path
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveOutcomeVertical — vocab hit returns canonical vertical", () => {
  const vocabCases: Array<[string, string]> = [
    ["Shower Steamer Tablets", "shower steamer"],
    ["Aroma shower tablets", "shower steamer"],
    ["Shower Spa Tablets", "shower steamer"],
    ["iPhone TPU phone case", "phone cases"],
    ["Sterling silver baby necklace", "necklace"],
    ["Stainless steel tumbler insulated", "water bottle"],
    ["Premium EVA cloud slippers", "slippers"],
    ["No pull dog harness padded", "dog harness"],
    ["kitchen gadget peeler", "kitchen gadget"],
    ["jade roller beauty tool", "beauty tool"],
  ];

  for (const [input, expected] of vocabCases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(deriveOutcomeVertical(input)).toBe(expected);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// deriveOutcomeVertical — fallback path (no vocab match, normalize + cap at 3)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveOutcomeVertical — fallback: normalized, capped at 3 tokens", () => {
  it("normalizes and returns up to 3 tokens for an unknown category", () => {
    // "LED Galaxy Projector" — no vocab entry; 3 tokens → returned as-is
    expect(deriveOutcomeVertical("LED Galaxy Projector")).toBe("led galaxy projector");
  });

  it("caps at exactly 3 tokens for a long unknown category", () => {
    // "Smart LED Galaxy Star Projector Night Light" → 7 tokens → first 3 only
    const result = deriveOutcomeVertical("Smart LED Galaxy Star Projector Night Light");
    expect(result?.split(" ").length).toBe(3);
    expect(result).toBe("smart led galaxy");
  });

  it("strips stop words before capping", () => {
    // "A Premium LED Galaxy Projector Set" — stop words stripped first:
    // "led", "galaxy", "projector" → cap at 3
    expect(deriveOutcomeVertical("A Premium LED Galaxy Projector Set")).toBe(
      "led galaxy projector",
    );
  });

  it("returns a single token when only one meaningful token exists", () => {
    // "Premium Pro Crystal" — "premium" and "pro" are stop words; "crystal" remains
    expect(deriveOutcomeVertical("Premium Pro Crystal")).toBe("crystal");
  });

  it("returns null for all-stop-word input", () => {
    expect(deriveOutcomeVertical("a premium set of products")).toBeNull();
  });

  it("returns null for null", () => {
    expect(deriveOutcomeVertical(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(deriveOutcomeVertical(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(deriveOutcomeVertical("")).toBeNull();
  });

  it("fallback is lowercase", () => {
    const result = deriveOutcomeVertical("Bluetooth Wireless Speaker");
    expect(result).toBe(result?.toLowerCase());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deriveOutcomeVertical — token cap edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveOutcomeVertical — cap boundary cases", () => {
  it("1-token fallback returns exactly 1 token", () => {
    const result = deriveOutcomeVertical("crystal");
    expect(result?.split(" ").length).toBe(1);
    expect(result).toBe("crystal");
  });

  it("2-token fallback returns exactly 2 tokens", () => {
    const result = deriveOutcomeVertical("bluetooth speaker");
    expect(result?.split(" ").length).toBe(2);
    expect(result).toBe("bluetooth speaker");
  });

  it("3-token input returns exactly 3 tokens (no truncation needed)", () => {
    const result = deriveOutcomeVertical("yoga mat thick");
    expect(result?.split(" ").length).toBe(3);
    expect(result).toBe("yoga mat thick");
  });

  it("4-token input truncated to 3 tokens", () => {
    const result = deriveOutcomeVertical("yoga mat thick foldable");
    expect(result?.split(" ").length).toBe(3);
    expect(result).toBe("yoga mat thick");
  });

  it("preserves hyphenated tokens as single tokens", () => {
    // tokenize treats hyphens as word chars — "non-slip" stays as one token
    const result = deriveOutcomeVertical("non-slip yoga mat");
    expect(result).toBe("non-slip yoga mat");
  });
});
