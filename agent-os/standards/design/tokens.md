# Room Tokens Are Not Paper Tokens

Busted's surface is a dark textured room holding opaque manila paper evidence.
Authoritative values live in `app/globals.css`; `CLAUDE.md` mirrors them, so
**update both together**.

Dark mode is default — `<html>` always carries `dark`. Never add a light-mode
toggle without explicit instruction.

## The rule that keeps being rediscovered

**Assume every room colour fails on paper until measured.** `--success` is
tuned for the dark ground and measures ~1.7:1 on manila — invisible. That is
why `--paper-money` exists. Inside `<Paper>`, use `--paper-muted`, never
`text-muted-foreground`.

## Measure contrast correctly

Convert oklch → OKLab → **linear** sRGB, then feed the WCAG luminance formula
directly. Running the sRGB transfer function over already-linear values
double-converts and fabricates failures — it once wrongly flagged
`--muted-foreground` at 2.9:1 when it is actually 8.2:1.

Also check the result is **inside sRGB gamut**. Chroma that needs a negative
linear channel is silently clamped by the browser, so the rendered colour is
not the specified one and a P3 display will not clamp identically. Pin the
chroma into gamut instead.

## Font tokens

`@theme inline` tokens must name the `next/font` variable, never themselves.
`--font-sans: var(--font-sans)` is self-referential, invalid at computed-value
time, and falls back to the browser's **serif**.

The `__variable_*` classes must sit on `<html>`, not `<body>`: `globals.css`
sets `font-family` on `html`, and custom properties only inherit **downward**.
Give every `next/font` call a `fallback` array so a fetch failure degrades to
sans rather than serif.

## Intensity is derived, never chosen

`flame` → solid bar, count-up, stamp. `amber` → same sheet, ghosted bar, no
stamp. `silent` → one muted line. Decorating `silent` defeats the point of
having tiers.

Tier must never be carried by hue alone: `--primary` and `--amber-tier` measure
1.38:1 against each other.

`--stamp` is for the BUSTED stamp and nothing else. A colour used once is a
signature; used twice it is just part of the palette. Errors keep
`--destructive`.

## Never reintroduce

The ambient blur blobs and the dot grid. They were the strongest "generic AI
SaaS" tell and among the most expensive things on the page to paint. The film
grain on `body::after` stays, is never animated, and sits at `z-index: 100`
above every app layer.
