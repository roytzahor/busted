# Busted — Design Direction: "The Teardown"

> Full design specification. Written to be implementable by someone (or some
> agent) with no memory of the conversation that produced it. Every choice below
> states *why*, because a rationale you can argue with is worth more than a
> mockup you can only copy.
>
> Status: **proposal, nothing implemented.** Current UI is untouched.
> Companion docs: `CLAUDE.md` (§Design Language — the *current* system, which
> this replaces), `ROADMAP.md` (product phases).

---

## תקציר בעברית (TL;DR)

**הבעיה:** האתר כרגע נראה כמו אתרי הדרופשיפינג שהוא חושף. גלסמורפיזם, כתמי אמביינט
מטושטשים, כותרות גרדיאנט, bento grid — זו בדיוק תבנית ברירת המחדל שכל חנות שופיפיי
משתמשת בה. אנחנו מאשימים אותם בתבניתיות בעזרת תבנית.

**הרעיון:** לעבור מ"אתר SaaS מבריק" ל**חדר ראיות**. רקע כהה, מחוספס, עם גרעין —
ועליו **מסמכי ראיות בצבע נייר בהיר**. ניגודיות ברוטלית במקום שקיפות. המספרים
במונוספייס כמו קבלה. חותמת "BUSTED" אדומה נוחתת בזווית.

**הרגע המרכזי:** "התלישה" — כרטיס המוצר של החנות נקרע לרוחב, ומתחתיו נחשף ספק
עלי-אקספרס עם המחיר האמיתי. פעם אחת, בסריקה. זה כל המוצר בשלוש שניות.

**המשמעת שמייצרת אמון:** עוצמת העיצוב נגזרת מ-`presenceTier` שהשרת מחשב.
`flame` → תלישה מלאה. `amber` → נייר בלי חותמת. `silent` → שורה שקטה אחת.
אתר שצועק על כל סריקה הוא שקרן. השקט הוא מה שהופך את הצעקה לאמינה.

**מה לא נעשה:** טיפוגרפיה קינטית בגוף הטקסט, WebGL, ספריות כבדות, מצב בהיר.

---

## 1. The strategic problem

Busted's entire proposition is: *this store is a template with a markup.* We
scrape it, prove the product is a commodity anyone can buy for less, and hand the
user the real link.

The current interface is built from the 2023–24 AI-SaaS template kit:
glassmorphism cards, fixed radial blur blobs, gradient clip-text headlines, a
bento grid of feature cards. Look at any Israeli dropship storefront and you find
the same instincts — a Shopify theme with a glassy hero and a gradient CTA.

**We are accusing them of being a template, using a template.** That is a
credibility leak, and it is invisible from inside the codebase because every
individual class name looks tasteful.

There is a second, sharper problem. Glass and blur communicate *softness and
ambiguity*. Busted's job is to communicate *evidence and certainty* — and, when
the evidence is thin, to communicate **doubt honestly**. A visual language built
on translucency cannot express the difference between "we are certain" and "we
are guessing," which is precisely the distinction the whole `presenceTier`
architecture exists to protect (`lib/analyze/presence-tier.ts`).

**Design mandate: the interface must be able to shout, and must be able to
whisper, and the user must be able to tell which is happening at a glance.**

---

## 2. The concept: The Teardown

A dropship store is a sticker over a price tag. Busted peels the sticker off.

The whole design language descends from one physical act: **tearing a label to
reveal what's underneath.** Everything else — the palette, the typography, the
motion, the page architecture — is downstream of that image.

Three registers, mapped to the three presence tiers:

| Tier | Meaning | Register |
| --- | --- | --- |
| `flame` | High confidence dropship | **The Teardown.** Full theatre: tear, reveal, stamp, count-up. |
| `amber` | Suspected, not proven | **The Dossier.** Paper document, evidence listed, no stamp, no tear. |
| `silent` | Not enough evidence | **The Note.** One line of muted text. No card, no colour, no drama. |

This mapping is not decoration — it is the design's central discipline. A tool
that performs certainty it does not have is exactly as untrustworthy as the
stores it audits. **The silence is what makes the shout credible.**

---

## 3. Research basis

Design choices below cite these. Where research contradicts a fashionable idea, I
follow the research, not the fashion.

**Tactile Brutalism / anti-grid is the 2026 counter-movement.** Premium
experiences pivoted to "sharp geometry, stark contrasts, single-pixel borders,"
with anti-grid brutalism emerging specifically as a reaction against bento grids
([Fireart](https://fireart.studio/blog/the-best-web-design-trends/),
[Figma](https://www.figma.com/resource-library/web-design-trends/)). This is the
direct justification for abandoning the bento + glass system.

**Dark mode is now a design language, not a toggle** — deep backgrounds, vivid
accents, subtle glow, dark-first identity in tech/finance/luxury
([Lovable](https://lovable.dev/guides/website-design-trends-2026),
[TheeDigital](https://www.theedigital.com/blog/web-design-trends)). Busted is
already dark-only; we keep that and commit harder.

**CSS-generated grain/scanlines replace WebGL for texture.** Designers generate
physical depth with mathematically generated CSS textures — film grain, CRT
scanlines — to mimic raw industrial materials without the processor cost of
heavy WebGL ([Fireart](https://fireart.studio/blog/the-best-web-design-trends/),
[Midrocket](https://midrocket.com/en/guides/ui-design-trends-2026/)). This is how
we get "tactile" for ~2KB.

**Kinetic typography is a demo trend, not a production trend.** It is everywhere
on Awwwards and Dribbble but "almost never ships in production, since animated
text fights screen readers, fights search crawlers, and adds layout shift that
destroys Core Web Vitals"
([DEV/studiomeyer](https://dev.to/studiomeyer_io/web-design-trends-2026-what-actually-held-up-after-six-months-23p8)).
**Constraint adopted:** exactly one kinetic element on the site — the markup
multiplier — implemented as a count-up on a fixed-width `tabular-nums` element so
it cannot shift layout, with a `prefers-reduced-motion` static fallback. No
kinetic body text anywhere.

**Motion is cheap if it stays on the compositor.** `transform`/`opacity` plus
IntersectionObserver give expressive motion without hurting Core Web Vitals
([Fireart](https://fireart.studio/blog/the-best-web-design-trends/)). Every
animation in §7 is restricted to those properties.

**Forensic aesthetics: presentation is what makes evidence *felt*.** Evidence
rendered in a technical, exacting, compositionally deliberate form is "sensed
rather than merely intellectually understood," and that is what carries the
perception of truth — while noting that in evidence work, "color is aesthetic,
clarity is evidentiary"
([Opinio Juris](https://opiniojuris.org/2025/11/28/the-aesthetic-language-of-open-source-investigations-the-image-of-truth-and-the-demand-for-action/),
[Ubiquiti](https://academy.ui.com/topics/designing-for-evidence-capture)). This
is the licence for the dossier/receipt language — *and* the warning that legibility
of the numbers outranks the styling of them. Where the two conflict, clarity wins.

**Interaction detail principles** are taken from the `make-interfaces-feel-better`
skill (concentric radii, optical alignment, layered shadows over borders,
staggered enters, subtle exits, `tabular-nums`, `scale(0.96)` press, no
`transition: all`, ≥40×40px hit areas). Those are treated as non-negotiable
baseline, not trends.

---

## 4. Visual system

### 4.1 The core move: dark room, paper evidence

The single most differentiating decision. Everyone's dark UI is
*translucent surfaces on dark*. Ours is **opaque bone-white paper on a near-black
textured ground.**

- Chrome, navigation, background, ambient = the dark room.
- Every factual claim — price teardown, evidence list, supplier card, scan
  receipt — sits on **paper**.
- Paper is never translucent. It has a hard edge and a real drop shadow. It looks
  like something you could pick up.

Why it works: it is instantly unlike both the SaaS template *and* the dropship
storefront; it gives a natural home for receipt/monospace typography; and it
creates an unmistakable visual hierarchy — **if it's on paper, it's a claim we
are standing behind.** That last property is what lets `silent` render as plain
dark-room text with no paper at all, and have that read as meaningful restraint
rather than an unstyled state.

### 4.2 Palette

Extends the existing tokens in `app/globals.css`. Brand fire/amber is kept — the
product is called Busted and amber *is* the caught-red-handed signal. Additions
are the paper surfaces and the stamp red.

```css
.dark {
  /* ── The room (deeper + slightly desaturated vs today) ─────────────── */
  --background:        oklch(0.11 0.014 48);  /* was 0.15 0.03 52 */
  --surface-raised:    oklch(0.16 0.02 50);
  --foreground:        oklch(0.97 0.01 55);
  --muted-foreground:  oklch(0.70 0.03 55);

  /* ── Paper (evidence documents) ────────────────────────────────────── */
  --paper:             oklch(0.94 0.012 85);
  --paper-ink:         oklch(0.20 0.02 60);
  --paper-muted:       oklch(0.48 0.02 60);
  --paper-rule:        oklch(0.20 0.02 60 / 0.14);  /* hairlines on paper */

  /* ── Signals ───────────────────────────────────────────────────────── */
  --primary:           oklch(0.74 0.18 52);   /* fire — brand, flame tier */
  --stamp:             oklch(0.55 0.24 27);   /* BUSTED stamp red */
  --success:           oklch(0.70 0.15 155);  /* savings / the real link */
  --amber-tier:        oklch(0.80 0.13 78);   /* amber tier — cooler than fire */

  --border:            oklch(1 0.02 55 / 0.10);
}
```

Rules:
- **Stamp red is reserved.** It appears only on the BUSTED stamp and nowhere else
  — not on errors, not on destructive buttons. A colour used once is a signature;
  used twice it is a palette.
- Fire amber drives `flame`; `--amber-tier` drives `amber`. They must be visibly
  different or the tier system is decorative. Verify by desaturating the page.
- Green is only ever the *user's win* (savings, the real supplier link). Never
  used for generic success toasts.
- Contrast: `--paper-ink` on `--paper` ≈ 13:1. `--foreground` on `--background`
  ≈ 16:1. `--muted-foreground` on `--background` ≈ 6.5:1. All pass AA
  comfortably; re-verify with a checker after any token edit.

### 4.3 Texture

Two layers, both pure CSS, no network request, no WebGL.

```css
/* Film grain — one inline SVG turbulence, tiled. ~1.2KB, GPU-composited. */
.grain::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* Paper fibre — subtle, only on paper surfaces */
.paper {
  background-color: var(--paper);
  background-image: repeating-linear-gradient(
    0deg,
    oklch(0.20 0.02 60 / 0.020) 0px,
    transparent 1px,
    transparent 3px
  );
}
```

**Do not animate the grain.** Animated noise is a battery and repaint sink for a
effect nobody consciously registers. Static grain reads as texture; moving grain
reads as a broken video codec.

**Delete the ambient blobs** in `app/page.tsx` (the four fixed blurred divs).
Large `blur(160px)` layers are among the most expensive things on the page and
they are the single strongest "generic AI SaaS" tell. Grain replaces them.

### 4.4 Typography

No new fonts. `Geist Sans`, `Geist Mono`, and `Heebo` are already loaded in
`app/layout.tsx` — adding a display face would cost LCP for marginal gain, and
Geist at weight 900 with tight tracking is genuinely brutal enough.

| Role | Face | Spec |
| --- | --- | --- |
| Display (hero, verdict) | Geist Sans 900 | `tracking-[-0.04em]`, `text-wrap: balance`, uppercase for the verdict word only |
| Hebrew display | Heebo 900 | `tracking-[-0.02em]` — Hebrew tolerates far less negative tracking than Latin; do not reuse the Latin value |
| Body | Geist Sans 400/500 | 16px min, `text-wrap: pretty` |
| **All evidence** | **Geist Mono** | prices, ratios, IDs, timestamps, domains, confidence % |
| Paper headings | Geist Mono 500 | uppercase, `tracking-[0.12em]`, small — reads as a form label |

**Every number on the site gets `font-variant-numeric: tabular-nums`.** Non-
negotiable: prices animate, confidence updates live, the pipeline streams. Without
it the layout jitters, which reads as instability in a product selling certainty.

Kill the gradient clip-text headlines. Gradient text is the most-copied element of
the template era, and it costs legibility for zero information. Solid
`--foreground`, with fire amber used to colour *one* word.

### 4.5 Geometry

Anti-grid, per the research. Concretely:

- **Sharp corners on evidence.** Paper documents use `rounded-[2px]` — nearly
  square. Rounded corners read as "app"; square reads as "document."
- Interactive chrome (buttons, inputs) keeps a modest `rounded-lg`, so tap targets
  still feel like controls.
- **Concentric radii enforced** wherever nesting occurs: `outer = inner + padding`
  (from the interface-details skill). The current codebase violates this in several
  cards — `rounded-2xl` parent with `rounded-2xl` child is the most common bug.
- **Hairlines, not borders.** `1px solid var(--paper-rule)` inside paper. Between
  dark-room sections, use layered shadow rather than a border line.
- **Deliberate rotation, used sparingly.** The stamp sits at `-4deg`. Nothing else
  rotates. One tilted element on a page reads as intentional; three read as a theme.

---

## 5. Page architecture

### 5.1 Landing / Search hub (`components/search-hub.tsx`)

Current: centred hero, gradient headline, glass input, bento feature grid.

Proposed:

```
┌─────────────────────────────────────────────────────────┐
│  [dark room, grain]                                     │
│                                                         │
│   כמה באמת עולה                    ← Heebo 900, solid  │
│   המוצר הזה?                                            │
│                                                         │
│   ┌───────────────────────────────────────────┐         │
│   │  הדביקו קישור למוצר            [ סרוק ]  │  ← the  │
│   └───────────────────────────────────────────┘   only  │
│                                                     hero │
│   נסו: imri-jewelry.co.il · remora.co.il                │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│   [ paper ] [ paper ] [ paper ]   ← last 3 real scans,  │
│   ×8.4      ×3.1      ×12.0         live, as receipts   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

The single strongest change: **replace the feature bento with live evidence.**
Three real recent scans as small paper receipts beats any "How it works" card,
because the product's whole claim is that it has receipts. `components/recent-scans.tsx`
and `components/trending-now.tsx` already fetch this data.

Kill or demote: the bento "how it works" grid, the ambient blobs, the gradient
headline. Move explanatory copy below the fold into `components/value-prop-faq.tsx`.

### 5.2 The Teardown — scan result, `flame` tier

The centrepiece. Everything else in this document is in service of these four
seconds.

```
   ┌───────────────────────────────────┐
   │  [store product image]            │   1. The store's listing,
   │  imri-jewelry.co.il               │      rendered faithfully —
   │  ₪238.00                          │      almost flattering.
   └───────────────────────────────────┘
                  ✂ ─ ─ ─ ─ ─ ─ ─           2. A tear rips across it.
   ┌───────────────────────────────────┐
   │  [aliexpress image]               │   3. Underneath: the source.
   │  $7.42  ·  4.8★  ·  2,431 orders  │
   │  [ קנו במקור — חסכו ₪210 ]        │   4. The green CTA.
   └───────────────────────────────────┘
                                            5. Stamp lands, -4deg.
              ╱BUSTED ×8.4╲
```

Sequence (total ≈ 1100ms, all `transform`/`opacity` only):

| t | Element | Motion |
| --- | --- | --- |
| 0ms | Store card | Fade+rise in. `translateY(8px)→0`, 300ms |
| 350ms | Tear | `clip-path` wipe across the card, 220ms, `cubic-bezier(0.2,0,0,1)` |
| 500ms | Supplier card | Reveal from under the tear, `translateY(6px)→0`, 300ms |
| 700ms | Multiplier | Count-up 1.0 → 8.4 over 400ms, `tabular-nums`, fixed width |
| 900ms | Stamp | `scale(1.6)→1`, `opacity 0→1`, `blur(4px)→0`, 260ms |
| 1100ms | Savings CTA | Fade in, 200ms |

**`prefers-reduced-motion`: render the final state immediately.** Not a faster
animation — no animation. The information is identical either way, which is the
test of whether motion was decoration or content.

**The tear is drawn once, in CSS `clip-path` with a jagged polygon.** No SVG
morphing, no library. A single reusable class.

### 5.3 The Dossier — `amber` tier

Same paper, no theatre. No tear, no stamp, no count-up. Headline is a question,
not a verdict: *"נראה כמו דרופשיפינג, אבל אין לנו הוכחה"*. Evidence list is
rendered as an itemised form (`reasoningSignals`), and — critically — the
`missingSignals` are shown too, under a heading like *"מה היה משכנע אותנו"*.

Showing what we *don't* know is the most trust-building surface on the site, and
it currently has no visual home at all. This is the highest-value new component
in the whole redesign.

### 5.4 The Note — `silent` tier

No paper. No card. One line of `--muted-foreground` text in the dark room:
*"לא הצלחנו לקבוע. הדף לא נתן מספיק מידע."* Plus a quiet secondary action
(re-scan / report). That is the entire design.

Resisting the urge to decorate this state is the single hardest discipline in the
system, and the most important one.

### 5.5 Live pipeline (`components/live-pipeline-view.tsx`)

Re-skin as a **chain-of-custody log**: monospace, left-aligned, timestamped rows
that stream in. Each completed stage collapses to a single dim line; the active
one is bright.

This turns 8–20 seconds of waiting into the product's best credibility argument —
the user watches the work happen. Never replace it with a spinner.

### 5.6 Scan permalink + OG image (`app/scan/[id]/`, `app/api/og/scan/route.tsx`)

The share card *is* the teardown, statically composed: store price struck
through, supplier price, stamp, multiplier. This is the growth surface — it should
be the most finished-looking artefact the product produces.

---

## 6. RTL & Hebrew

The primary market is Israeli storefronts. RTL is not a port, it is the default —
and this is where most redesigns quietly break.

- **Logical properties only.** `padding-inline`, `margin-inline-start`,
  `inset-inline-start`. Never `left`/`right`/`pl-`/`mr-`. Tailwind: `ps-`/`pe-`/
  `ms-`/`me-`, never `pl-`/`pr-`/`ml-`/`mr-`.
- **Prices must be bidi-isolated.** A price inside a Hebrew sentence must be
  wrapped in `<bdi>` (or `dir="ltr"`), or the currency symbol jumps to the wrong
  side. This is not hypothetical — Hebrew commerce markup is saturated with
  U+200E/U+200F controls, which is documented in `.claude/lessons.md` and is
  exactly why `lib/scraping/extract-price.ts` has to tolerate them on the way in.
  We must not reproduce the bug on the way out.
- **Mirror the stamp.** `-4deg` in LTR becomes `+4deg` in RTL, or it reads as
  falling over.
- **Do not mirror the tear** — a tear has no reading direction.
- **Hebrew tracking is not Latin tracking.** Heebo at `-0.04em` is unreadable.
  Cap Hebrew display tracking at `-0.02em`.
- **Numerals stay LTR always**, in both directions, in `tabular-nums`.

---

## 7. Motion system

Baseline from the `make-interfaces-feel-better` skill. No motion library is
installed; everything below is CSS-only and stays that way unless the stamp
proves unsatisfying, in which case add `motion` and use
`{ type: "spring", duration: 0.3, bounce: 0 }` — bounce always `0`.

| Rule | Value |
| --- | --- |
| Standard easing | `cubic-bezier(0.2, 0, 0, 1)` |
| Enter | fade + `translateY(8px)→0`, 300ms, staggered 100ms per semantic chunk |
| Exit | fade + `translateY(4px)`, 200ms — always softer than the enter |
| Press | `scale(0.96)` — never below `0.95` |
| Icon swap | `scale 0.25→1`, `opacity 0→1`, `blur 4px→0` |
| Transitions | interactive state = CSS transitions (interruptible). Keyframes only for the one-shot teardown |
| Never | `transition: all`. Always name the properties |
| `will-change` | only on the stamp, only while animating, removed after |

---

## 8. Accessibility & performance budget

Non-negotiable, and cheap to hold if designed in from the start:

- Contrast ≥ 4.5:1 on all text — verify tokens after any palette edit.
- **The verdict must never be colour-only.** Every tier carries a text label and
  an icon. A red-green colourblind user must be able to read the result.
- All motion has a `prefers-reduced-motion` path that jumps to the final state.
- Stamp is `aria-hidden`; the verdict is announced as text.
- Live pipeline is an `aria-live="polite"` region; do not let it spam every frame.
- Grain and texture layers are `pointer-events: none` and `aria-hidden`.
- Hit areas ≥ 40×40px.
- No `outline: none` — keep focus rings.

Performance:

- No WebGL, no canvas, no 3D, no parallax library, no scroll-jacking.
- Blur layers: the four fixed `blur(120–160px)` blobs are **removed**, not
  restyled. That is a real paint-cost win, not just an aesthetic one.
- Grain is one tiled inline SVG (~1.2KB), no request.
- Animate only `transform`/`opacity`.
- Targets: LCP < 2.0s, CLS < 0.05 (the count-up must not move layout — fixed-width
  `tabular-nums` is what buys this), INP < 200ms.

---

## 9. Implementation plan

Ordered so each phase ships independently and is individually revertible. Do not
start a phase before the previous one is visually verified in the browser.

**Phase 1 — Foundation** *(no visual redesign yet; pure substrate)*
- `app/globals.css`: add paper/stamp/tier tokens (§4.2), add `.grain` + `.paper`
  utilities (§4.3).
- `app/page.tsx`: delete the four ambient blob divs; add `.grain`.
- Add `tabular-nums` globally to numeric components.
- Risk: low. Reversible in one commit.

**Phase 2 — The paper primitive**
- New `components/ui/paper.tsx`: the opaque evidence surface (hairlines, hard
  shadow, `rounded-[2px]`, optional `.paper` fibre texture).
- New `components/ui/stamp.tsx`: BUSTED stamp, rotation, RTL mirroring,
  `aria-hidden`.
- Both isolated and Storybook-able before anything consumes them.

**Phase 3 — Tier-driven results** ← *highest product value*
- Split `components/analysis-results.tsx` by `presenceTier` into the three
  registers (§5.2–5.4).
- Build the `missingSignals` "what would have convinced us" block (§5.3). This is
  new surface, not a re-skin.
- **Verify against `lib/analyze/presence-tier.ts` — render the tier verbatim.
  Never re-derive a tier client-side from `confidence`.** (Existing hard
  invariant in `CLAUDE.md`.)

**Phase 4 — The Teardown animation**
- The tear `clip-path`, count-up, stamp landing (§5.2 timing table).
- `prefers-reduced-motion` static path implemented in the *same* commit, not after.

**Phase 5 — Landing rebuild**
- Replace the bento with live scan receipts (§5.1).

**Phase 6 — Surfaces**
- Chain-of-custody pipeline log (§5.5), scan permalink + OG card (§5.6),
  store pages, extension popup token alignment.

**Phase 7 — Detail pass**
- Run the `make-interfaces-feel-better` checklist over every touched component.
- Full RTL audit (§6) — every screen, both directions, real Hebrew content.

---

## 10. Open questions for the product owner

1. **How far does the brutalism go?** The spec above is "brutalist structure,
   humane details." A harder version (visible baseline grid, exposed monospace
   labels on everything, zero rounding anywhere) is available and more
   distinctive, but colder — and this product asks strangers to trust it with a
   purchase decision. My recommendation is the version specified.
2. **Does the stamp say `BUSTED` or Hebrew?** Latin reads more like a rubber
   evidence stamp and matches the product name; Hebrew is warmer to the actual
   audience. Recommendation: `BUSTED` in Latin, with the Hebrew verdict as
   adjacent text — the stamp is an icon, not a sentence.
3. **Is the affiliate CTA allowed to be the loudest green thing on the page?**
   Design-wise yes. Trust-wise, it must never be louder than the verdict itself,
   or we look like we are selling rather than reporting.

---

## 11. Anti-goals

Explicitly rejected, with reasons, so they don't get reintroduced later:

| Rejected | Why |
| --- | --- |
| Glassmorphism / ambient blur blobs | The template signature we are accusing others of; expensive to paint |
| Bento grid of feature cards | Superseded by anti-grid; live evidence is strictly more persuasive |
| Gradient clip-text headlines | Most-copied template element; costs legibility, adds no information |
| Kinetic typography in body copy | Fights screen readers and crawlers, destroys CLS — research-backed |
| WebGL / 3D / scroll-jacking | Cost with no argumentative payoff for an evidence tool |
| Light mode | Dark is the identity; a second theme doubles the QA surface for no gain |
| Animated grain | Battery and repaint cost for an effect nobody consciously notices |
| Decorating the `silent` state | The restraint *is* the feature |
| Colour-only verdicts | Accessibility failure and a trust failure |
