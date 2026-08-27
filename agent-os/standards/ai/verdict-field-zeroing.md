# Verdict-Specific Field Zeroing

Each terminal verdict clears a **different** field set in `applyClamps()`.
Returning a prediction without the right fields zeroed leaks data across paths.

`not_a_product` — clears prices, `aliexpressKeywords`, `styleTokens`,
`materialPriors`. Supplier search is additionally disabled in the route handler.

`collection_page` — clears prices and `aliexpressKeywords`, **keeps**
`styleTokens` + `materialPriors`, floors confidence at 0.7. The browse path
builds its own query from category + these tokens.

Every other verdict — must clear `styleTokens` and `materialPriors` (rule 11).
These are browse-mode only; leaking them into the product path corrupts the
query.

- `styleTokens` / `materialPriors` are populated **only** for `collection_page`.
- Adding a verdict means deciding its zeroing set explicitly — there is no
  safe default.
