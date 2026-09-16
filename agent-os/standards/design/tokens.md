# Room Tokens Are Not Paper Tokens

Busted's surface is a dark textured room holding opaque manila paper evidence.
Authoritative values live in `app/globals.css`; the table below mirrors them, so
**update both together** (a marked mirror, per `context/single-source`).

Dark mode is default — `<html>` always carries `dark`. Never add a light-mode
toggle without explicit instruction.

## The tokens

| Role | Value | Usage |
|---|---|---|
| Background | `oklch(0.11 0.014 48)` | The room — deep, near-neutral warm dark |
| Paper | `oklch(0.855 0.032 82)` | Opaque **manila** evidence stock. Consumed via `<Paper>`, never applied directly. NOT bone — `oklch(0.94 0.012 85)` read as a flashbang against the room, and as light mode leaking into a dark-only product |
| Paper ink | `oklch(0.24 0.03 55)` | Text on paper — 10.6:1 |
| Paper muted | `oklch(0.44 0.03 60)` | Secondary text on paper — 5.0:1 |
| Paper rule | `oklch(0.24 0.03 55 / 0.2)` | Hairlines on paper |
| Paper money | `oklch(0.42 0.10 155)` | Savings green **on paper** — 5.2:1. Chroma pinned into sRGB; 0.16 was out of gamut and being clamped |
| Primary/fire | `oklch(0.72 0.17 50)` | Amber-orange — brand, `flame` tier |
| Amber tier | `oklch(0.80 0.13 78)` | `amber` tier — must stay distinct from fire |
| Stamp | `oklch(0.55 0.22 27)` | **BUSTED stamp only** — never errors. Chroma pinned into sRGB; 3.8:1 room / 3.5:1 paper |
| Success/relief | `oklch(0.68 0.14 155)` | The user's win. Room only; on paper use Paper money |
| Destructive | `oklch(0.65 0.2 25)` | Errors and destructive actions |
| Border | `oklch(1 0.02 55 / 10%)` | Hairline white borders |

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

## Accessibility baseline

- Contrast ≥ 4.5:1 on all text. `--muted-foreground` on the room meets AA.
- Icon-only and decorative elements carry `aria-hidden="true"`; interactive
  controls carry labels.
- Never override `outline: none` — keep the default ring styles.

## Never reintroduce

The ambient blur blobs and the dot grid. They were the strongest "generic AI
SaaS" tell and among the most expensive things on the page to paint. The film
grain on `body::after` stays, is never animated, and sits at `z-index: 100`
above every app layer — the highest app layer in use is the recent-scans drawer
at `z-[70]`, so any new overlay above 100 sits outside the texture and looks
detached. Keep it `pointer-events: none`.
