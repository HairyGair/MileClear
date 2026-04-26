# MileClear Design System

The living reference for how MileClear looks, reads, and feels. Anything that ships on mileclear.com, in the iOS app, in App Store screenshots, or in marketing assets should trace back here.

**Name of the system:** *Midnight Utility*. Dark, dense, confident. Built for drivers who want clarity over decoration.

---

## 1. Brand

### 1.1 Name

The product is **MileClear**, always written as one word, capital M and capital C. Never "Mileclear", never "Mile Clear", never "Mile-Clear". In the UI wordmark, "Mile" is white and "Clear" is amber — that contrast *is* the brand.

### 1.2 Tagline

Primary: **"Track every mile. Keep every penny."**

This is the one that goes on the App Store, the hero, and the OG image. Don't swap it for clever variants without a reason — repetition is what makes a tagline stick.

### 1.3 Voice

- **Direct.** "45p per mile for the first 10,000" not "calculating optimal reimbursement brackets".
- **Plain English.** "You've claimed £1,234 this tax year" not "total deduction accrued in 2025/26 fiscal year".
- **Honest about limits.** "Pro (£4.99/mo)" not "Pro tier (pricing varies)".
- **No hype.** No "revolutionary", no "world's first", no exclamation marks in product copy. Drivers smell it a mile off.
- **UK English, always.** `colour`, `organisation`, `kilometres` never `kilometers`. 4 April not April 4. £ not $.

### 1.4 Punctuation & typography rules

- **No em dashes.** Use regular hyphens with spaces around them instead: `free - forever`, not `free — forever`. Consistent across product, marketing, blog, everything.
- **Sentence case for most things** (buttons, labels, menu items): "Start shift", "Add vehicle".
- **Title Case for page and section titles:** "How Auto Detection Works", "Frequently Asked Questions".
- **Numbers:** commas for thousands (`1,234.5 mi`), 2dp for money in copy (`£4.99`), integers for pence in code.
- **Dates:** `6 April 2026`, or `21 Apr 2026` in tight spaces. Never `04/21/2026`.
- **Times:** 24-hour (`09:00 - 17:00`) for schedules, 12-hour (`9:00 am`) in conversational copy.

---

## 2. Colour

### 2.1 Canonical palette

| Token | Hex | Use |
|---|---|---|
| `bg-deep` | `#030712` | Primary app background. Every dark surface starts here. |
| `bg-primary` | `#060a16` | Slightly elevated page background. |
| `bg-secondary` | `#0a1020` | Cards at rest on web. |
| `bg-card` (web) | `rgba(15, 23, 42, 0.6)` | Glass cards on top of hero gradients. |
| `bg-card-solid` | `#0a1120` | Solid mobile cards and form fields. |
| `amber-400` (web) | `#fbbf24` | Primary accent on web. Buttons, badges, brand wordmark. |
| `amber` (mobile) | `#f5a623` | Primary accent on mobile. See §2.4 — there is currently drift. |
| `emerald-500` | `#10b981` | Success, active shifts, positive deltas. |
| `red` | `#ef4444` | Destructive, errors, negative deltas, sync failures. |
| `text-white` | `#f9fafb` | Hero type, primary headings. |
| `text-primary` | `#e2e8f0` | Body copy. |
| `text-secondary` | `#94a3b8` | Descriptions, muted labels. |
| `text-muted` | `#64748b` | Metadata, footer links. |
| `text-faint` | `#475569` | Disabled states. |

### 2.2 Transparencies and glows

| Token | Value | Use |
|---|---|---|
| `border-subtle` | `rgba(255,255,255,0.04)` | Barely-there dividers. |
| `border-default` | `rgba(255,255,255,0.07)` | Card borders, table rows. |
| `border-strong` | `rgba(255,255,255,0.12)` | Focused inputs, hovered cards. |
| `amber-glow` | `rgba(234,179,8,0.10)` | Soft amber wash behind hero content. |
| `amber-glow-md` | `rgba(234,179,8,0.18)` | Hero button hover state, Pro badge fills. |
| `amber-glow-strong` | `rgba(234,179,8,0.30)` | "Premium" highlights in dense UI. |
| `emerald-glow` | `rgba(16,185,129,0.12)` | Active shift cards, "Latest release" chip. |

### 2.3 Semantic meanings

Never use amber for success or emerald for premium. The associations are load-bearing:

- **Amber = premium / brand / primary action.** Pro, Download, Start shift.
- **Emerald = live / active / positive.** "Shift in progress", "+£12 vs last week".
- **Red = destructive only.** Delete, sign out confirmations, sync failures. Never for low-stakes warnings — use amber-glow for those.

### 2.4 Known drift to reconcile

Web uses Tailwind's `amber-400` (`#fbbf24`). Mobile and brand guidelines use `#f5a623`. They look similar but the mobile one is warmer (more orange). When a designer touches this next, pick one and consolidate — `#f5a623` is the historical brand value per `CLAUDE.md`.

---

## 3. Typography

### 3.1 Families

| Surface | Display (headings) | Body |
|---|---|---|
| Web | **Sora** (400, 500, 600, 700) | **Outfit** (300, 400, 500, 600, 700) |
| Mobile | **Plus Jakarta Sans** (300, 400, 500, 600, 700) | same as display |

Sora is geometric and a bit sharp — good for hero headlines. Outfit is neutral and readable at body sizes. Plus Jakarta Sans is mobile's single typeface because loading two on-device is expensive and the app's rhythm is dense, not editorial.

### 3.2 Type scale (web)

| Role | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| Hero | `clamp(2.5rem, 5.5vw, 4rem)` | 700 | `-0.04em` | 1.05 |
| Heading | `clamp(2rem, 4vw, 3rem)` | 700 | `-0.035em` | 1.12 |
| H2 section | `clamp(1.5rem, 2.5vw, 2rem)` | 700 | `-0.025em` | 1.2 |
| Subtext | `clamp(1rem, 1.4vw, 1.125rem)` | 400 | 0 | 1.75 |
| Body | `1rem` | 400 | 0 | 1.65 |
| Small | `0.875rem` | 400 | 0 | 1.5 |
| Label | `0.75rem` | 700 | `0.14em` | 1 |

**Labels are uppercase, 700 weight, amber** — they're the brand's signature micro-heading. Use them sparingly: one per section, above the heading.

### 3.3 Type scale (mobile)

Mobile is denser because list rows need to fit. Use these fixed sizes (no clamp):

| Role | Size | Weight |
|---|---|---|
| Screen title | 28 | 700 |
| Section heading | 16 | 700 |
| Card title | 16 | 600 |
| Body | 15 | 400 |
| Secondary | 13 | 400 |
| Caption | 11 | 500 |

### 3.4 Headings should lead with nouns, not features

Good: *"How auto detection works"*, *"Your HMRC deduction, live"*, *"One-off costs, covered."*
Bad: *"Powerful GPS tracking"*, *"AI-powered classification"*, *"Unlock advanced features"*.

---

## 4. Spacing

Base unit: **4px**. Everything is a multiple.

| Token | Web | Mobile |
|---|---|---|
| `xs` | 4px | 4 |
| `sm` | 8px | 8 |
| `md` | 12px | 12 |
| `lg` | 16px | 16 |
| `xl` | 20px | 20 |
| `xxl` | 24px | 24 |
| `xxxl` | 32px | 32 |

Web sections have vertical rhythm via `--section-y: clamp(5.5rem, 11vw, 9rem)` — use the `.section` class, don't hand-pick values.

Web container: `max-width: 1140px`, side padding `clamp(1.25rem, 5vw, 2rem)`.

---

## 5. Radius

| Token | Web | Mobile | Use |
|---|---|---|---|
| `sm` | 10px | 8 | Inputs, small badges |
| `md` | 14px | 12 | Buttons, form fields, cards |
| `lg` | 22px | 16 | Hero cards, modals |
| `xl` | 32px | - | Large feature cards |
| `pill` / `full` | 9999px | 20 | Chips, toggles, hero buttons |

Never use `border-radius: 50%` for non-circular elements — use `var(--r-full)` / `radii.pill` so the token shows up in search.

---

## 6. Components

### 6.1 Button

**Variants**

| Variant | When to use |
|---|---|
| `primary` | The one action the page is asking for. Amber fill, deep text. |
| `secondary` | Everything else. Surface fill, muted text, subtle border. |
| `destructive` | Delete, cancel subscription, sign out of all devices. |
| `ghost` | Tertiary actions in dense UIs (trip list row menus). No fill. |
| `hero` (mobile only) | The App Store / Download CTA. Amber with a subtle pulsing glow on iOS. |

**Sizes**

- `sm` — inline actions in cards and toasts.
- `md` — default for forms and dialogs.
- `lg` — hero CTAs and empty-state primary actions.

**Rules**

- Maximum **one primary** button per visible viewport. If you're tempted to put two, one of them isn't primary.
- Pair a primary with a `ghost` or text link for the secondary action, not two `primary`s.
- Loading state: spinner replaces label, width stays fixed, button stays clickable-looking but disabled. Never shrink to just a spinner.

### 6.2 Card

Three flavours:

1. **Surface card** — `bg-card-solid` + `border-default`. For content (trips, vehicles, earnings).
2. **Glass card** — `bg-card` (semi-transparent) + `backdrop-filter: blur(18px)`. For nav, hero overlays, floating panels.
3. **Elevated card** — same as surface, slight border uptick on hover (`border-strong`) for clickable rows.

Padding defaults to `--px` / `spacing.lg`. Rounded corners: `r-md` on tight grids, `r-lg` on feature cards.

### 6.3 Input

- 48px min touch target (16px vertical padding + 16px font size).
- Surface fill, subtle border at rest, amber-glow border on focus (`border-color: rgba(245,166,35,0.35)`).
- Error state: red border, red helper text below, never red fill.
- Placeholder colour is `text-faint` — light enough to read as a placeholder, not as a value.

### 6.4 Badge

- **Pro badge:** solid amber fill, deep text, 11px bold, `radius: 6px`. Use next to the word "Pro" or a gated feature name.
- **Status badge:** outlined (1px border, translucent fill), label case is uppercase and bold. Colour follows semantic rules (emerald = active, red = failed, amber = pending).
- **Count badge:** circular if single digit, pill if double/triple. `amber-glow-md` fill, amber text.

### 6.5 Chip

Filter chips (Work / Personal / All):

- Pill shape, surface fill, muted text at rest.
- Active state: amber fill, deep text. **No border change** — the colour swap is enough.
- Don't mix chip and button styles in the same row; pick one.

### 6.6 Label (the amber micro-heading)

Already covered in §3.2. This is the single-most-recognisable MileClear typographic tic. One per section, above the heading, never twice in a row.

---

## 7. Layout

- **Web breakpoints:** mobile-first; only meaningful break at `~768px` where nav collapses and pricing cards stack. Don't scatter arbitrary breakpoints through components — if a component needs one, it belongs in globals.css.
- **Mobile:** single-column. Everything fits within `SafeAreaView` minus tab bar (49pt iOS). Bottom-sheet modals preferred over navigation pushes for secondary actions.

---

## 8. Motion

- **Reveal on scroll:** 750ms ease `cubic-bezier(.22,.61,.36,1)`, opacity 0→1, translateY 32px→0. Staggered by 80ms per child (`reveal-d1` through `reveal-d4`).
- **Button hover:** 200ms background, 150ms transform. Lift of 1-2px max.
- **Page transitions:** none. The content is the message; hard cuts keep it feeling snappy.
- **Hero button glow (iOS):** subtle pulsing amber halo, ~1.2s period, respects `prefers-reduced-motion`.

No parallax, no auto-play anything, no decorative loops. If it moves, it's responding to the user.

---

## 9. Iconography

- **Web:** inline SVG, 1.5px stroke, `currentColor` fill.
- **Mobile:** `@expo/vector-icons` Ionicons, `outline` variants by default, filled only when the item is selected or active.
- Icon next to text: 0.5rem gap (`spacing.sm`). Icon + label share the same colour unless the icon is carrying semantic weight (e.g. red trash icon on a destructive row).
- Avatars are **30 vehicle PNG illustrations** in `apps/mobile/assets/avatars/`, string-keyed via the `AvatarRegistry`. They're personality, not decoration — one per account.

---

## 10. Imagery

- **OG image:** `og-image.png`, 1200×628. Dark background, MileClear wordmark, App Store CTA.
- **App Store screenshots:** iPad Pro 13" (2064×2752), generated from the actual app running in production data, not mocks. Frame with device chrome only when required by Apple — elsewhere, edge-to-edge.
- **QR code:** currently PNG, 76KB. TODO: convert to WebP (~10KB) or inline SVG. Use the tracked version in `apps/web/public/branding/qr-code.png` rather than generating fresh ones.

---

## 11. Accessibility

- **Colour contrast:** all body text passes WCAG AA against `bg-deep`. Amber on deep is borderline for small body copy — only use amber for display or interactive elements, not paragraphs.
- **Touch targets:** 48×48 minimum on mobile, including icon-only buttons.
- **Focus states:** amber 2px outline on web, offset 2px. Never `outline: none` without providing a replacement.
- **Reduced motion:** respected by the hero glow and by reveal-on-scroll. New animations must check `prefers-reduced-motion` or gate behind `useReducedMotion` on mobile.
- **Alt text:** every `<img>` gets meaningful alt text or `alt=""` if decorative. Avatars get the vehicle name ("Electric Hatchback avatar"), not "avatar".
- **Locale:** `html lang="en-GB"` on web, `locale: "en_GB"` in Open Graph. Never mix with `en-US` formatting.

---

## 12. Anti-patterns (the "don't" list)

- Don't use amber for "warning". Amber means premium. Use `amber-glow-md` for soft warnings in dense UI if you must, but prefer neutral copy.
- Don't introduce a second accent colour. MileClear is amber and emerald; adding purple or pink breaks the visual identity.
- Don't use drop shadows for elevation. We use borders and background value shifts instead. `filter: drop-shadow` is reserved for OG images and marketing.
- Don't centre body text longer than a heading. Hero paragraphs (≤2 lines) can centre; feature copy runs left-aligned with a max width of 580px.
- Don't use emojis in product copy. They're fine in achievement labels (internal), nowhere else.
- Don't use the word "Simply". If it was simple you wouldn't need to say it.

---

## 13. Where the tokens live

| Token source | Path |
|---|---|
| Web CSS variables | `apps/web/src/app/globals.css` (top 70 lines) |
| Web dashboard tokens | `apps/web/src/app/dashboard.css` |
| Mobile tokens | `apps/mobile/lib/theme.ts` |
| Brand assets | `apps/web/public/branding/`, `apps/mobile/assets/branding/` |
| Avatars | `apps/mobile/assets/avatars/avatar-01.png` through `avatar-30.png` |

When tokens drift between web and mobile (see §2.4), treat `apps/mobile/lib/theme.ts` as the source of truth and reconcile the web side. A future `packages/design-tokens` shared package is the proper fix.

---

## 14. Live reference

A rendered version of this system — swatches, type specimens, component samples — lives at **[mileclear.com/design](https://mileclear.com/design)**.

Update both this doc and that page when a token changes. If the two disagree, the page is a lie.
