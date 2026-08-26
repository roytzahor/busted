# Cache Parser Back-Compat Obligation

`parseCachedAiPrediction()` (`lib/types/cache.ts`) reads rows written by every
past version of the schema. It must never throw on an old row.

- Parse **every** field defensively with a default: `typeof x === "string" ? x : ""`,
  `Array.isArray(x) ? x.filter(isString) : []`, `typeof x === "number" ? x : null`.
- Derive `verdict` from the legacy `isLikelyDropship` boolean when absent
  (`parseVerdict(p.verdict, p.isLikelyDropship)`).
- Bail to `null` only on structural failure (not an object, missing
  `provider`/`model`).

**Adding a field to `DropshipPrediction` requires adding a matching defensive
branch here.** Without one, every row cached before the change fails to parse and
the cache silently misses.
