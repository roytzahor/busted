# isLikelyDropship Is Derived, Never Authored

`isLikelyDropship` is always recomputed as `verdict === "dropship"`.

- Never read it from the model's response.
- Never trust it from a cached row — `parseCachedAiPrediction()` re-derives it.
- It exists only for back-compat with cached entries written before `verdict`.

`verdict` is the single source of truth. Treat `isLikelyDropship` as a read-only
projection of it.
