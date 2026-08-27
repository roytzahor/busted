# Nothing Anyone Pays For May Change What A User Sees

This binds merchants, affiliate networks, **and us**. The verdict's entire
value is that it cannot be bought.

## Disclosure

- `DISCLAIMER_LONG` (`lib/brand.ts`) states plainly that we earn commission on
  supplier links and that the verdict is computed **before** the affiliate link
  is fetched. It must never again claim we are "not affiliated" with the
  marketplaces we link to.
- `AFFILIATE_DISCLOSURE` renders **inside the CTA container, above the button**
  — never below it, never only in the footer. The conflict has to be visible at
  the moment of the click.
- Every affiliate anchor carries `rel="noopener noreferrer sponsored"`.
- The FAQ answers "How does Busted make money?". A trust product that hides how
  it earns loses the argument the moment a sceptic hovers the link.

## Ranking neutrality

**Commission rate may never enter candidate ranking.**

Link *viability* may — a broken link is a worse user outcome.
`REPUTATION_PENALTY_MULTIPLIER = 0.7` (`lib/aliexpress/reputation.ts`) applies
when a candidate's affiliate-link failure rate exceeds 80% over ≥5 samples.
That is defensible, and it is also the closest this codebase comes to the line.
Keep the fence explicit: viability yes, value never.

## Chrome Web Store compliance

Google's post-Honey policy requires disclosure before install, **user action
before any affiliate link, code or cookie is applied**, and a direct user
benefit at that moment.

- The extension's passive `quick-lookup` on page load is compliant **because it
  is read-only**. Never pre-warm an affiliate cookie or pre-open a link "for
  latency" — that is the exact pattern the policy was written for.
- Never render an affiliate link without a concrete price delta.

## The anti-strategy, drawn correctly

Prohibit by **mechanism**, not by counterparty. "Never sell to merchants"
over-blocks safe revenue (brand protection, index API) and under-blocks the
real hazard — our own money influencing ranking. Merchant-supplied evidence may
be displayed: attributed, user-inspectable, and never for money.
