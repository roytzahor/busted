# One House Curve, And The `animate-in` Trap

Full system in `DESIGN.md` §7. These are the parts that break silently.

## The house curve

`cubic-bezier(0.2, 0, 0, 1)`, set in `app/globals.css` by overriding the
**stock** Tailwind tokens `--ease-out` and
`--default-transition-timing-function`.

Overriding the standard names rather than adding a parallel `--ease-house` is
deliberate: every bare `transition-*` and every `ease-out` already written picks
it up with no call-site change, and later code gets it by default instead of by
remembering.

## `animate-in` without `ease-out` is a bug

`tw-animate-css` defines `--animate-in` with a `var(--tw-ease, ease)` fallback.
An `animate-in` with no `ease-*` class animates on plain `ease`, which **ramps
in** at the exact moment the user is watching.

Note the overrides above set `--ease-out`, **not** `--tw-ease` — so this trap is
still live. Always pair them:

```
animate-in fade-in slide-in-from-bottom-2 ease-out duration-300
```

## Transitions

Name the properties — `transition-[color,box-shadow]`, 150–300ms. Never
`transition-all`. Press is `active:scale-[0.96]`, never below `0.95`.

## Reduced motion

Entry *animations* jump to their final state, but *transitions* narrow to
opacity/colour rather than being killed. A blanket
`transition-duration: 0.01ms !important` on `*` makes every meaningful state
change teleport — which is the jarring result the transition existed to
prevent. Reduced motion means no vestibular movement, not no feedback.

`animate-pulse` is for skeletons only — never on status text a user is reading.
