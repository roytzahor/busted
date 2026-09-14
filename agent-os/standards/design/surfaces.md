# Glass And Bento Are Legacy Surfaces

The Ledger direction (`DESIGN.md`) replaces these with `<Paper>` and `<Stamp>`.
They are documented because they are still on screen and being retired phase by
phase — **not** as patterns to reach for in new work.

New surfaces use `<Paper>`. Reach for the classes below only when editing a
surface that already uses them, and prefer converting it.

## Glass

```
border border-white/8 bg-white/[0.04] backdrop-blur-xl
```

More opaque, inside cards: `bg-white/[0.07] backdrop-blur-sm`. The `.glass` and
`.glass-md` utilities in `globals.css` wrap the same thing.

## Bento grid cards

```
rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm
transition-colors hover:border-white/12 hover:bg-white/[0.05]
```

Step numbers as a watermark: `text-8xl font-black text-foreground/[0.04]`.
Icon containers: `rounded-xl border border-white/10 bg-white/5 p-3`.

## Buttons

- Primary CTA: `bg-primary shadow-lg shadow-primary/25 hover:shadow-primary/30`
- Success CTA: `bg-success shadow-lg shadow-success/20 hover:shadow-success/30`
- `.glow-primary` / `.glow-success` utilities live in `globals.css`

## Typography

Geist Sans (variable, loaded in `layout.tsx`). Headlines are
`font-black tracking-tight` with gradient text
(`bg-gradient-to-br … bg-clip-text text-transparent`):

- Primary: `from-primary via-orange-400 to-amber-300`
- Success: `from-success via-emerald-400 to-green-300`

Body copy is `text-muted-foreground`, 16px minimum.

Font **token wiring** is a different subject and has bitten harder — see
`design/tokens`.

## All className merges go through `cn()`

`cn()` (`lib/utils.ts`) for every merge; never concatenate class strings. It is
the most-connected node in the graph, so a change there has repo-wide reach.
