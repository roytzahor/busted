# Busted — Design Direction: "The Ledger"

> Full design specification. Written to be implementable by someone — or some
> agent — with no memory of the conversation that produced it. Every choice
> states *why*, because a rationale you can argue with is worth more than a
> mockup you can only copy.
>
> **Status:** phases 1–5 have SHIPPED (tokens, film grain, blob removal,
> `components/ui/paper.tsx`, `components/ui/stamp.tsx`, tier-driven
> `components/verdict-sheet.tsx`, the motion detail pass, the markup bar, and
> the landing ledger rebuild — see §10.2 for exactly what's done vs. open
> within Phase 4). This document supersedes the previous "The Teardown"
> draft. It **keeps the shipped material system** and **cancels the unbuilt
> tear-to-reveal animation.** §10 accounts for the rework honestly.
>
> Companion docs: `CLAUDE.md` (§Design Language — keep the token table in sync),
> `.claude/lessons.md`, `ROADMAP.md`.

---

## תקציר בעברית (TL;DR)

**הבעיה:** האתר בנוי מאותה ערכת תבניות שבה משתמשות החנויות שהוא חושף — גלסמורפיזם,
כתמי טשטוש, כותרות גרדיאנט, bento grid. אנחנו מאשימים אותן בתבניתיות בעזרת תבנית.
ויש בעיה שנייה, חדה יותר: אנחנו מרוויחים עמלה על הקישור לעלי-אקספרס. ככל שהעיצוב
צועק "רמאים!" חזק יותר, כך המשתמש צריך לשאול חזק יותר "רגע, מי משלם לכם?"

**מה נשאר:** החדר הכהה עם הגרעין, וגיליונות הראיות האטומים בצבע מנילה. זה לא קישוט —
זו ההיררכיה של כל האתר: **מה שנמצא על נייר, אנחנו עומדים מאחוריו.** רק בזכות הכלל
הזה מצב `silent` יכול להיות שורת טקסט בלי נייר בכלל, ולהיקרא כאיפוק מכוון ולא
כמסך שלא הספיקו לעצב.

**מה משתנה:** "התלישה" מבוטלת. קריעה היא פעולת הרס, והמוצר לא הורס שום דבר — הוא
**מודד**. הרגע המרכזי הופך ל**קו המידה**: פס אחד, בקנה מידה אמיתי, שמראה איזה חלק
מהמחיר הוא המוצר ואיזה חלק הוא אוויר. החלק המלא בדיו = כמה זה באמת עולה. השאר,
מקווקו וריק = השוליים שלהם. בלי צבע, בלי דרמה. אריתמטיקה.

**למה זה חזק יותר:** אנימציית קריעה לא נושאת שום מידע — היא מעבר, ובלי אנימציה לא
נשאר ממנה כלום. הפס נושא את כל הטיעון, ולכן הוא נכון באותה מידה גם כשהאנימציה
כבויה. כלי שמראה את החשבון שלו אמין יותר מכלי שצועק פסק דין. וזה בדיוק הכלי שיש לו
עמלה על התשובה.

**המשמעת:** עוצמת העיצוב **נגזרת** מ-`presenceTier` שהשרת מחשב, אף פעם לא נבחרת.
`flame` → נייר קרוע, פס מלא, חותמת. `amber` → נייר שלם, פס בקו מתאר, בלי חותמת.
`silent` → שורה אחת, בלי נייר. **מדדנו: `--primary` ו-`--amber-tier` נבדלים
ב-1.38:1 בלבד — גוון לבדו לא יכול לשאת את ההבדל בין הרמות. לכן ההבדל מבני:
חותמת/בלי חותמת, קרוע/שלם, מלא/מתאר.**

**מה לא נעשה:** טיפוגרפיה קינטית, WebGL, מצב בהיר, קישוט של מצב `silent`, וקישור
הכסף אף פעם לא מופיע לפני הראיות.

---

## 0. The argument with the previous draft

The previous document proposed **The Teardown**: a dark textured room, opaque
manila evidence sheets, and — as the centrepiece — a `clip-path` tear ripping
across the store's listing to reveal the supplier underneath.

Two of those three were right. One was costume.

### 0.1 What survives, and why it is stronger than the draft claimed

**The surface predicate — "is it on paper?" — is the best idea in the previous
document, and it was buried under a differentiation argument.**

The draft justified paper mainly as *"everyone's dark UI is translucent surfaces
on dark; ours is opaque paper."* That is a taste argument, and taste arguments
expire. The real justification is structural: paper is a **binary predicate that
carries meaning no amount of opacity tuning could carry.**

> If it is on paper, we are standing behind it. If it is in the room, we are not.

That single rule is what lets the `silent` tier render as one line of muted text
with no surface at all and read as *deliberate restraint* rather than an
unstyled state. Nothing else in the system can do that job. Glass can be more or
less transparent; it cannot be *absent* in a way that means something. Keep it.

The manila stock, the film grain, the reserved stamp red, and the room/paper
token split all survive unchanged. They are shipped, they are measured, and they
are correct.

### 0.2 What does not survive: the tear

**"Tearing" is the wrong verb, and I am cancelling it before it is built.**

Three reasons, in order of weight:

1. **A tear carries no information.** It is a transition — pure choreography
   between two states that both exist without it. The test the previous document
   itself proposed ("render the final state immediately under
   `prefers-reduced-motion`; the information is identical either way, which is
   the test of whether motion was decoration or content") is a test the tear
   fails. If the reduced-motion path is *just as good*, the animation was
   decoration. Roughly 15–20% of users run reduced motion; for them the
   centrepiece of the design simply does not exist.

2. **Tearing is destruction, and the product does not destroy anything.** It
   places a second listing beside the first and shows the distance between them.
   The user may still legitimately buy from the store — faster shipping, local
   returns, a warranty. A design whose central act is ripping the store's
   listing in half forecloses a choice that is genuinely the user's to make, and
   the extension's whole `silent`-by-default contract exists precisely because
   we refuse to overclaim.

3. **It is theatre wrapped around a number that is already the argument.** The
   shipped `verdict-sheet.tsx` gets this right in code and the old document got
   it wrong in prose: `×8.4` at 72px *is* the case. The tear was a way of
   arriving at it expensively — a `clip-path` keyframe plus a
   `filter: drop-shadow` (because `clip-path` clips `box-shadow` away), the two
   most expensive things in the whole spec, spent on a moment that arrives
   twelve seconds after the user already knows the answer is coming.

### 0.3 The deeper problem the draft did not name: we are paid for the answer

Busted earns affiliate revenue on the AliExpress link. That is fine, and it is
disclosed. But it changes what a visual language has to do.

A forensic, prosecutorial register — evidence room, case file, rubber stamp,
*tear the store's listing apart* — performs outrage on behalf of a party that
profits from the redirect. The louder the accusation, the more a sceptical
reader should ask who benefits. **Theatre and financial interest compound into
suspicion; arithmetic and financial interest do not.**

Prosecutors are not trusted advisors. Auditors are. The distinction is that an
auditor shows the work and lets you check it.

### 0.4 The commitment

**Direction: The Ledger. Keep the room, keep the paper, keep the stamp.
Replace the centrepiece: the product's act is not *tearing*, it is
*measuring*.**

The signature element becomes **the markup bar** (§4.6): one horizontal bar,
drawn to true scale, showing what fraction of the price is the product and what
fraction is air. Solid ink for the real cost. Hatched void for the margin. Tick
marks and a dimension line, so it reads as a measurement drawing and never as a
progress bar.

The brand still shouts — the stamp lands, the multiplier is enormous. It has
*earned* the right to, because the sober arithmetic is sitting directly beneath
it. A newspaper may run a screaming headline over a sourced article. That is the
whole thesis in one line:

> **Shout the verdict. Show the arithmetic.**

Everything in §4 and §5 descends from that.

---

## 1. The strategic problem

Busted's proposition is: *this store is a template with a markup.* We scrape it,
prove the product is a commodity anyone can buy for less, and hand over the real
link.

**Problem one — the credibility leak.** The landing page (`components/search-hub.tsx`)
is still built from the 2023–24 AI-SaaS kit: gradient clip-text headlines
(lines 313–320), glass pills (`rounded-2xl border border-white/8 bg-white/[0.03]
backdrop-blur-sm`, lines 332, 346), a glass input card with a `shine-top`
gradient (line 383), and a three-up bento of "how it works" cards with 8xl
watermark numerals and a `blur-3xl` decorative glow inside each one (lines
600–636). Open any Israeli dropship storefront: same instincts, same Shopify
theme, same glassy hero, same gradient CTA. **We accuse them of being a template
using a template.**

**Problem two — glass cannot express doubt.** Translucency communicates softness
and ambiguity uniformly. Busted must communicate *certainty* when it has it and
*honest doubt* when it does not — the exact distinction the entire
`presenceTier` architecture exists to protect. A language built on opacity
percentages has no vocabulary for "we are not claiming this."

**Problem three — we are paid for the answer** (§0.3). The interface must read
as an audit, not a pitch.

**Design mandate:** the interface must be able to shout, must be able to
whisper, must be able to *say nothing at all*, and the user must be able to tell
which is happening in under a second — before reading a word.

---

## 2. The concept: The Ledger

A dropship store sells you a number. Busted breaks the number into its parts and
shows you which part is the thing and which part is the story about the thing.

Every surface in the product is a line item in a running record:

- **A scan result** is a ledger entry: what it costs, what they charge, the gap.
- **The landing page** is the open ledger: a column of recent entries, real,
  with real multipliers.
- **The live pipeline** is the chain of custody: timestamped rows showing how the
  entry was produced.
- **The share card** is the entry, torn off and handed to someone.

### 2.1 Tier and verdict are two axes

`computePresenceTier()` (`lib/analyze/presence-tier.ts`) returns `silent` for
*every* non-dropship verdict, so a genuinely `legit` brand and an unreadable page
land in the same tier. That is correct for the extension badge — never alarm on a
legit store — and wrong for a sentence on a web page. **An earlier draft
collapsed these two axes and was wrong.**

> **Tier decides how loud. Verdict decides what we say.**

`presenceTier` is computed server-side and rendered **verbatim**. Never re-derive
a tier client-side from `confidence`; missing or errored ⇒ `silent`. This is a
hard invariant in `CLAUDE.md`, not a design preference — it is the only reason
the extension badge and this page can never disagree about our own confidence.

### 2.2 The register table

| Tier | Verdict | Register |
| --- | --- | --- |
| `flame` | `dropship`, conf ≥ 0.7 | **The Entry.** Torn sheet, solid bar, giant multiplier, stamp. |
| `amber` | `dropship`, conf 0.5–0.7 | **The Draft Entry.** Clean sheet, outline bar, hedged figure, no stamp. |
| `silent` | `legit` | **The Clean Bill.** One positive sentence in the room. Not an apology. |
| `silent` | `insufficient_evidence` / `not_a_product` / low-conf `dropship` | **The Blank.** One muted sentence. No sheet, no colour, no figure. |

**Design intensity is derived from the tier, never chosen.** Decorating the
`silent` state defeats the entire point of having tiers. A tool that performs
certainty it does not have is exactly as untrustworthy as the stores it audits.
**The silence is what buys the right to shout.**

### 2.3 The tier must not be carried by hue — measured

Invariant: `--primary` (fire, `flame`) and `--amber-tier` (`amber`) must stay
visibly distinct or the tier system is decorative.

**They are not distinct enough on their own.** Measured (method in §4.2):

| Pair | Contrast |
| --- | --- |
| `--primary` `oklch(0.72 0.17 50)` vs `--amber-tier` `oklch(0.80 0.13 78)` | **1.38:1** |

1.38:1 is a hue difference, not a value difference. In grayscale, to a
deuteranope, or on a bad phone screen in sunlight, flame and amber are the same
colour. Retuning does not rescue it: pushing amber to `oklch(0.83 0.12 88)` only
reaches 1.55:1, and going further makes the *lower* tier brighter than the
higher one, which is backwards.

**Amendment to the invariant (§12 records it):** the two tokens must remain
visibly distinct — that stands — but **hue may never be the only carrier of the
tier.** Tier is carried structurally, and colour merely agrees with it:

| Signal | `flame` | `amber` |
| --- | --- | --- |
| Sheet edge | torn (`<Paper torn>`) | clean rectangle |
| Markup bar | solid ink fill | outline + 30% ghost fill |
| Multiplier | `×8.4`, Figure-XL | `≈×8.4`, Figure-L, tilde prefix |
| Stamp | present | absent |
| Headline grammar | statement | question |
| Accent hue | `--primary` | `--amber-tier` |

Six carriers, five of which survive grayscale. This is also what satisfies WCAG
2.2 SC 1.4.1 (Use of Colour) at the *tier* level, not merely at the verdict
level — a stricter reading than the previous draft applied.

---

## 3. Research basis

Design choices below cite these. **Where a trend report contradicts a standard or
a measurement, the standard wins.** Trend reports are marked as fashion.

**[Fashion — trend reports]** *Tactile brutalism / anti-grid is the 2026
counter-movement.* Premium work pivoted to "sharp geometry, stark contrasts,
single-pixel borders", with anti-grid brutalism named as a reaction against bento
grids ([Fireart](https://fireart.studio/blog/the-best-web-design-trends/),
[Figma](https://www.figma.com/resource-library/web-design-trends/)). Used here
only as corroboration for abandoning bento + glass — a decision that stands on
§1's credibility argument regardless of what 2026 does.

**[Fashion, and we were here first]** *Dark mode as a design language rather than
a toggle* ([Lovable](https://lovable.dev/guides/website-design-trends-2026),
[TheeDigital](https://www.theedigital.com/blog/web-design-trends)). Busted is
already dark-only. `<html>` always carries `dark`. No light mode, no toggle.

**[Technique, verifiable]** *CSS-generated grain replaces WebGL for texture* —
mathematically generated CSS textures give physical depth without the paint cost
of heavy WebGL ([Fireart](https://fireart.studio/blog/the-best-web-design-trends/),
[Midrocket](https://midrocket.com/en/guides/ui-design-trends-2026/)). Verifiable
in a profiler, and already shipped at ~1.2KB for the whole page.

**[Research beats fashion]** *Kinetic typography is a demo trend, not a
production trend.* Ubiquitous on Awwwards; "almost never ships in production,
since animated text fights screen readers, fights search crawlers, and adds
layout shift that destroys Core Web Vitals"
([DEV/studiomeyer](https://dev.to/studiomeyer_io/web-design-trends-2026-what-actually-held-up-after-six-months-23p8)).
**Constraint adopted: exactly one kinetic moment on the site** — the markup
count-up, synchronised with the bar draw so they are one event and not two, on
fixed-width `tabular-nums` so it cannot shift layout, with a static
reduced-motion path. No kinetic body text anywhere.

**[Research]** *Forensic aesthetics.* Evidence rendered in a technical, exacting,
compositionally deliberate form is "sensed rather than merely intellectually
understood" — and, crucially, in evidence work **"colour is aesthetic, clarity is
evidentiary"** ([Opinio Juris](https://opiniojuris.org/2025/11/28/the-aesthetic-language-of-open-source-investigations-the-image-of-truth-and-the-demand-for-action/),
[Ubiquiti](https://academy.ui.com/topics/designing-for-evidence-capture)). This
is the licence for the ledger/receipt language **and** the direct authority for
§4.6's decision to build the markup bar out of ink and void rather than out of
two colours.

**[Standards, not fashion]** WCAG 2.2 SC 1.4.3 (contrast ≥ 4.5:1 for body text,
3:1 for large), SC 1.4.11 (non-text contrast ≥ 3:1 for graphical objects — this
is what governs the markup bar), SC 1.4.1 (never colour alone), SC 2.5.8
(target size). Non-negotiable, and they are what caught the two-colour bar in
§2.3 before it shipped.

**[Craft baseline]** Apple's *The Details of UI Typography* (WWDC 2020) —
tracking is size-specific and leading tracks size inversely; hierarchy is built
from weight + size + leading **as a set**. The previous draft specified tracking
and never once specified leading, which is why §4.4 is a full table with both.

**[Craft baseline]** *Designing Fluid Interfaces* (WWDC 2018) and the
`make-interfaces-feel-better` / Emil Kowalski detail principles: respond on
pointer-down, exits softer than enters, never `transition: all`, never enter from
`scale(0)`, `tabular-nums` everywhere, concentric radii, ≥40×40px hit areas.
Treated as baseline, not trend.

---

## 4. Visual system

### 4.1 The surface predicate

Two grounds, and the boundary between them is the site's entire hierarchy.

- **The room** — background, navigation, chrome, ambient. Deep, warm, grained.
  Things in the room are context, controls, and questions.
- **Paper** — opaque manila stock. Anything stating a fact we stand behind: the
  price teardown, the evidence list, the supplier card, the scan receipt.

Paper is **never translucent**. Hard edge, real drop shadow, something you could
pick up. Consumed through `<Paper>` (`components/ui/paper.tsx`), never applied
ad hoc.

**Corollary — the rule that must not be softened:** if a claim is uncertain, it
does not get a sheet. This is why `silent` renders bare and why `amber` gets a
clean rectangle instead of a torn one. The moment we start putting hedges on
paper "so the layout doesn't look empty", the predicate dies and the whole
system becomes decoration.

### 4.2 Palette

Method (invariant, and it exists because it was got wrong): **convert oklch to
*linear* RGB and feed the WCAG luminance formula directly.** Running the sRGB
transfer function over values that are already linear double-converts and
fabricates failures — it wrongly flagged `--muted-foreground` at 2.9:1 when it
measures **8.17:1**.

**New check added to the method: verify sRGB gamut before trusting a ratio.**
Two shipped tokens are outside sRGB, so the browser gamut-maps them and the
*rendered* colour is not the specified one — which means the measured ratio was
being computed for a colour that never appears on screen.

| Token | Shipped | Max in-gamut C at that L/H | Fix |
| --- | --- | --- | --- |
| `--stamp` | `oklch(0.55 0.24 27)` | 0.2247 | pin to `oklch(0.55 0.22 27)` |
| `--paper-money` | `oklch(0.42 0.16 155)` | 0.1046 | pin to `oklch(0.42 0.10 155)` |

Both are visual no-ops — the browser was already clamping to these values. But a
spec that states a colour the renderer cannot produce is a spec that will lie to
the next person who measures it. Pin them.

**Corrected measurement:** the previous document reported `--paper-money` at
4.8:1 on paper. Measured at the in-gamut value it is **5.13:1**. Also
recorded so the number stops drifting.

```css
.dark {
  /* ── The room ────────────────────────────────────────────────────────
     Paper only reads as paper against a ground dark enough to be a room
     rather than a card. */
  --background:        oklch(0.11 0.014 48);
  --foreground:        oklch(0.97 0.01 55);
  --muted-foreground:  oklch(0.72 0.04 55);
  --border:            oklch(1 0.02 55 / 10%);

  /* ── Paper ───────────────────────────────────────────────────────────
     MANILA, not bone. The first build used oklch(0.94 0.012 85) and it read
     as a flashbang against the room — and as light mode leaking into a
     dark-only product. Lower luminance + warmer cast = aged stock. */
  --paper:             oklch(0.855 0.032 82);
  --paper-ink:         oklch(0.24 0.03 55);
  --paper-muted:       oklch(0.44 0.03 60);
  --paper-rule:        oklch(0.24 0.03 55 / 0.2);
  --paper-money:       oklch(0.42 0.10 155);   /* was 0.16 C — out of gamut */

  /* ── Signals ─────────────────────────────────────────────────────────*/
  --primary:           oklch(0.72 0.17 50);    /* fire — brand, flame tier  */
  --amber-tier:        oklch(0.80 0.13 78);    /* amber tier                */
  --success:           oklch(0.68 0.14 155);   /* the user's win, IN ROOM   */
  --destructive:       oklch(0.65 0.20 25);    /* errors — never the stamp  */
  --stamp:             oklch(0.55 0.22 27);    /* BUSTED stamp ONLY         */
}
```

**Rules**

1. **Stamp red is reserved.** It appears on the BUSTED stamp and nowhere else —
   not on errors, not on destructive buttons, not on the markup bar. Errors keep
   `--destructive`. A colour used once is a signature; used twice it is a
   palette.
2. **Green is only ever the user's win** — savings, the real supplier link.
   Never a generic success toast, never a "verified" chip.
3. **Room tokens are not paper tokens.** `--success` is tuned for the dark ground
   and measures **1.74:1** on manila — invisible. `--paper-money` exists for
   exactly this. **Assume every room colour fails on paper until measured.**
4. **Paper is a two-ink surface.** `--paper-ink` (and its alphas) plus
   `--paper-money` for the one green figure. **No `--paper-fire` token** — I
   measured the candidates and the best in-gamut fire at manila-compatible
   lightness (`oklch(0.48 0.138 45)`) reaches only 4.45:1, i.e. it fails AA for
   body text. More importantly, a third ink would break §4.6's whole argument
   that the arithmetic is sober. Fire lives in the room; paper stays in ink.
5. **Hue may not carry the tier** (§2.3, measured 1.38:1).

**Measured contrast — recompute after any token edit**

| Pair | Ratio | Required |
| --- | --- | --- |
| `--paper-ink` on paper | **10.63:1** | 4.5 (AA body) |
| `--paper-muted` on paper | **5.03:1** | 4.5 |
| `--paper-money` on paper | **5.13:1** | 4.5 |
| `--paper-ink` on paper (bar fill vs ground) | **10.63:1** | 3.0 (SC 1.4.11) |
| `--foreground` on room | **18.73:1** | 4.5 |
| `--muted-foreground` on room | **8.17:1** | 4.5 |
| `--primary` on room | **7.80:1** | 4.5 |
| `--amber-tier` on room | **10.81:1** | 4.5 |
| `--success` on room | **7.55:1** | 4.5 |
| `--destructive` on room | **5.76:1** | 4.5 |
| paper sheet against room | **13.15:1** | 3.0 |
| `--stamp` on room / on paper | **3.76:1 / 3.50:1** | 3.0 (decorative, `aria-hidden`) |
| `--primary` vs `--amber-tier` | **1.38:1** | *cannot reach 3.0 — see §2.3* |

### 4.3 Texture

Two layers. Pure CSS. No network request. No WebGL.

**Film grain** — `.dark body::after`, one tiled inline SVG `feTurbulence`,
`opacity: 0.04`, `z-index: 100`, `pointer-events: none`, hidden in `@media print`.

`z-index: 100` is load-bearing, not arbitrary: it must sit above **every** app
layer so the texture unifies modals and drawers too. Highest currently in use is
the recent-scans drawer at `z-[70]`; nav is `z-50`. **Any new overlay above 100
will sit outside the texture and look detached from the page.**

**Never animate the grain.** Moving noise costs battery and repaints for an
effect nobody consciously registers, and it reads as a broken video codec.

**Paper fibre** — `.paper-fibre` utility: a `radial-gradient` head-lift plus a
3px `repeating-linear-gradient` at 2.8% ink. Sub-perceptual, but it stops manila
reading as a flat swatch beside the grain.

**Never reintroduce the ambient blur blobs or the dot grid.** The four fixed
`blur(120–160px)` divs were the single strongest "generic AI SaaS" tell and among
the most expensive things on the page to paint. They are gone from
`app/page.tsx`, `app/scan/[id]/page.tsx` and `app/store/[domain]/page.tsx` and
they stay gone. A regular dot lattice reads as "digital product"; grain reads as
a physical surface, which is what paper stock needs to sit on.

Note that `app/globals.css` still ships `.glass`, `.glass-md`, `.glow-primary`,
`.glow-primary-xl`, `.glow-success`, `.glow-success-xl` and `.shine-top`. They
are still consumed by `search-hub.tsx` and `analysis-results.tsx`. They are
**deprecated, not deleted** — removal is the last step of phase 6, once nothing
references them, so that the migration stays revertible phase by phase.

### 4.4 Typography

**No new fonts.** Geist Sans, Geist Mono and Heebo are already loaded in
`app/layout.tsx`. A display face would cost LCP for marginal gain, and Geist at
800 with tight tracking is brutal enough.

**Every size gets both a tracking value and a leading value.** They are one
decision, not two: tracking tightens as size grows because letters read too far
apart at display sizes; leading tightens as size grows because long lines of big
type need less breathing room per em than short lines of small type do. The
previous draft specified tracking and never leading, which is why headings in
`search-hub.tsx` carry an ad-hoc `md:leading-[1.05]` on one breakpoint only.

#### Latin scale (Geist Sans / Geist Mono)

| Role | Size | Face / weight | Tracking | Leading | Tailwind |
| --- | --- | --- | --- | --- | --- |
| **Figure XL** — the multiplier | `clamp(3.25rem, 8vw, 5rem)` | Mono 700 | `-0.045em` | `0.88` | `font-mono text-[clamp(3.25rem,8vw,5rem)] font-bold tracking-[-0.045em] leading-[0.88]` |
| **Display** — hero, page titles | `clamp(2.25rem, 5.5vw, 3.75rem)` | Sans 800 | `-0.035em` | `1.04` | `text-[clamp(2.25rem,5.5vw,3.75rem)] font-extrabold tracking-[-0.035em] leading-[1.04] text-balance` |
| **Figure L** — a price | `1.875rem` | Mono 600 | `-0.02em` | `1.0` | `font-mono text-3xl font-semibold tracking-[-0.02em] leading-none` |
| **Title** — the verdict sentence | `1.375rem` | Sans 700 | `-0.018em` | `1.22` | `text-[1.375rem] font-bold tracking-[-0.018em] leading-[1.22] text-balance` |
| **Subhead** — section head | `1.0625rem` | Sans 600 | `-0.008em` | `1.35` | `text-[1.0625rem] font-semibold tracking-[-0.008em] leading-[1.35]` |
| **Body — room** | `1rem` | Sans 400 | `0` | `1.6` | `text-base tracking-normal leading-[1.6] text-pretty` |
| **Body — paper** | `0.9375rem` | Sans 400 | `0.003em` | `1.65` | `text-[0.9375rem] tracking-[0.003em] leading-[1.65] text-pretty` |
| **Meta / caption** | `0.8125rem` | Sans 500 | `0.006em` | `1.45` | `text-[0.8125rem] font-medium tracking-[0.006em] leading-[1.45]` |
| **Label** — mono caps | `0.625rem` | Mono 500 | `0.14em` | `1.1` | `font-mono text-[10px] font-medium tracking-[0.14em] leading-[1.1] uppercase` |
| **Figure inline** | `0.875rem` | Mono 500 | `-0.005em` | `1.45` | `font-mono text-sm font-medium tracking-[-0.005em] leading-[1.45]` |

Rationale for the two least obvious rows:

- **Figure XL at leading `0.88`.** Below 1.0 because the multiplier is always a
  single line and mono digits have no descenders — 1.0 leaves a visible dead band
  under the glyphs that makes the figure float off its baseline rule. `0.88`
  seats it.
- **Body on paper is *smaller* and *looser* than body in the room.** Dark ink on
  a light ground is positive polarity: strokes do not bloom, so 15px on paper is
  as legible as 16px in the room. But dense dark text on a small sheet needs more
  air between lines than light text on an infinite dark ground, hence `1.65` vs
  `1.6`. Slightly positive tracking (`0.003em`) for the same reason — the
  previous draft's single global tracking value would have been wrong on one of
  the two surfaces no matter which value it picked.

#### Hebrew scale (Heebo) — overrides, not a translation

Hebrew is not Latin at a different width. Three structural facts drive every
override: no case, no ascenders or descenders, and tightly counter-spaced
letterforms.

| Role | Tracking | Leading | Note |
| --- | --- | --- | --- |
| Display | `-0.02em` **hard cap** | `1.15` | Heebo at `-0.04em` is unreadable. The Latin display value must never be reused. Looser leading than Latin's `1.04`: with no ascender/descender interlock, `1.04` reads as a solid block. |
| Title | `-0.01em` | `1.3` | |
| Body | `0` | `1.75` | Not 1.6. Hebrew's uniform glyph height removes the vertical rhythm that ascenders and descenders create in Latin, so line separation has to come from leading alone. |
| Meta | `0` | `1.55` | |
| **Label** | `0.06em`, **`normal-case`**, `11px` | `1.25` | See below. |

**The label rule is a shipped bug.** `PaperLabel` in `components/ui/paper.tsx`
currently applies `font-mono text-[10px] tracking-[0.14em] uppercase`
unconditionally. In Hebrew: `uppercase` is a no-op (harmless), but `0.14em`
tracking on Heebo at 10px destroys word cohesion — Hebrew has no inter-word
capital cue to hold words together once letters are pushed apart. Worse,
**Geist Mono has no Hebrew coverage**, so an RTL label silently falls back to the
system mono and the label stops matching every other label on the sheet.

Fix (phase 4, one edit):

```tsx
"font-mono text-[10px] tracking-[0.14em] uppercase",
"rtl:font-sans rtl:text-[11px] rtl:tracking-[0.06em] rtl:normal-case",
```

**Numerals — always.** `font-variant-numeric: tabular-nums` is set on `body` and
must stay. Prices animate, confidence updates live, the pipeline streams.
Without tabular figures the layout jitters on every tick, which reads as
instability in a product selling certainty. Numerals stay **LTR in both
directions**.

**Kill the gradient clip-text headlines.** `bg-gradient-to-br … bg-clip-text
text-transparent` appears at `search-hub.tsx:314,317` and
`analysis-results.tsx:156,171,185,192`. It is the most-copied element of the
template era, it costs legibility, it adds no information, and `text-transparent`
breaks high-contrast modes. Replace with solid `--foreground`, and colour
**exactly one word** with `--primary`.

### 4.5 Geometry, spacing, rhythm

**Radius is a genre signal.** Rounded reads as "app". Square reads as "document".

| Surface | Radius | Why |
| --- | --- | --- |
| Paper sheet | `rounded-[2px]` | Nearly square. Shipped in `<Paper>`; do not change. |
| Elements nested on paper | `rounded-[1px]` or square | Concentric radius bottoms out here. |
| Markup bar | `rounded-[1px]` | A measurement has ends, not caps. A fully rounded bar reads as a progress meter. |
| Interactive chrome (buttons, inputs) | `rounded-lg` (10px) | Controls should still feel like controls. |
| Chips, avatars | `rounded-full` | Genuinely circular objects only. |

**Concentric radii, enforced:** `outer = inner + padding`. The codebase violates
this in several places — `rounded-2xl` parent containing a `rounded-2xl` child is
the recurring bug. Fix as each component is touched, not in a sweep.

**Hairlines, not borders.** Inside paper: `border-t border-paper-rule` (via
`<PaperRule>`), never a full box border. Between room sections: layered shadow or
nothing at all. A page of boxes-in-boxes is what makes an interface look
bureaucratic.

**Rotation budget: exactly one rotated element per view — the stamp, at `-4deg`.**
One tilted element reads as intentional; three read as a theme.

**Vertical rhythm on a sheet**, matching the shipped `<Paper>`:

```
p-5            sheet padding (20px)
gap-3          between semantic blocks (12px)
space-y-1      inside a list (4px)
mt-[0.55em]    optical offset for list bullets against their first line
```

**Measure:** body copy caps at `max-w-prose`; a sheet caps at `max-w-xl` (36rem).
Beyond that, evidence lists become scannable-but-unreadable.

**The torn edge stays, and now has a better reason.** `.paper-torn` was
justified as "a case file someone ripped up". Under The Ledger it is exactly
right for a different and stronger reason: **a ledger page is torn off a pad.**
That is why the points are irregular — a tear-off is never clean, and evenly
spaced points read as a decorative zigzag, which is worse than a clean edge.

Two constraints on it, both shipped and both load-bearing:
- `clip-path` **clips `box-shadow` away**, so torn sheets take depth from
  `filter: drop-shadow` instead. That is the pricier of the two.
- Therefore: **`torn` is reserved for `flame`.** A page where everything is torn
  is just a texture. `verdict-sheet.tsx` already gates it with `<Paper torn={flame}>`.
  Keep that gate.

### 4.6 The signature: the markup bar

**One memorable element. Everything around it stays quiet.**

```
  ┌──────────────────────────────────────────────────────────────┐
  │ WHAT IT COSTS / WHAT THEY ADD                          ×8.4  │   ← Label
  ├──────────────────────────────────────────────────────────────┤
  │████████│▒╱▒╱▒╱▒╱▒╱│▒╱▒╱▒╱▒╱▒╱│▒╱▒╱▒╱▒╱▒╱│▒╱▒╱▒╱▒╱▒╱|         │   ← bar
  └────────┴──────────┴──────────┴──────────┴──────────┴─────────┘
  ├────────┤                                                      │
  $7.42    ↑ 25%       50%        75%                       ₪238.00
  supplier   tick marks — this is a SCALE, not a progress bar
```

**Construction.** A bordered track on bare paper, hatched with 135° hairlines at
10% ink. Inside it, one solid `--paper-ink` block whose width is the true
fraction `supplierPrice / storePrice`. Three tick hairlines at 25/50/75%. A
dimension line beneath with the two prices at its ends, each in `<bdi>` mono.

```tsx
// components/ui/markup-bar.tsx — new, ~60 lines
<figure className="space-y-2">
  <PaperLabel>
    <span>what it costs / what they add</span>
    <bdi dir="ltr">{multiplier}</bdi>
  </PaperLabel>

  <div
    role="img"
    aria-label={`Supplier price ${supplier} is ${sharePct}% of the ${retail} retail price.`}
    style={{ "--cost-share": costShare } as React.CSSProperties}
    className={cn(
      "relative h-10 w-full overflow-hidden rounded-[1px] border border-paper-ink/25",
      // The void: 135deg hairline hatching. Reads as "excluded region" on a
      // technical drawing, and survives grayscale and every colour-vision type.
      "bg-[repeating-linear-gradient(135deg,oklch(0.24_0.03_55/0.10)_0_2px,transparent_2px_7px)]",
    )}
  >
    {/* The real cost. Solid ink: 10.63:1 against paper — SC 1.4.11 wants 3.0. */}
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 start-0 w-full origin-left rtl:origin-right",
        tier === "flame" ? "bg-paper-ink" : "bg-paper-ink/30 border-e-2 border-paper-ink",
        "[transform:scaleX(var(--cost-share))]",
        "motion-safe:animate-[bar-draw_520ms_var(--ease-out)_both]",
      )}
    />
    {/* Tick marks at 25 / 50 / 75%. */}
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_calc(25%-1px),oklch(0.24_0.03_55/0.18)_calc(25%-1px)_25%)]"
    />
  </div>

  <figcaption className="flex items-baseline justify-between font-mono text-sm tracking-[-0.005em] leading-[1.45] text-paper-muted">
    <bdi dir="ltr">{supplierPrice}</bdi>
    <bdi dir="ltr">{retailPrice}</bdi>
  </figcaption>
</figure>
```

```css
@keyframes bar-draw {
  from { transform: scaleX(0); }
  to   { transform: scaleX(var(--cost-share)); }
}
```

**Why ink and void rather than two colours.** The obvious version fills the cost
segment green and the markup segment fire. I built it and measured it:
`--paper-money` against an in-gamut paper fire measures **1.11:1**. Two adjacent
graphical regions at 1.11:1 fail SC 1.4.11 (needs 3:1), are indistinguishable in
grayscale, and vanish entirely for a deuteranope — for whom the single most
important image in the product would become one undifferentiated stripe. Solid
ink against hatched void measures 10.63:1 against the ground and differs by
**pattern as well as value**, so it survives every vision type, every screenshot,
and the OG card's JPEG compression. This is the Opinio Juris line applied
literally: *colour is aesthetic, clarity is evidentiary.*

**Why it is not a progress bar.** Three deliberate separators: tick marks (a
progress bar has no scale), a dimension line with labelled ends (progress has no
units), and square ends (progress bars are capsule-shaped). If any reviewer says
"this looks like a loading bar", the fix is more ticks and a heavier dimension
line — never colour.

**Why the fill weight encodes the tier.** On `flame` the block is solid: we are
asserting the number. On `amber` it is a 30% ghost with a solid 2px leading edge:
the *position* is asserted, the *mass* is not. The signature element is itself
tier-derived, which is what §2.2's discipline demands — intensity derived, never
chosen, right down to the centrepiece.

**Degenerate cases.** If `costShare < 0.04` the block is invisible; clamp the
rendered scale to `0.04` and add `min-` styling, but keep the *label* honest
(`×24.1`). If there is no supplier price, **the bar does not render at all** —
never draw a measurement from an estimate.

---

## 5. Page architecture

### 5.1 Landing — the open ledger (`components/search-hub.tsx`)

Current: gradient headline, stats pill, mode tabs, glass input card with
`shine-top`, a three-up bento of "how it works" cards with `blur-3xl` glows and
8xl watermark numerals, then FAQ.

Proposed:

```
┌──────────────────────────────────────────────────────────────┐
│ [dark room, film grain]                                      │
│                                                              │
│   כמה באמת עולה                    ← Heebo 800, solid,      │
│   המוצר הזה?                          -0.02em / 1.15         │
│                                                              │
│   ┌──────────────────────────────────────────────┐           │
│   │ הדביקו קישור למוצר                 [ סרוק ]  │  ← the    │
│   └──────────────────────────────────────────────┘    only   │
│                                                        hero  │
│   נסו: imri-jewelry.co.il · remora.co.il                     │
│                                                              │
│   ── ONE CONTINUOUS PAPER SHEET ─────────────────────────    │
│   │ SCANNED                                    LAST 24H │    │
│   │ imri-jewelry.co.il   silver pendant    ×8.4    2m   │    │
│   │ remora.co.il         car mount         ×3.1   14m   │    │
│   │ shopXYZ.co.il        LED strip        ×12.0   31m   │    │
│   │ …                                                   │    │
│   ────────────────────────────────────────────────────────   │
└──────────────────────────────────────────────────────────────┘
```

**The single strongest change: replace the feature bento with the ledger.** Not
three paper cards — **one continuous sheet with `<PaperRule>` hairlines between
rows.** A column of eight real line items is a *record*; three cards is a
*feature grid* wearing paper. The product's entire claim is that it has receipts,
so show the receipts, in the form receipts actually take.

It also scales gracefully in a way cards do not: three cards look thin, twelve
rows look like an institution. `components/recent-scans.tsx` and
`components/trending-now.tsx` already fetch this data.

Row spec: `font-mono text-sm tracking-[-0.005em] leading-[1.45]`, domain at
`text-paper-ink`, product title truncated at `text-paper-muted`, multiplier
right-aligned in `tabular-nums`, relative time at `text-paper-muted`. Whole row
is a link, minimum height 44px (SC 2.5.8), hover raises the row background to
`bg-paper-ink/[0.04]` — **not** a transform. Rows do not lift; ledgers do not
lift.

Delete: gradient headline, stats pill, `shine-top`, bento grid, per-card
`blur-3xl` glows, watermark numerals. Demote explanatory copy into
`components/value-prop-faq.tsx` below the fold.

### 5.2 Scan result, `flame` — The Entry

The centrepiece. Everything else in this document serves these three seconds.

```
   ┌───────────────────────────────────────────────┐ ← torn sheet
   │ WHAT THEY CHARGE               imri-jewelry.co.il │
   │                                               │
   │ ×8.4                                          │ ← Figure XL
   │                                               │
   │ They're marking this up.                      │ ← Title
   │                                               │
   │ WHAT IT COSTS / WHAT THEY ADD                 │
   │ ████│▒╱▒╱│▒╱▒╱│▒╱▒╱│▒╱▒╱│                     │ ← the bar
   │ $7.42                              ₪238.00    │
   │ ───────────────────────────────────────────   │
   │ WHAT WE FOUND                                 │
   │ · 14-day shipping from CN                     │
   │ · stock photo matches 2,431-order listing     │
   │ · no brand registered to this domain          │
   └╲──╱─╲────╱──╲───╱──╲────╱──╲──╱───────────────┘
                                      ╱BUSTED ×8.4╲  ← stamp, -4deg
   ┌───────────────────────────────────────────────┐
   │ [supplier image] $7.42 · 4.8★ · 2,431 orders  │
   │ [ קנו במקור — חסכו ₪210 ]                     │ ← green CTA, LAST
   └───────────────────────────────────────────────┘
```

**Reading order is the trust argument, and it is enforced in DOM order:**

1. The bar — zero words, instant, and it is the case.
2. `×8.4` and the two prices — four glyphs.
3. One sentence of verdict.
4. The evidence list.
5. **Then** the supplier card and the money link.

**The money link never precedes the reasoning in DOM order.** This is the
anti-conflict-of-interest rule from §0.3, and it is checkable in a code review,
which is why it is written as a rule and not a sentiment. See §8.

**Sequence** (all `transform`/`opacity`; total ≈ 1.1s):

| t | Element | Motion |
| --- | --- | --- |
| 0ms | Sheet | `animate-in fade-in slide-in-from-bottom-2 ease-out duration-300` |
| 120ms | Multiplier + prices | same, `delay-[120ms]` |
| 240ms | **Bar + count-up** | `bar-draw` 520ms, count-up on the identical window |
| 760ms | Stamp | `scale(1.25) → scale(1)` 200ms + `opacity 0→1` 120ms |
| 900ms | Supplier card + CTA | fade 200ms |

The bar draw and the count-up are **one event on one clock**, not two staggered
ones — per Apple's harmony rule, feedback across channels must land on the same
frame or the illusion breaks. Number and bar must finish together.

**Stamp: `1.25 → 1`, not the previously specified `1.6 → 1`, and no blur.** 1.6
reads as a zoom-bomb rather than a stamp pressing down; and `blur(4px)` on a
2.5px border produces mud, not softness, and costs a filter pass. If the CSS
version proves unsatisfying, `motion` with `{ type: "spring", duration: 0.3,
bounce: 0 }` — **bounce always 0.** With the tear cancelled, it is now unlikely
any motion library is needed at all.

**`prefers-reduced-motion`: render the final state immediately.** Not a faster
animation — no animation. Because the bar carries the argument rather than
merely transitioning to it, the reduced-motion result is not a degraded version
of the design. It is the same design, still.

### 5.3 Scan result, `amber` — The Draft Entry

Same sheet, **clean rectangle** (no tear), **outline bar**, no stamp, no count-up.

- Headline is a **question**, not a verdict: *"נראה כמו דרופשיפינג, אבל אין לנו
  הוכחה"* — Title role, `text-balance`.
- Figure is `≈×8.4` at Figure-L (30px), not Figure-XL. The tilde is a glyph, not
  a colour, so it survives grayscale.
- `reasoningSignals` under `WHAT WE FOUND`.
- `missingSignals` under **`WHAT WOULD HAVE CONVINCED US`**.

**Correction to an earlier draft, preserved so it is not re-made:** that draft
claimed `missingSignals` "has no visual home at all" and was "the highest-value
new component in the whole redesign." That was **false**.
`components/dropship-analysis-results.tsx` already renders them as "What we
couldn't find", and `components/verdict-sheet.tsx` already renders them as "what
would have convinced us". This is a **copy and hierarchy change, not net-new
surface**, and it should never again be scheduled or estimated as a new feature.
The value is real but narrow: the same array reads as *failure* when framed as
missing data and as *rigour* when framed as what would have raised confidence.
It matters most on `amber`, the tier that has to justify hedging.

### 5.4 Scan result, `silent` — Clean Bill / Blank

**No paper. No card. No figure. No colour beyond the two foreground tokens.**

Two different messages share this tier, and they must not sound the same:

| Verdict | Copy | Token |
| --- | --- | --- |
| `legit` | "{store} looks like the real seller. No markup signals worth flagging." | `--foreground` |
| `not_a_product` | "This page isn't a product. Paste a specific product URL and we'll take another look." | `--muted-foreground` |
| `insufficient_evidence` / low-conf | "We couldn't tell. This page didn't give us enough to stand behind a verdict, so we're not going to guess." | `--muted-foreground` |

On the last case only, `missingSignals` may appear — **as a sentence, not a
component.** At most three items, comma-joined, `text-sm text-muted-foreground`,
no bullet glyphs, no heading, no rule. The moment it becomes a bulleted block
with a mono label it has become a card, and the tier has been decorated.

Plus one quiet secondary action (re-scan / report) at `text-sm`, ghost styling.
That is the entire design.

**Resisting the urge to decorate this state is the single hardest discipline in
the system and the most important one.** Every future "the empty state looks
unfinished" ticket is asking to spend the credibility that `flame` runs on.

### 5.5 Live pipeline (`components/live-pipeline-view.tsx`)

Re-skin as a **chain-of-custody log**, in the room, not on paper — the pipeline
is process, not a claim.

Monospace, start-aligned, timestamped rows that stream in. Completed stages
collapse to one dim line at `--muted-foreground`; the active stage is at
`--foreground` with the `.animate-live` dot beside it. `aria-live="polite"` on
the container — announce stage *transitions* only, never every frame.

This turns 8–20 seconds of waiting into the product's best credibility argument:
the user watches the work happen. **Never replace it with a spinner.**
`animate-pulse` is for skeletons only — never on status text somebody is reading.

### 5.6 Scan permalink and OG card (`app/scan/[id]/`, `app/api/og/scan/route.tsx`)

The share card **is the entry**, statically composed: sheet, label, multiplier,
bar (with its hatching — which is exactly why §4.6 rejected two colours; hue
survives JPEG badly, pattern survives it fine), the two prices, the stamp.

This is the growth surface and should be the most finished artefact the product
produces. It is also the strongest argument for the ink-and-void bar: the OG
image has no motion, no interaction, and no `aria-label`. Whatever the bar
communicates there, it communicates purely as a static picture — and it still
works.

---

## 6. RTL and Hebrew

The primary market is Israeli storefronts. RTL is not a port; it is the default —
and it is where redesigns quietly break.

- **Logical properties only.** `ps-`/`pe-`/`ms-`/`me-`, `inset-inline-start`,
  `border-e`, `text-start`/`text-end`. Never `pl-`/`pr-`/`ml-`/`mr-`/`left-`/
  `right-`/`text-left`/`text-right`. There are currently **25** physical-direction
  utilities across `components/*.tsx` (10 of them padding/margin) — audit list for
  phase 7.
- **Prices must be bidi-isolated** in `<bdi>` (or `dir="ltr"`), or the currency
  symbol jumps sides. Not hypothetical: Hebrew commerce markup is saturated with
  U+200E/U+200F, which is exactly why `lib/scraping/extract-price.ts` has to
  tolerate them inbound. **Do not reproduce the bug outbound.** `<PaperFigure>`
  already renders a `<bdi>`; every price outside it needs one too, including both
  ends of the markup bar's dimension line.
- **Mirror the stamp** — `-4deg` becomes `+4deg` in RTL, or it reads as falling
  over. Shipped as `-rotate-[4deg] rtl:rotate-[4deg]`.
- **Do not mirror the torn edge.** A tear has no reading direction.
- **The bar's fill origin flips**, the hatching does not.
  `origin-left rtl:origin-right`; the 135° hatch angle is a texture, not a
  direction.
- **Hebrew tracking is not Latin tracking.** Heebo caps at `-0.02em`; Latin
  display goes to `-0.035em`. Heebo at `-0.04em` is unreadable.
- **Hebrew leading is not Latin leading.** Body 1.75, not 1.6 (§4.4).
- **Hebrew labels are not uppercase mono.** Geist Mono has no Hebrew; drop
  `uppercase`, drop to `0.06em` tracking, raise to 11px, switch to Heebo (§4.4).
- **Numerals stay LTR always**, in both directions, in `tabular-nums`.

---

## 7. Motion system

The house position, in one sentence: **motion here is an argument about
causality, not an ornament — so it must respond instantly, be interruptible at
any frame, and be absent wherever it would cost the user time.**

Everything in this section is CSS-only unless explicitly stated. **No motion
library is installed** (`package.json` has `tw-animate-css` and nothing else).
§7.5 specifies what to do if one is ever added.

### 7.0 The gate: should this animate at all?

Answer these **in order**, before writing any motion code. Most proposals die at
question 1, which is the point.

**1. How often will a user see it?**

| Frequency | Decision | In this product |
| --- | --- | --- |
| 100+/day | **Never animate.** | Nav links, language/currency picker toggles, keyboard-initiated submit |
| Tens/day | Reduce drastically — feedback only, no entrance | Scan button press, recent-scans drawer, tab switches, copy-to-clipboard |
| Occasional | Standard animation | Result reveal, error banner, toast, modal |
| Rare / once per session | Delight is affordable | **The scan-result entry** (§7.10) |

**Never animate a keyboard-initiated action.** Pressing Enter in the URL field to
start a scan must transition idle → analysing with **zero** animation. A user who
types a URL and hits Enter has already committed; an animation between their
keystroke and the pipeline appearing is pure latency dressed as polish.

**2. What is the purpose?** Valid answers: spatial consistency, state indication,
explanation, feedback, or preventing a jarring appearance. "It looks cool" is not
one, and if the user sees it more than occasionally it is disqualifying.

**3. Does it survive `prefers-reduced-motion`?** If the information is identical
with the motion removed, the motion was decoration — that is fine, and it means
the reduced path is simply "final state." If information is *lost*, the motion
was carrying content and you must design a non-vestibular equivalent, not delete
it (§7.12).

### 7.1 Response — kill latency first

Response is the foundation; everything else in this section is built on it. The
moment lag appears, the feeling of directness falls off a cliff, and no easing
curve recovers it.

- **Feedback fires on pointer-*down*, never on release.** `active:scale-[0.96]`
  with an explicit `transition-[...,scale]` — shipped on the scan button and the
  paste chip in `search-hub.tsx`. Every pressable element gets it.
- **`transition-duration` for press feedback: 120ms.** Fast enough to feel
  simultaneous with the finger, slow enough not to strobe.
- **The 300ms tap delay is already dead** — `touch-action: manipulation` on
  `a, button, [role="button"], input, label, select, summary`, plus
  `-webkit-tap-highlight-color: transparent` so the browser's grey flash doesn't
  fight our own active state. Both shipped in `globals.css`. Do not remove
  either.
- **Audit every timer on the input path.** A debounce, an artificial delay, a
  "wait for the transition" — each is a regression against INP. The one
  `setTimeout(…, 80)` in `search-hub.tsx` is a mobile scroll-into-view deferral
  after the phase has already changed, not feedback latency; that is legitimate.
  New timers need the same justification in a comment.
- **Feedback is continuous during an interaction, not only at its end.** For any
  drag, slider or drawer, update the UI 1:1 with the pointer the entire way
  through (§7.4).

### 7.2 The house curve, and the durations

**One curve: `cubic-bezier(0.2, 0, 0, 1)`.**

It is set by **overriding the stock Tailwind tokens**, not by adding a parallel
one:

```css
@theme {
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --default-transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
```

This is deliberate and worth defending: every bare `transition-*` and every
`ease-out` already written in this codebase picks the curve up with no call-site
change, and code written later gets it by default rather than by remembering. A
`--ease-house` that nobody remembers to apply is not a design system.

The two curves it replaces both **ramp in before they move** — stock `--ease-out`
is `cubic-bezier(0, 0, 0.2, 1)` and the default transition curve is
`cubic-bezier(0.4, 0, 0.2, 1)`. The start is the exact moment the user is
watching, so a slow ramp reads as lag no matter how short the duration is. **Never
use `ease-in` for anything the user is waiting on.**

**The `animate-in` trap — this cost a full sweep of 15 components.**
`tw-animate-css` defines `--animate-in` as `enter <dur> var(--tw-ease, ease)`. An
`animate-in` with **no `ease-*` class** therefore animates on plain `ease`, which
ramps in — the precise failure mode above. The house entry is:

```
animate-in fade-in slide-in-from-bottom-2 ease-out duration-300
```

**`ease-out` is not optional there.** It is what makes the token override apply.

Named exceptions to the house curve, each for a physical reason:

| Curve | Value | Where | Why |
| --- | --- | --- | --- |
| House | `cubic-bezier(0.2, 0, 0, 1)` | Everything by default | Instant departure, long settle |
| Mirror | `cubic-bezier(1, 0, 0.8, 1)` | Reversible dismissals only (§7.8) | The exact inverse of the house curve, so out retraces in |
| Linear | `linear` | Spinner rotation, progress fills | Constant motion has no acceleration |

Durations:

| Element | Enter | Exit |
| --- | --- | --- |
| Press feedback | 120ms | 120ms |
| Tooltip, small popover | 140ms | 100ms |
| Dropdown, select, tab indicator | 180ms | 120ms |
| Toast | 300ms | 200ms |
| Drawer, sheet, modal | 300ms | 220ms |
| Page-region entry | 300ms | — (see §7.3) |
| Icon crossfade | 160ms | — |

**Nothing interactive exceeds 300ms.** The entry sequence (§7.10) is the sole
exception, and it is exempt because it is seen once per scan, after an 8–20
second wait, and it *is* the product.

### 7.3 Interruptibility

This is the single most important principle in the section, and the one the
previous version of this document had no position on at all.

**Rule 1 — animate from the presentation value, never the target value.** When
something is re-targeted mid-flight, the new animation must start from the
element's *live on-screen* transform, not from its logical state. Starting from
the target causes a visible jump, and a jump is how a user learns the interface
is a state machine rather than an object.

CSS transitions do this natively. `@keyframes` do not — they restart from frame
zero on every retrigger. That gives the operational rule:

**Rule 2 — CSS transitions for anything retriggerable; keyframes only for
one-shots.**

| Use transitions | Use keyframes |
| --- | --- |
| Live pipeline stage status changes (retrigger 6× per scan, faster on a cache hit) | The entry sequence (once, unrepeatable) |
| Toasts, drawers, tabs, hovers, presses | The `.animate-live` pulse and the spinner (infinite, never retargeted) |
| Anything a user can trigger twice in under a second | Skeleton shimmer |

**Rule 3 — never lock out input during a transition.** No `pointer-events: none`
on the page during the entry sequence, no disabled submit button "until the animation
finishes." A user who wants to scan another URL at t=400ms gets to.

**Rule 4 — an element entering from `opacity: 0` must not be clickable while
invisible.** A 0-opacity element still receives pointer events, which produces an
invisible hit target — the worst possible interaction bug because it is
unreproducible by anyone who can see. Put `pointer-events: none` on the entering
wrapper and remove it on `animationend`, or simply don't animate in anything
interactive (preferred — see §7.10).

**Rule 5 — exit is softer and faster than enter, but not by default weaker.**
Enter travels 8px; exit travels 4px. Enter runs 300ms; exit runs 200ms. The user
is watching an arrival and has stopped watching a departure.

**Rule 6 — cancellation is not an exit.** If a result is replaced by a new scan
mid-animation, the old one is *removed*, not exit-animated. An exit animation on
content the user has explicitly superseded is noise between them and what they
asked for.

**Rule 7 — never `transition: all`.** Always name the properties. `transition:
all` animates properties you did not intend on the frames you did not test,
including `backdrop-filter`, which is expensive. The codebase is already clean on
this (`transition-[color,background-color,box-shadow,opacity,scale]` in
`search-hub.tsx`); keep it clean.

### 7.4 Direct manipulation

**Honest scope statement: this app currently has no gesture surfaces.** The
recent-scans drawer opens and closes with `transition-transform duration-300
ease-out`; nothing is draggable. This subsection is not describing shipped
behaviour — it is the contract for phase 6, written *before* the first gesture is
built, because a gesture built without these rules is always rebuilt later.

When the recent-scans drawer or a mobile verdict sheet becomes draggable:

- **1:1 tracking, respecting the grab offset.** The element stays glued to the
  finger from wherever it was grabbed. Snapping it to centre on grab breaks the
  illusion in the first frame.
- **Pointer Events with `setPointerCapture`**, so tracking survives the pointer
  leaving the element's bounds.

```js
el.addEventListener("pointerdown", (e) => {
  el.setPointerCapture(e.pointerId);
  const grabOffset = e.clientY - el.getBoundingClientRect().top;
  // push {y, t} into a short ring buffer on every pointermove — you need
  // velocity at release, and the last single delta is far too noisy for it.
});
```

- **Keep a position/time history of the last ~5 `pointermove` events.** Velocity
  computed from one frame is noise; velocity from a 60–80ms window is signal.
- **~10px hysteresis before committing to a direction**, then track 1:1. Detect
  all plausible gestures in parallel from the first move and cancel the losers
  once intent is clear — never use a recogniser that only reports a final state
  (`swipeleft`-style), because it throws away the continuous tracking that
  feedback depends on.
- **Ignore additional touch points once a drag has begun.** Without this,
  switching fingers mid-drag teleports the element.
- **Decide dismiss-vs-return on velocity sign, not final position.** A short fast
  flick dismisses; a long slow drag that stops short returns. Threshold: dismiss
  if `|Δ| ≥ 25% of the sheet's extent` **or** `|velocity| > 0.11 px/ms`.

### 7.5 Springs, velocity handoff, momentum projection

**Where a gesture ends, an animation must begin at the finger's exact velocity.**
Any seam there is the difference between "fluid" and merely "fine," and it is the
detail users cannot name but always feel.

Spring parameters are specified in Apple's two designer-facing terms, not in
mass/stiffness/damping:

- **Damping ratio** — overshoot. `1.0` = critically damped, no bounce.
- **Response** — how quickly the value reaches target, in seconds. Not a
  duration; a spring has no fixed duration.

| Interaction | Damping | Response |
| --- | --- | --- |
| Default UI (reposition, settle) | `1.0` | `0.35` |
| Drawer / sheet released from a drag | `0.85` | `0.30` |
| Stamp landing | `1.0` | `0.24` |

**On bounce — re-arguing an earlier invariant, deliberately and on the record.**
The prior rule was "bounce always 0." That rule was written for the stamp, and
for the stamp it is exactly right: a forensic mark that boinks is a toy, and it
would undercut the one moment in the product where we are most serious. But as a
blanket law it is wrong, because it forbids the one case where overshoot is
*physically honest*: **bounce is earned by momentum the user themselves
supplied.** Restated:

> **Bounce is `0` for everything the system initiates.** Bounce up to `0.15` is
> permitted only where the user's own gesture supplied the momentum — a
> drag-release — and nowhere else. The stamp, all entrances, all state changes and
> every non-gestural transition stay at `0`.

Today, with no gesture surfaces and no motion library, the practical effect is
unchanged: **everything is bounce 0.** The rule exists so that phase 6 does not
have to choose between shipping a dead-feeling drag and violating the spec.

**If a motion library is ever added** — and it should not be added for anything
CSS can do — use `motion`:

```js
// System-initiated. The stamp, if CSS keyframes prove unsatisfying.
animate(el, { scale: 1 }, { type: "spring", duration: 0.3, bounce: 0 });

// Gesture-released. Hand off the measured velocity; bounce is earned.
animate(el, { y: target }, {
  type: "spring", duration: 0.3, bounce: 0.12, velocity: releaseVelocity,
});
```

Two library caveats that bite in production:

- **`motion`'s shorthand props (`x`, `y`, `scale`) are not hardware
  accelerated** — they run on the main thread via `requestAnimationFrame`. Use
  the full string (`transform: "translateY(12px)"`) for anything that animates
  while the page is also fetching or painting, which on this site is *every*
  animation, because they all coincide with a scan.
- **Decompose 2D motion into independent X and Y springs.** A single spring on a
  2D distance desyncs the moment the axes have different velocities.

**Momentum projection — animate to where the gesture is going, not where it
stopped.** Never snap to the nearest boundary from the release point. Project the
resting position from velocity, then snap to the target nearest the *projection*:

```js
// Apple's exponential-decay form. The textbook v²/(2·a) is NOT what iOS ships.
function project(initialVelocity /* px/s */, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}
const projected = currentPosition + project(releaseVelocity);
animateSpringTo(nearestSnapPoint(projected), { velocity: releaseVelocity });
```

Use `0.998` for a normal scroll feel and `0.99` for a snappier one. This is what
makes a flick feel like a throw rather than a nudge.

**On reversal, blend velocity — do not hard-cut it.** Replacing one animation
with another at the reversal point creates a velocity discontinuity that reads as
a brick wall. Re-target the running spring from its current velocity; never kill
and restart.

### 7.6 Rubber-banding at boundaries

At an edge, resist progressively instead of stopping dead. A hard stop reads as
"frozen — something broke"; continuous resistance reads as "responsive, and
there's nothing more here." Real things slow before they stop.

```js
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
```

Applies to: a drawer dragged past fully-open, a sheet dragged upward past its
top, and any future horizontal receipt carousel dragged past its first or last
item. It does **not** apply to page scroll — the browser already does it on iOS,
and imposing it elsewhere is scroll-jacking (§11).

### 7.7 Materialize, don't fade — for free

Apple's rule is that a glass surface should arrive as a *material*: blur radius
and scale animating together, not a flat opacity fade. The obvious implementation
animates `backdrop-filter`, which is **forbidden here** — it is not a compositor
property, and §8 restricts us to `transform` and `opacity`.

There is no conflict, because of a property of how `backdrop-filter` composites:
**an element with a static `backdrop-filter` at `opacity: 0.5` blends the blurred
backdrop 50% with the unblurred page behind it.** Animating the element's own
opacity therefore *already is* a blur ramp — the material genuinely resolves into
focus — and it costs one compositor-layer opacity animation.

So: chrome surfaces enter with a **static** `backdrop-filter`, animating only
`opacity: 0 → 1` and `scale: 0.98 → 1` over 180ms on the house curve. You get
materialize semantics at fade cost. Verify it in DevTools' animation panel at
0.1× — the blur visibly resolves.

Related craft rules for surfaces:

- **Never animate from `scale(0)`.** Nothing in the physical world appears from
  nothing. Minimum entry scale is `0.95`. The Radix dropdowns already do this
  correctly (`zoom-in-95`); the previous version of this document specified
  `scale 0.25 → 1` for the icon swap, which is effectively `scale(0)` and is
  hereby replaced with `0.8 → 1`.
- **The stamp is the deliberate inverse:** it enters from `scale(1.6)` and
  travels *down* to `1`. That is not a violation — it is a thing descending onto
  paper, which is the only correct physics for a stamp. An object that grows into
  place is arriving from behind the screen; an object that shrinks into place is
  arriving from in front of it.
- **Blur masks an imperfect crossfade.** When two different glyphs swap
  (`Loader2` → `CheckCircle2` in the pipeline), a plain opacity crossfade shows
  two distinct objects overlapping. `filter: blur(3px) → 0` over the same 160ms
  bridges them into one transformation. **Keep blur under 20px** — it is
  expensive, especially in Safari — and 3px is plenty here.

### 7.8 Spatial consistency and origin-awareness

> If something disappears one way, we expect it to emerge from where it came.

- **Enter and exit along the same path.** The recent-scans drawer enters from
  `inset-inline-end` and must dismiss to `inset-inline-end`. In-from-the-side,
  out-the-bottom is disorienting and makes a future swipe-to-dismiss feel
  arbitrary.
- **Mirror the easing on reversible transitions.** Out uses the inverse of in:
  `cubic-bezier(1, 0, 0.8, 1)` against the house `cubic-bezier(0.2, 0, 0, 1)`.
  This is the one sanctioned use of an ease-in curve in the system, and it is
  sanctioned because the user is no longer watching the start of it.
- **Popovers scale from their trigger, not their centre.** Radix already exposes
  this and the codebase already consumes it —
  `origin-(--radix-dropdown-menu-content-transform-origin)` in
  `components/ui/dropdown-menu.tsx`. Any hand-rolled popover must set
  `transform-origin` to the trigger.
- **Modals are exempt: they stay `transform-origin: center`.** A modal is not
  anchored to a trigger; it is a new context that appears in the middle of the
  viewport. Origin-awareness on a modal makes it look like it was launched out of
  a button, which is the wrong story.
- **Hint in the direction of the gesture.** Intermediate frames should telegraph
  the outcome, not blindly interpolate to it. When the drawer is dragged, the
  backdrop should darken *proportionally to drag distance*, so the user can see
  how far commitment is before they get there.

### 7.9 Stagger and entrances

- **30–80ms between items in a list.** House value: **60ms.** The previous
  version specified 100ms, which is above the band where stagger reads as
  cascade rather than as queue — items arriving 100ms apart look like they're
  waiting for each other.
- **120ms between major page regions.** Regions are semantically separate, so a
  longer beat reads as structure rather than delay.
- **Cap the cascade at 6 items.** Item 7 onward enters with item 6's delay. A
  10-item list at 60ms is a 600ms wait for the last row — the user is now waiting
  on decoration.
- **Never block interaction while a stagger plays.** Stagger is decoration by
  definition; if the content is not usable until it finishes, it wasn't.
- **Below-the-fold content enters on `IntersectionObserver`** with
  `{ once: true, rootMargin: "-80px" }` — never on a timer, never re-triggering
  on scroll-back. Re-animating content the user has already seen is the clearest
  signal that motion was applied rather than designed.
- **The hero does not animate** (§5.1).

### 7.10 The Entry sequence

The one place in the product where a *sequence* is justified, and the only
animation permitted to exceed 300ms. It plays once, after a 12-second wait, on a
result the user has been staring at a pipeline log to receive.

**Why a fixed timeline is correct here, despite §7.3.** The sequence takes no
user input while it plays, its content is fully known before it starts, and it
runs at the busiest moment on the page — results render immediately after an SSE
stream closes. CSS keyframes run off the main thread and will not drop frames
while React commits; a JS-driven timeline would. This is the sanctioned one-shot.

**The order is the thesis.** Verdict first, arithmetic second (§0.4). The
multiplier asserts, then the bar shows the work under it, then the CTA, then the
stamp. Reversing it — evidence assembling toward a conclusion — is the
prosecutorial register we rejected.

| t | Element | Motion | Interactive? |
| --- | --- | --- | --- |
| 0ms | Sheet | `opacity 0→1`, `translateY(8px)→0`, 300ms, house | from 0ms |
| 120ms | Multiplier | count-up, 380ms, house, `tabular-nums`, width-locked | — (`aria-hidden`) |
| 260ms | **Markup bar** | `scaleX(0) → scaleX(var(--cost-share))`, 520ms, house, `both` | — (`role="img"`, label static from 0ms) |
| 480ms | Savings CTA | `opacity 0→1`, 180ms, house | **from 480ms** |
| 700ms | Stamp | `scale(1.25)→1` 200ms, `opacity 0→1` 120ms. No blur | never (`aria-hidden`) |

Total 900ms. Four rules the table encodes:

1. **Nothing interactive is the last thing to arrive.** The CTA is usable at
   660ms; the stamp lands at 900ms and can, because it is `aria-hidden`
   decoration that blocks nothing. An earlier draft put the CTA last, so a user
   reaching for the green button at 900ms hit nothing.
2. **Everything is on the house curve.** With the tear cancelled there is no
   longer any element needing a non-house easing — that exception is gone from
   §7.2, not merely unused.
3. **The bar's accessible name never animates.** The `aria-label` states the
   final ratio from the first frame; only the visual fill is timed. A screen
   reader must never hear a measurement tick.
4. **Every element carries `pointer-events: none` until its animation ends**
   (§7.3 rule 4), so nothing is ever an invisible hit target.

**`will-change: transform` on the stamp only**, applied on mount and removed on
`animationend`. A permanent `will-change` is a permanent compositor layer, and
five of those cost more than the animation saves.

**Stamp landing: `scale(1.25)→1`, no blur.** The earlier `scale(1.6)` reads as a
zoom-bomb, and a `blur(4px)→0` ramp on a 2.5px border resolves as mud while
costing a filter pass. 1.25 is enough to read as an impact.

**The count-up — the site's only kinetic element (§3).** Two constraints make it
CLS-safe:

- It counts from the smallest value sharing the target's digit count — `×8.4`
  counts from `×1.0`, `×12.0` from `×10.0` — so the digit count never changes
  mid-animation.
- Width is locked by a hidden sizer in the same grid cell, which makes CLS
  structurally zero rather than empirically small:

```css
.countup { display: inline-grid; font-variant-numeric: tabular-nums; }
.countup > * { grid-area: 1 / 1; }
```

```html
<span class="countup">
  <span aria-hidden="true" class="invisible">×12.0</span>
  <span aria-hidden="true">×10.4</span>          <!-- the ticking value -->
</span>
```

The verdict is announced as real text by the `sr-only` heading already in
`verdict-sheet.tsx`, so the count-up is safely `aria-hidden` — a screen reader
must not hear "times eight point four" twice, and must never hear it tick.

**Cancellation.** If the user starts a new scan mid-sequence the subtree unmounts
with no exit animation (§7.3 rule 6). If the result changes shape mid-sequence (a
late supplier match) the affected region **transitions** to the new content — it
does not restart the sequence.

**`amber` gets no sequence.** The sheet fades in, the bar renders at its final
width with no draw, there is no count-up and no stamp. A tier that means "we are
not sure" must not arrive with choreography; the restraint is the tier (§2.2).

**`prefers-reduced-motion`: render the final state immediately.** Not a faster
sequence — no sequence. The multiplier, the bar at full width and the stamp are
all still *there*; only their arrival is removed. This is the test §7.0 question
3 sets, and the reason the design's argument had to live in a *static* bar
(§4.6) rather than in a transition: the bar passes the test that the tear failed.

### 7.11 Live pipeline motion

The pipeline is on screen for 8–20 seconds — longer than everything else in this
document combined. Its motion rules are therefore the strictest.

- **Rows do not animate in.** All six stages render at t=0 at `opacity-40`
  (queued) and transition as their status arrives. This is already how
  `live-pipeline-view.tsx` is built and it is correct: animating rows in would
  imply the stage list is being *discovered*, when in fact we know all six before
  the scan starts. Showing them dimmed is an honest promise of what is coming.
- **Status changes are transitions, never keyframes** (§7.3 rule 2). On a cache
  hit, five stages change status in the same frame; keyframes would restart every
  one from zero.
- **Unify the timings.** Today the `li` uses `transition-opacity duration-300`
  and the icon chip uses `transition-colors duration-300`. Both go to **200ms**
  on the house curve, with named properties:
  `transition-[opacity,color,background-color,border-color] duration-200
  ease-out`. 300ms is a *drawer* duration; a status tick is not a drawer.
- **Icon swap:** `scale(0.8)→1`, `opacity 0→1`, `blur(3px)→0`, 160ms (§7.7).
- **`aria-live="polite"` on the container — shipped — but announce stage-level
  status changes only.** Never let sub-messages announce more than once per
  stage. A live region that fires on every SSE frame is worse than no live region:
  a screen-reader user gets a scan they cannot interrupt or skip.
- **`animate-pulse` is for skeletons only.** Never on status text somebody is
  reading. Pulsing text is an accessibility failure and a legibility failure at
  the same time.
- **Never replace the pipeline with a spinner.** The visible work is the
  credibility argument (§5.5).

### 7.12 Reduced motion

**The principle: reduced motion means no vestibular movement, not no feedback.**
A blanket `transition-duration: 0.01ms !important` on `*` also kills the opacity
and colour transitions that *carry meaning* here — a pipeline stage going queued
→ running, a verdict arriving, a button acknowledging a press — so every state
change teleports, which is the exact jarring result the transition existed to
prevent.

Shipped policy in `globals.css`, and it is right:

- **Entry animations** jump to their final state
  (`animation-duration: 0.01ms !important; animation-iteration-count: 1`).
- **Transitions collapse to `0.01ms`.** A narrowed-`transition-property`
  variant was tried and reverted: `transition-property` initially computes to
  `all`, so naming a list in a `*` rule GIVES a transition to every element that
  never declared one, and a `@layer base` `!important` outranks utility-layer
  `!important` so nothing can opt out — a press whose colour feedback was
  instant would start lagging 200ms. **Preserving a specific meaning-carrying
  fade is a per-component opt-in**, not something a global rule can infer.
  Open follow-up: add a `data-motion-keep` hook for the handful that earn it
  (pipeline stage transitions, verdict arrival).
- `scroll-behavior: auto`.

**Two defects found while writing this section are now fixed** (`globals.css`):

1. **`animation-delay` was not reset.** A staggered group still *sequenced*
   under reduced motion — each item waited out its delay and popped
   individually, so "jump to the final state" was not what actually happened.
   `animation-delay: 0ms !important` is now in the blanket rule.
2. **`animate-spin` froze at 360deg.** `animation-duration: 0.01ms` plus
   `iteration-count: 1` left the spinner stopped at the end of one rotation — a
   static spinner, which reads as a **hung application** for the 8–20s of a live
   scan. That inverts the indicator's meaning, a worse outcome than the motion
   it removed. A spinner is the rare case where the motion *is* the information.
   It is now re-overridden after the blanket rule:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-delay: 0ms !important; }
  /* A frozen spinner reads as a crash. Slow it; do not stop it. Small,
     fixed-centre rotation is not the large-area translation that triggers
     vestibular discomfort. */
  .animate-spin { animation-duration: 1.4s !important;
                  animation-iteration-count: infinite !important; }
}
```

`.animate-pulse` and `.animate-live` need **no** exemption, and deliberately do
not have one: both keyframe sets end on `opacity: 1`, so the blanket rule settles
them at a solid block and a solid dot — correct static readings of "loading" and
"live". Adding an exemption there would be motion for its own sake.

**Also under reduced motion:** no `IntersectionObserver` entrance animations
(render final state), no count-up (render the final figure), no entry
sequence (§7.10), and the drawer opens by cross-fade rather than slide.

`prefers-reduced-transparency` and `prefers-contrast: more` are separate signals
with separate handling — see §4.3. **Do not treat them as aliases
for reduced motion.** A user can want a solid, high-contrast interface and still
want it to move.

### 7.13 Multimodal feedback

Three rules, if haptics are ever added to the extension or a PWA install:

1. **Causality** — fire on the actual causal event (the stamp landing, the
   verdict arriving), never on a timer near it.
2. **Harmony** — visual, sound and haptic must land on the **same frame**.
   Latency between them destroys the illusion more thoroughly than having none.
3. **Utility** — reserve it for commit moments. Over-feedback trains users to
   ignore all feedback.

Current position: **no haptics, no sound.** The one candidate is a single short
tap on the stamp landing. It is deferred, because a tool that buzzes when it
accuses is performing certainty (§2.2).

### 7.14 Verification

- **Review motion the next day, with fresh eyes.** You will see timing errors you
  could not see while building.
- **Play every sequence at 0.1× in the DevTools animation panel.** Check: do
  colours cross-fade or do two states visibly overlap? Is `transform-origin`
  right? Are coordinated properties in sync?
- **Test gestures on real hardware**, over IP from a phone, with Safari remote
  devtools. The simulator lies about velocity.
- **Build the interactive prototype before the static comp.** An interactive demo
  is worth a million static designs, and it sets a concrete bar that stops the
  final implementation quietly regressing to "close enough."

---

## 8. Trust discipline

Rules that exist because we are paid for the answer (§0.3). All four are
reviewable in a diff, which is the point.

1. **The money link never precedes the reasoning in DOM order.** The affiliate
   CTA renders after `reasoningSignals`. No sticky CTA bar, no CTA above the
   fold on a result page, no CTA in the `amber` sheet above the caveat.
2. **The CTA is never visually louder than the verdict.** `--success` is a fill;
   it never gets `.glow-success-xl`, never gets a gradient, never gets a larger
   type role than Subhead. If the green outshouts the evidence, we look like we
   are selling rather than reporting.
3. **Uncertainty is never styled away.** `isUncertainMatch`, `isBestEffort` and
   `imageMatchSameFunction === false` each render as prose in the primary reading
   column — never as a dismissible chip, never collapsed behind a disclosure.
4. **No fabricated precision.** If a figure is derived rather than observed it
   carries `≈`. If `estimatedMarkupPercent` yields under 1.5×, `markupMultiplier()`
   returns `null` and no figure renders at all — a huge `×1.2` overstates a
   rounding artefact. Shipped in `verdict-sheet.tsx`; keep it.

---

## 9. Accessibility and performance budget

Non-negotiable, and cheap to hold if designed in from the start.

- **Contrast ≥ 4.5:1 on all text**; ≥ 3:1 on graphical objects that carry
  meaning (the bar's fill, its ticks, its border). Re-measure after any token
  edit, with the gamut check from §4.2.
- **The verdict is never colour-only.** Every tier carries a text label and an
  icon or glyph. **And the tier is never colour-only either** (§2.3): torn/clean,
  solid/outline, stamped/unstamped, statement/question.
- **The markup bar carries `role="img"` and a full-sentence `aria-label`** stating
  both prices and the ratio. Its inner elements are `aria-hidden`. A screen
  reader hears the measurement as a sentence, not as three empty divs.
- **The stamp is `aria-hidden`.** The verdict is announced as real text via the
  `sr-only` heading. The stamp must never be the only place a verdict appears.
- **Screen readers must not hear the number twice.** The visible Figure-XL
  multiplier is `aria-hidden` because the `sr-only` heading already states the
  verdict and confidence. Shipped in `verdict-sheet.tsx`.
- Live pipeline is `aria-live="polite"` and announces stage transitions only.
- Grain and texture layers are `pointer-events: none` and decorative.
- Hit areas ≥ 40×40px (ledger rows ≥ 44px).
- **No `outline: none`.** Focus rings stay; `outline-ring/50` is the base.
- `prefers-reduced-motion` path exists in the **same commit** as any animation,
  never as a follow-up.

**Performance**

- No WebGL, no canvas, no 3D, no parallax library, no scroll-jacking.
- Animate `transform` and `opacity` only. The bar is a single `scaleX` on a
  compositor layer — cheaper than the cancelled `clip-path` keyframe, and it does
  not force the `filter: drop-shadow` fallback that `clip-path` requires.
- Ambient blur blobs stay deleted. Grain is one tiled inline SVG, ~1.2KB, no
  request.
- `.paper-torn`'s `drop-shadow` is the most expensive surface effect remaining;
  it is capped at one sheet per page by the `flame`-only rule.
- **Targets: LCP < 2.0s, CLS < 0.05, INP < 200ms.** The count-up must not move
  layout — fixed-width `tabular-nums` is what buys the CLS number.

---

## 10. Implementation plan — from shipped reality

**Phases 1–3 and the motion detail pass have SHIPPED.** The honest headline: this
direction keeps essentially all of it, because the shipped work is the *material
system* and my argument was with the *centrepiece*, which was only ever a promise
in a document.

### 10.1 Rework accounting

| Shipped | Fate under The Ledger | Cost |
| --- | --- | --- |
| Room + paper tokens, `app/globals.css` | **Kept.** Two out-of-gamut values pinned (§4.2) — a visual no-op | ~15 min |
| Film grain, blob removal | **Kept unchanged** | 0 |
| House curve + entry normalisation + reduced-motion | **Kept unchanged** | 0 |
| `components/ui/paper.tsx` | **Kept.** Two edits: RTL-aware `PaperLabel`, leading/tracking pass on `PaperFigure` | ~45 min |
| `components/ui/stamp.tsx` | **Kept unchanged.** Landing animation added in phase 4 | 0 |
| `.paper-torn` | **Kept**, better argued (§4.5), still `flame`-only | 0 |
| `components/verdict-sheet.tsx` | **Kept, restructured.** Insert the bar; apply the §2.3 tier table; `amber` gets the outline bar | ~3 h |
| **Phase 4 tear animation** | **Cancelled before it was built** | **saved, not spent** |
| Name "The Teardown" in code comments | Rename sweep — `globals.css` ×3, `paper.tsx` ×2, `stamp.tsx` ×1, `verdict-sheet.tsx` ×1 | ~20 min |

**Net rework: roughly half a day.** It cancels a phase that had not started and
whose two most expensive techniques (`clip-path` keyframe, `filter: drop-shadow`)
were the largest performance risks in the whole plan. Nothing shipped is thrown
away.

If that accounting is wrong in one direction, it is this: `verdict-sheet.tsx` is
183 lines and well-factored, so the 3 hours is a real estimate, not a hopeful
one. The genuine unknown is the count-up, which needs a `useReducedMotion`-style
`matchMedia` hook the codebase does not have yet — budget an extra hour.

### 10.2 Remaining phases

Ordered so each ships independently and is individually revertible. **Do not
start a phase before the previous one is visually verified in a browser, in both
`dir=ltr` and `dir=rtl`.**

**Phase 4 — The bar, and the sheet it lives on** ← *highest product value* —
**core shipped 2026-08-28, count-up + stamp-timing still open**
- ✅ `components/ui/markup-bar.tsx` (§4.6), inserted into `verdict-sheet.tsx`
  on both flame (solid fill) and amber (ghost fill) tiers.
- ✅ `motion-safe:` gates the `bar-draw` keyframe entirely, so
  `prefers-reduced-motion` gets the static final state with no separate code
  path needed.
- ✅ Fixed `PaperLabel` for RTL (§4.4).
- ✅ Verified against `lib/analyze/presence-tier.ts` — rendered verbatim.
- ☐ **Not done**: the count-up synchronised to `bar-draw` (§5.2's "one clock,
  not two staggered ones" requirement) and the stamp landing animation
  timing table. The bar renders correctly but statically; the choreographed
  entry sequence in §5.2 is still open.
- Isolated preview still in `app/dev-monitor/design/page.tsx`.

**Phase 5 — Landing rebuild** (§5.1) — **shipped 2026-08-29**
- ✅ Replaced the bento with `components/landing-ledger.tsx` (continuous
  paper sheet, ruled rows).
- ✅ Deleted the gradient headline, stats pill, `shine-top` on the search
  card, per-card `blur-3xl` bento.
- ✅ Applied the §4.4 Display type scale to the hero (English). Hebrew
  script scale not separately verified.

**Phase 6 — Remaining surfaces**
- Chain-of-custody pipeline log (§5.5).
- Scan permalink + OG card (§5.6).
- `components/analysis-results.tsx`: kill the six gradient clip-text figures,
  move the store/supplier comparison onto paper, apply §8's DOM-order rule.
- Store pages, extension popup token alignment.
- **Last step:** delete `.glass`, `.glass-md`, `.glow-*`, `.shine-top` from
  `globals.css` once nothing references them.

**Phase 7 — Detail pass**
- `make-interfaces-feel-better` checklist over every touched component.
- Full RTL audit: the 25 physical-direction utilities (§6), every screen, both
  directions, real Hebrew content.
- Re-measure every contrast pair in §4.2, with the gamut check.
- Update `CLAUDE.md` §Design Language so its token table matches `globals.css`.

---

## 11. Anti-goals

Explicitly rejected, with reasons, so they do not get reintroduced.

| Rejected | Why |
| --- | --- |
| **The tear-to-reveal animation** | Carries no information — it fails the document's own reduced-motion test. Destruction is the wrong verb for a product that measures. Its `clip-path` + `drop-shadow` were the two most expensive techniques in the plan. §0.2 |
| **A two-colour markup bar** | Measured **1.11:1** between the candidate segments. Fails SC 1.4.11, invisible in grayscale, invisible to a deuteranope, and dies in OG-card compression. §4.6 |
| **A `--paper-fire` token** | Best in-gamut fire at manila-compatible lightness reaches 4.45:1 — fails AA. And a third ink would break the "arithmetic is sober" thesis. §4.2 |
| **Hue as the tier carrier** | Measured 1.38:1 between `--primary` and `--amber-tier`; retuning cannot fix it without inverting the hierarchy. §2.3 |
| Glassmorphism, ambient blur blobs, dot grid | The template signature we accuse others of; the blobs were the most expensive paint on the page. §4.3 |
| Bento grid of feature cards | A record of real scans is strictly more persuasive than three cards explaining the product. §5.1 |
| Gradient clip-text headlines | Most-copied template element; costs legibility, adds no information, breaks high-contrast modes. §4.4 |
| Kinetic typography in body copy | Fights screen readers and crawlers, destroys CLS. Exactly one kinetic moment on the site. §3 |
| WebGL / canvas / 3D / scroll-jacking | Cost with no argumentative payoff for an evidence tool. §9 |
| Light mode | Dark is the identity. `<html>` always has `dark`. A second theme doubles QA for no gain. |
| Animated film grain | Battery and repaint cost for an effect nobody registers; reads as a broken codec. §4.3 |
| **Decorating the `silent` state** | The restraint *is* the feature. It is what buys the right to shout on `flame`. §5.4 |
| Colour-only verdicts **or tiers** | SC 1.4.1 failure and a trust failure. §2.3, §9 |
| A sticky or above-the-fold affiliate CTA | We are paid for the answer; the money link never precedes the reasoning. §8 |
| Transform-on-hover for ledger rows | Ledgers do not lift. Background only. §5.1 |
| Renaming or re-deriving `presenceTier` client-side | The extension badge and this page must never disagree about our own confidence. §2.1 |

---

## 12. Amendments to the previous specification

Recorded explicitly so nothing is lost silently. Everything not listed here
carries forward unchanged.

| # | Previous | Now | Why |
| --- | --- | --- | --- |
| 1 | Centrepiece is the tear-to-reveal (phase 4) | **Cancelled.** Centrepiece is the markup bar (§4.6) | The tear carries no information and fails the draft's own reduced-motion test; the bar carries the entire argument statically. §0.2 |
| 2 | Direction named "The Teardown" | **"The Ledger"** | The product measures; it does not destroy. Costs a ~20-minute comment sweep. §0.4, §10.1 |
| 3 | `--primary` and `--amber-tier` "must stay visibly distinct" | **Stands, and is amended:** they must stay distinct **and hue may never be the sole tier carrier** | Measured 1.38:1. Retuning cannot reach 3:1 without inverting the hierarchy. Tier now has six carriers, five grayscale-safe. §2.3 |
| 4 | `--stamp: oklch(0.55 0.24 27)`, `--paper-money: oklch(0.42 0.16 155)` | Pinned to `0.22` and `0.10` chroma | Both were outside sRGB; the browser was already clamping them. A spec that names an unrenderable colour will mislead the next person who measures it. Visual no-op. §4.2 |
| 5 | `--paper-money` reported at 4.8:1 | **5.13:1** | Re-measured at the in-gamut value. §4.2 |
| 6 | Stamp lands `scale(1.6)→1` with `blur(4px)→0` | `scale(1.25)→1`, no blur | 1.6 reads as a zoom-bomb; blur on a 2.5px border is mud and costs a filter pass. §5.2 |
| 7 | Motion library "if the stamp needs one" | Same escape hatch, now unlikely to be needed | With the tear cancelled nothing left requires interruptible gesture physics. `bounce: 0` still absolute. §7 |
| 8 | Tracking specified per role; leading unspecified | **Both specified for all 10 Latin roles and 5 Hebrew roles** | They are one decision. The gap is why headings carry an ad-hoc `md:leading-[1.05]` on one breakpoint. §4.4 |
| 9 | Landing shows "three paper receipts" | **One continuous sheet, ruled rows** | Three cards is a feature grid wearing paper; a column of line items is a record, and it scales. §5.1 |
| 10 | Torn edge justified as "a case file someone ripped up" | Same technique, justified as **a page torn off a pad** | Better fit, and it is the actual reason the points must be irregular. §4.5 |

**Unchanged and still binding**, restated in place rather than repeated here:
server-computed `presenceTier` rendered verbatim (§2.1); intensity derived, never
chosen (§2.2); tier and verdict as two axes (§2.2); dark-only (§3); all class
merging through `cn()`; manila not bone (§4.2); room tokens ≠ paper tokens
(§4.2); linear-RGB contrast measurement (§4.2); stamp red reserved (§4.2); green
is only the user's win (§4.2); grain specification and z-index 100 (§4.3);
`clip-path` clips `box-shadow` (§4.5); irregular tear points (§4.5);
`transform`/`opacity` only (§9); the house curve and its stock-token override
(§7); the `tw-animate-css` `ease-out` trap (§7); exits softer than enters (§7);
narrowed reduced-motion (§7); `animate-pulse` for skeletons only (§5.5); no
motion library, `bounce: 0` (§7); logical properties only (§6); `<bdi>` on prices
(§6); mirror the stamp, not the tear (§6); Hebrew tracking cap (§6);
`tabular-nums` everywhere (§4.4); `missingSignals` already has a home (§5.3);
one kinetic element (§3); no new fonts (§4.4); verdict never colour-only (§9);
`aria-live="polite"` pipeline (§9); ≥4.5:1, ≥40×40px, no `outline: none` (§9).

---

### 12.1 Applied to the code in this pass

Everything above is specification. These changes are already **in the tree** —
the spec and the code agree as of this document.

| Change | File | Why |
| --- | --- | --- |
| House curve set by overriding stock `--ease-out` + `--default-transition-timing-function` | `app/globals.css` | Both stock curves ramp *in*; overriding the stock names means every existing bare `transition-*` inherits with no call-site edit |
| All 15 `animate-in` sites given `ease-out`; results normalised to `slide-in-from-bottom-2 duration-300` | 12 components | `tw-animate-css` falls back to plain `ease`; results were entering at `duration-700` + 24px, more than double the UI budget |
| `prefers-reduced-motion` transitions kept at `0.01ms` | `app/globals.css` | Narrowing `transition-property` in a `*` rule invents transitions on elements that never had one, and `@layer base !important` makes it un-opt-out-able. Per-component opt-in instead (§7.12) |
| `animation-delay: 0ms` added under reduced motion | `app/globals.css` | Staggered groups were still sequencing — "jump to final state" was not happening |
| `.animate-spin` re-exempted at 1.4s under reduced motion | `app/globals.css` | It was freezing at 360°, reading as a hung app for the 8–20s of a scan |
| `animate-pulse` removed from live status text | `live-pipeline-view.tsx`, `pipeline-waterfall.tsx` | Oscillating copy the user is reading, next to a spinner already saying "running" |
| `--stamp` 0.24 → 0.22, `--paper-money` 0.16 → 0.10 chroma | `app/globals.css` | Both were **outside sRGB** and being silently clamped; a P3 display would not clamp identically. `--paper-money` measures *better* pinned (5.2:1 vs the clamped 4.8:1) |
| `live-pulse` trough 0.2 → 0.45 | `app/globals.css` | At 0.2 the dot all but leaves the page each cycle and drags peripheral vision back |
| Palette table resynced to `globals.css` | `CLAUDE.md` | It still documented Paper as **bone** `oklch(0.94 0.012 85)` — the value §4.2 rejected. The file loaded into every session was teaching the wrong colour |

**Shipped since this was written:** the markup bar (§4.6, 2026-08-28) and the
landing rebuild (§5.1, 2026-08-29) — see §10.2 for what's done vs. still open
within each. **Not yet built:** the entry sequence (§7.10) and everything
else in §10.2 (Phase 6, Phase 7).

---

## 13. Open questions for the product owner

1. **Does the stamp say `BUSTED` or Hebrew?** Latin reads more like a rubber
   evidence stamp and matches the product name; Hebrew is warmer to the actual
   audience. **Recommendation: `BUSTED` in Latin**, with the Hebrew verdict as
   adjacent real text. The stamp is an icon, not a sentence — and it is
   `aria-hidden`, so it is never the accessible carrier of anything.
2. **How many rows in the landing ledger?** Eight reads as a record; three reads
   as a widget; twenty is a wall. **Recommendation: eight, with a link to the
   full ledger.** Worth an A/B on scan-start rate — this is the one place in the
   design where persuasion and honesty pull in the same direction, so it is safe
   to optimise.
3. **Should the bar appear on `amber` at all?** The outline version is
   defensible, but there is a stricter reading of §4.1 in which a measurement we
   are not confident about should not be drawn to scale at any weight.
   **Recommendation: keep the outline bar**, because the *ratio* is the part we
   are confident about even when the absolute prices are estimated — but revisit
   if user testing shows people read the outline as an assertion.
4. **Is `insufficient_evidence` allowed to show `missingSignals` at all?** §5.4
   permits it as a sentence. The stricter position is that a tier which says "we
   are not claiming anything" should not then produce three near-claims.
   **Recommendation: ship the sentence version and watch the re-scan rate.**

---

## 14. Appendix — Notes for the next agent

**When you change a token**, re-run the contrast method in §4.2 including the
gamut check, and update **both** this file's table and `CLAUDE.md`
§Design Language. They drift within one sprint otherwise.

**When you add an overlay**, keep it below `z-index: 100` or the film grain will
not cover it and it will look detached from the page.

**When a stakeholder asks to make the `silent` state "look more designed"**,
point them at §5.4 and §2.2. That request is asking to spend the credibility that
`flame` runs on. The answer is no, and the reason is architectural rather than
aesthetic.

**When you are tempted to colour something on paper**, measure it against
`oklch(0.855 0.032 82)` first. Every room token measured so far fails there:
`--success` at 1.74:1, `--primary` at 1.69:1.

**When you write a new label component**, check it in `dir="rtl"` before you
commit. Geist Mono has no Hebrew, and wide tracking destroys Hebrew word
cohesion. §4.4 has the exact override.
