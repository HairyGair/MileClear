# Home redesign: visual spec (10 Oct 2026)

Owner: visual layer. What goes on Home and in what order is the UX designer's call (`PROPOSALS.md`, recommended Layout A "Calm list"); this file says how each piece looks, moves and scales. Where the two disagree, UX wins on content and order, this file wins on look. Section 13 lists where they meet.

It continues the language set by the Insights redesign (`docs/insights-oct2026/SPEC-VISUAL.md`, in the main checkout) and the 7 Oct simplify pass (`docs/ui-simplify-oct2026/SPEC-VISUAL.md`), so Home reads as the same app:

- **One amber thing to press per view.** Amber fill = the primary action (Start Trip). Amber also marks "you, now" (Business when chosen, the route of your trip).
- **Green means live or done. Red means "this is broken" only.** Never green or red for up or down.
- **One hero per screen**, one number per fact, **never a zero as a headline**.
- Calm: no looping animation except the live-recording dot, nothing that bounces.

All sizes in points (dp on Android). Contrast is WCAG 2.x, computed from the hexes, against `colors.bg` #030712 unless stated. Everything reuses `apps/mobile/lib/theme.ts` unless marked **NEW**.

---

## 0. What the current Home looks like (from `screens/before/`)

1. **Four amber marks before the figure**: the amber Work pill, the amber Automatic trips switch, the amber "Not working? Tell us" link, then the amber £139.33. Add Start Trip and Start Shift and there are six amber things on the first screen. Nothing is the action because everything is.
2. **The mode toggle is the biggest control on the screen** (amber pill, 52 high, centred). It is a setting, styled like a primary button.
3. **The red blocker is a paragraph** (4 lines of text2 on dark red) with a pink title. The fix is buried in "Tap to switch it back to Always".
4. **The hero number is amber, 52pt light weight**, and the label under it is **green** ("business mileage to claim this tax year"), so it reads as good news whatever the number is. On Insights numbers are text1 bold; Home should match.
5. **"0.0 mi today"** is the first item of the meta line. A zero, every morning.
6. **Quick-action tiles** (four tiles with amber icons) add four more amber marks and look like a second navigation bar competing with the tab bar.
7. Personal's "205 miles, all driving" is amber 52pt light with an **amber month label**; Work's figure is a different card. Same slot, two looks.

## 1. Hierarchy

Home has six levels. Each has one look, and nothing borrows the look of a level above it.

| Level | What | Look |
|---|---|---|
| 1 Problem (only when there is one) | Status line, warning or blocking | Tinted strip, the only red or amber-tinted fill on screen |
| 2 The figure | Claim (Work) or month miles (Personal) | Hero card, 44 bold text1 |
| 3 The action | Start Trip (+ Start Shift) | Amber fill; Start Shift secondary |
| 4 What just happened | Last trip with Business / Personal | Standard card |
| 5 Doors | Up to three rows into Tax, Insights, Earnings, Badges, Fuel | One grouped standard card, quiet rows |
| 6 Ask | One slim dismissible row (vehicle, Pro, invite...) | Row on `bg`, below the fold |

Supporting chrome (header, mode pill, status line in its fine state) is level 0: text2 or text1, no fill, no amber.

## 2. Tokens

### Reused, no change

| Token | Value | Home use |
|---|---|---|
| `colors.bg` | #030712 | Screen |
| `colors.surface` / `surfaceBorder` | #0a1120 / white 6% | Last trip card, door card, Start Shift, mode pill track |
| `colors.hairline` | white 8% | Row dividers, status line bottom edge, ask row top edge |
| `colors.amber` | #f5a623 | Start Trip fill, Business chosen, route line, warning icons, `Resume` |
| `colors.amberDim` | amber 12% | Warning strip fill, Business chip fill |
| `colors.amberGlow` | amber 35% | Hero card border, unsorted classify control border |
| `colors.text1/2/3` | #f0f2f5 / #8494a7 / #94a3b8 | Numbers and titles / labels / hints |
| `colors.live` | #34c759 | "Recording" dot |
| `colors.green` | #10b981 | Done ticks only ("All sorted") |
| `colors.red` / `redDim` | #ef4444 / red 12% | Blocking strip icon and action / fill |
| `colors.personal` / `personalEdge` | #374151 / #94a3b8 | Personal chosen, selected segment of the mode pill |
| `chart.track` | #191f2d | Mini map ground, new-driver icon circle |
| `heroCard` | tint #181a20, border amber 35%, radius 20 | Hero |
| `numberSizes.hero` | 44 | Hero figure |
| `motion` | quick 180, settle 420, stagger 40 | All Home motion |
| `spacing`, `radii`, `fonts`, `fontSizes`, `fontScaleCap` | as theme | Everywhere |

### NEW (add to `theme.ts`)

```ts
// Home status line: the edge of the blocking strip, the red twin of
// amberGlow. Decorative (fill + icon + words carry the state).
colors.redEdge = "rgba(239,68,68,0.35)";

// Live dot breathing period (status line while a trip records).
// The only looping animation on Home; off under Reduce Motion.
motion.pulse = 1600;
```

Nothing else is new. The hero reuses `heroCard` and `numberSizes.hero` from Insights, so the top cards of the two screens are visibly the same family (Home's is shorter, with no dial).

## 3. Type scale for Home

Same roles and sizes as Insights section 8, plus Home-only roles that reuse existing sizes.

| Role | Size / weight | Colour | Cap (`fontScaleCap`) |
|---|---|---|---|
| Hero figure | 44 / bold, tabular, -0.5 tracking | text1 | display 1.3 |
| Hero unit (miles) | 18 / semibold | text2 | 1.3 |
| Hero label | 14 / medium, sentence case | text2 | body 1.6 |
| Hero line | 16 / regular, lh 22 | text1 | 1.6 |
| Status line title | 14 / semibold | text1 | 1.6 |
| Card eyebrow (last trip time and miles) | 12 / semibold | text2 | 1.3 |
| Last trip route | 16 / semibold | text1 | 1.6 |
| Door sentence | 15 / medium; the one key figure 15 / bold | text1 | 1.6 |
| Ask title / line | 14 / semibold text1 / 13 / regular text2 | | 1.6 |
| Button label | 16 / bold (primary), 16 / semibold (secondary) | bg / text1 | heading 1.4 |
| Text link | 14 / semibold | amber (action) or text2 (neutral) | 1.6 |
| Empty-state title | 18 / bold | text1 | 1.4 |

No uppercase labels ("MILEAGE CLAIM · 2026-27" becomes `Mileage claim · 2026-27`, as on Insights). No light (300) weights on Home: the 52pt light amber figure becomes 44 bold text1. 15 for door sentences sits between `body` and `bodyLg`; it is the size the Trips list uses for row titles, so the doors read as rows, not paragraphs.

## 4. Layout and spacing

```
    ┌ status bar ──────────────────────────────────────┐   ~60
 16 │ header: logo  MileClear     [Work|Personal] (av) │   56
    │ status line (fine: one line, no fill)            │   48
 12 │ ╔ hero card ══════════════════════════════════╗  │   132
 16 │ [  Start Trip (amber) ][ Start Shift ]           │   56
 20 │ ┌ last trip card ─────────────────────────────┐  │   112 + 44 footer
 20 │ ┌ door rows ×3 ───────────────────────────────┐  │   3 × 52
 20 │   ask row (one, dismissible)                     │   64
    └ tab bar ─────────────────────────────────────────┘   83
```

- Screen gutter 16 (`spacing.lg`) on every width, as on Insights and every other tab.
- Gaps: 12 between status line and hero (they belong together), 16 between hero and buttons, 20 (`spacing.xl`) between the larger groups. Home has fewer blocks than before, so it gets more air than Insights' 12.
- Work, all fine, iPhone 17: status 48 + hero 132 + buttons 56 + last trip 156 + doors 156 + gaps 80 = 628 of the ~675 available, so everything except the ask is on the first screen. On an SE the doors fold; status, hero, buttons and last trip stay above it.
- Visual rules on order (UX owns the rest): **Start Trip is never below the fold at default text size**, and **the status line is never below the hero**.

### Card vs no card

| Surface | Used for | Why |
|---|---|---|
| **No card** (on `bg`) | Header, status line in its fine, live and neutral looks, Start Trip / Start Shift, ask row | Status that's fine should be a whisper. Buttons are already shapes. The ask is the lowest level. |
| **Hero card** (`heroCard`) | The figure, exactly one | Same top-card family as Insights. |
| **Standard card** (`surface`, 1pt `surfaceBorder`, radius 16, padding 16) | Last trip, door group | Things you read and tap. |
| **Tinted strip** (radius 12) | Status line, warning (amberDim) or blocking (redDim + redEdge) | The only tinted fills on Home, so a problem is unmistakable. |
| Never | Amber top borders, icon tiles, nested cards, quick-action tile grids, maps with live tiles | |

## 5. Components

### 5.1 Header and mode pill

| Part | Spec |
|---|---|
| Header | Existing `AppHeader`: logo 32 + "Mile" text1 / "Clear" amber wordmark 22 bold. Avatar 36 right. |
| Mode pill | In the header, left of the avatar, gap 10. The Insights period switch in miniature: height 30, about 132 wide, track `surface` + 1pt `surfaceBorder`, radius `pill`, 2pt inner padding; selected segment `colors.personal` #374151 with 1pt `personalEdge`, label text1 (9.2:1); unselected label text2 (6.1:1 on surface). Labels 13 / semibold, cap 1.3. **Not amber**: it is a setting, not the action. 44 hit height via `hitSlop`. |
| Mode explainer (i) | Leaves Home; a link in the Recording sheet, plus the existing first-visit pop-up. |
| Narrow or large text | At `width < 380` or `fontScale > 1.3` the pill leaves the header and sits on its own row under it, full width, height 36. |
| Change | `Haptics.selectionAsync()`; content cross-fades `motion.quick` 180. The layout does not move, because both modes use the same slots. |

### 5.2 Status line

Replaces the Automatic trips row, recording banner, sync banner, trip status strip, red blocker card, setup checklist card, Low Power card and "We improved your trip data" banner. One message at a time, in the priority order of PROPOSALS 0.2. Four looks cover all of them:

| Look | Messages | Surface | Leading | Title | Trailing | Contrast |
|---|---|---|---|---|---|---|
| **Fine** | `Recording automatically` | None. 48 high row on `bg`, 1pt `hairline` bottom edge | 8pt solid dot `colors.live` | 14 / semibold / text1 | `chevron-forward` 14 text3, opens the Recording sheet | dot 9.1:1, title 18.0:1 |
| **Live** | `Recording · 3.1 mi · 6 min` | As Fine | 8pt `live` dot, breathing (section 6) | 14 / semibold / text1, tabular | chevron, opens the live trip | as Fine |
| **Neutral** | `Automatic trips off. Only Start Trip records` | As Fine | 8pt hollow dot, 1.5pt `text2` ring | 14 / semibold / text1 | chevron | ring 6.5:1 |
| **Warning** | `Paused until 18:00`, `Low Power Mode is on. Drives may not record`, `Finish setting up · 2 of 4 done`, `We recovered 12.4 miles on 3 trips` | Strip: fill `amberDim` on bg (= #1b1714), no border, radius 12, padding 12 / 14, min height 48 | Ionicons 18 in amber: `pause-circle`, `battery-dead-outline`, `list-outline`, `sparkles-outline` | 14 / semibold / text1 | Paused: a `Resume` pill, 30 high, radius pill, 1pt amber border, label 13 / bold / amber (outline, so Start Trip stays the only amber fill). Others: chevron | amber 8.8:1, title 15.9:1 |
| **Blocking** | `Trips aren't recording`, `2 trips couldn't upload` | Strip: fill `redDim` on bg (= #1f0e18), 1pt `colors.redEdge`, radius 12, padding 12 / 14, min height 48 | Ionicons 20 `alert-circle` / `cloud-offline-outline` in `colors.red` | 14 / semibold / text1 | `Fix` / `Retry` 14 / bold / `colors.red` + chevron. Whole strip tappable | red 4.9:1 on the strip (AA, normal text), title 16.5:1 |

Rules:
- **Words, not colour.** Every message has its own icon shape and a title that says what's happening, so it reads in greyscale and for colour-blind drivers. The three dot looks differ by shape too (solid, breathing, hollow ring).
- **One line, verb split out.** PROPOSALS writes "Tap to fix" into the sentence; visually the verb sits on the right (`Fix`, `Retry`, `Resume`) so the title stays a plain statement and the action is where the thumb expects it. Detail (which permission, which trips) lives on the screen the strip opens.
- **Never contradict.** When blocking, nothing on Home says "Recording automatically".
- Blocking uses red text for `Fix`, not an amber button: red is the state, and Start Trip stays the only amber fill.
- Accessibility: the strip is one `accessibilityRole="button"`, label = title + action ("Trips aren't recording. Fix."). The Resume pill is its own button. A change to blocking is announced with `AccessibilityInfo.announceForAccessibility`.

### 5.3 Hero figure

Same card family as the Insights hero (tint, amber 35% border, radius 20), shorter, no dial (Decision F made the Work hero plain; Home is plainer still).

| Part | Spec |
|---|---|
| Card | `heroCard`, padding 20, about 132 high. Whole card tappable (Tax in Work, Insights Month in Personal); `chevron-forward` 16 text3 at the right, vertically centred on the figure. |
| Label | 14 / medium / text2, sentence case. `Mileage claim · 2026-27`, `Business miles · 2026-27` (company), `October` (Personal), `Since 6 April` (claim under £50). |
| Figure | 44 / bold / **text1** (not amber), tabular, -0.5 tracking. `£139.33`; `205` + unit `miles` 18 / semibold / text2 on the same baseline. |
| Line | 8 under, 16 / regular / text1, max 2 lines: `182 business miles this week`, `182 this week · 5 trips this month`. Monday-to-Sunday week, same as Insights. |
| After a trip | When the last trip just added to the figure: a 12 / semibold / text2 note right of the label, `+£6.82 from your last trip`. The plus sign carries it; no arrow, and not green (up is not "good"). Gone on the next app open. |
| Avatar | Not in the Home hero. It is in the header; Insights owns the avatar-in-hero moment. |
| Free driver | Same hero. No upsell inside it. |
| Copy rule | Never "HMRC-ready" or any adjective pairing HMRC with MileClear. "at HMRC rates" is fine. |
| Zero rule | If the figure would be £0.00 or 0 miles, the hero is hidden (new driver) or shows the quiet-period version (section 8). |

### 5.4 Trip buttons

| | Start Trip | Start Shift (Work mode, gig or Both drivers only) |
|---|---|---|
| Component | `Button variant="primary" size="lg"` | `Button variant="secondary" size="lg"` |
| Height / radius | 56 / `radii.md` 12 | 56 / 12 |
| Fill | `colors.amber` | `colors.surface`, 1pt `rgba(255,255,255,0.12)` |
| Icon | `navigate` 20 `bg` | `play` 18 `amber` (one amber mark keeps the pair reading as "trip things") |
| Label | 16 / bold / `bg` (9.9:1) | 16 / semibold / text1 (16.8:1) |
| Width | Start Trip `flex: 3`, Start Shift `flex: 2`, gap 12. Everyone else: Start Trip full width. | |
| Glow | None (`primary`, not `hero`: a glowing button on Home is noise, 7 Oct rule). | |
| Large text | At `fontScale > 1.3` or `width < 380`: stacked, Start Trip on top, both full width, gap 8. | |

**Open point:** PROPOSALS and the 7 Oct spec draw Start Shift as an amber outline. With the Resume pill, the Business chip and the route line also using amber, the outline would be the second-loudest amber shape on screen. A secondary button with an amber `play` icon keeps it findable and leaves one amber fill. The mockups draw this version; switching back to the outline changes nothing else.

### 5.5 Last trip card

Standard card. Three looks: **unsorted** (classify control shows), **compact** (older trip, already sorted) and **first trip** (new driver, section 8).

| Part | Spec |
|---|---|
| Mini map | 56 x 56, radius 10, left of the text, 12 gap. Static route thumbnail: `chart.track` #191f2d ground, the route as a 2.5pt amber line (routes are amber in every mode, 7 Oct), start a 6pt hollow `text1` ring, end a 6pt amber dot. No map tiles (a live map per Home load is too heavy). Manual trip with no route: start and end joined by a dashed 1.5pt text3 line. |
| Eyebrow | 12 / semibold / text2: `Just now · 12.4 mi`, `Today 17:40 · 12.4 mi`. |
| Sync chip | Right of the eyebrow, 12 / semibold, no fill: `Synced` text2 + `checkmark` 12; `Saving` text2; `Waiting for signal` text2 + `cloud-outline`; `Needs attention` `colors.red` + `alert-circle`. Only the problem case is coloured. |
| Route | 16 / semibold / text1, `Home to Sunderland Depot` (written "to", not an arrow, so screen readers say it). Up to 2 lines, then truncate the middle of the first place name, never the destination. |
| **Classify control** (unsorted) | The trip-summary control from 7 Oct section 4, reused: spans the text column, height 40 (44 hit with `hitSlop`), track `surface` + 1pt `amberGlow` (the "neither chosen" state), radius 10, two halves, labels 14 / semibold / text1 with `briefcase-outline` / `person-outline` 16 text2. |
| Tap Business | Half fills `colors.amber`, filled `briefcase` + label `bg` bold (9.9:1). `Haptics.selectionAsync()`. Saves at once, offline too. |
| Tap Personal | Half fills `colors.personal` #374151 with 1pt `personalEdge`, filled `person` + label text1 (9.2:1). Selected never rests on fill alone: the icon switches to filled. |
| Auto tag | When rules pre-set the choice: 11 / bold, `Auto` after the label inside the chosen half, same colour as the label. |
| After choosing | The chosen state stays. The card does not advance to the next unsorted trip by itself (Home should not move under the thumb); the footer count drops by one. On the next visit an older sorted trip shows the compact look. |
| Footer row | When other trips are unsorted: hairline, then a 44 high row `3 more trips to sort` 14 / semibold / text1 + chevron text3, to Trips filtered to unsorted. Missed drive suspected: `We may have missed a drive yesterday` in the same row. No row when nothing waits. |
| **Compact look** (older, sorted) | 64 high: 40 mini map, `Yesterday 17:40 · 8.2 mi` 14 / semibold / text1, then a chip: Business = `amberDim` fill, `briefcase` 12 amber, label 12 / bold / amber (8.3:1); Personal = `#374151` fill, `person` 12 text1, label text1. Chevron text3. |
| Everything sorted | No footer row; the sync chip reads `Synced`. |
| Card tap | Anywhere outside the control: opens the trip summary. |
| Accessibility | The control is a radiogroup of two `radio` items labelled "Classify trip, Home to Sunderland Depot, 12.4 miles". Saving announces "Saved as Business". |

### 5.6 Door rows

One standard card holding up to three rows (PROPOSALS 0.6 picks which). Each row says one fact the tab's name doesn't.

| Part | Spec |
|---|---|
| Row | 52 high (grows with text), 16 horizontal padding, hairline between rows inset 52 from the left (aligned with the text). Whole row pressable; press = background `rgba(255,255,255,0.04)` for `motion.quick`. |
| Leading icon | Ionicons outline 20, text2, 16 gap. Tax `document-text-outline`, Insights `stats-chart-outline`, Earnings `cash-outline`, Badges `ribbon-outline`, Fuel `water-outline`, Help `help-circle-outline`. **No icon tiles.** Amber only for a road alert (`warning-outline`), the one "needs you now" door. |
| Sentence | 15 / medium / text1, one line preferred, 2 max. The one key figure 15 / bold: `This week: 5 trips, £58 claim built`, `Next badge: Explorer, 22 miles away`, `Diesel 139.9p at Tesco Silksworth`. The words name the destination ("This week", "Next badge", "Diesel"), so no eyebrow. |
| Trailing | `chevron-forward` 16 text3. Never a count badge. |
| Pro figure, free driver | The row shows the free part of the fact; the tab opens its own preview. No `PRO` pill on Home. |
| Empty | A row with nothing honest to say is not drawn; the next moves up. No rows, no card. |

### 5.7 Ask row

One at a time, below the doors, never above the trip buttons, hidden while the status line is blocking (PROPOSALS 0.7).

| Part | Spec |
|---|---|
| Surface | No card: a 64 high row on `bg` with a 1pt `hairline` top edge. Quieter than the doors on purpose. |
| Leading | Ionicons outline 20 text2. |
| Text | Title 14 / semibold / text1, one line under 13 / regular / text2. Title + line are the tap target. |
| Dismiss | `close` 18 text3 in a 44 box, right. |
| Pro ask | The word `Pro` in amber in the title; nothing filled. |

## 6. Motion

All via Reanimated, all skipped when `useReducedMotion()` (from `lib/accessibility.ts`) is true, showing the end state at once. Reuse `components/FadeInStagger.tsx`.

| Moment | Animation | Timing |
|---|---|---|
| First open of the session | Status, hero, buttons, last trip, doors fade 0 to 1 and rise 8, staggered | `motion.settle` 420, `motion.stagger` 40, `Easing.out(Easing.cubic)`. Cold start only, not every tab focus. |
| Hero figure changed (trip just added) | Counts from the old value to the new; the `+£6.82` note fades in after | `motion.settle` 420. No count if the change is under £1 / 1 mile. |
| Status line changes look | Cross-fade; the strip's height animates in or out | `motion.quick` 180 fade, `motion.settle` height (Reanimated `Layout`). |
| Live dot | Opacity 1 to 0.4 and back | `motion.pulse` 1600, `Easing.inOut(Easing.sin)`, loops. The only loop on Home. Reduced motion: solid dot. |
| Business / Personal chosen | Fill slides into the chosen half | `motion.quick` 180 |
| New last trip arrives | Card content cross-fades | `motion.quick` 180. No slide, no bounce. |
| Press | Cards and rows scale 0.98 | `motion.quick` 180 |
| Mode change | Content cross-fades, layout stays still | `motion.quick` 180 |

No confetti or burst on Home; celebrations belong to Insights. Haptics: `selectionAsync()` on mode change and on Business / Personal. Nothing else on Home vibrates.

## 7. Dynamic Type (iOS Larger Text, Android font scale)

- Every `<Text>` carries `maxFontSizeMultiplier` from section 3.
- **At `fontScale > 1.3`:** the mode pill moves under the header; Start Trip and Start Shift stack; the last-trip mini map moves above the text; door sentences wrap freely (no `numberOfLines`), chevrons stay vertically centred.
- **At AX sizes:** body text stops at 1.6x; the hero figure stops at 1.3x (57pt). `£10,000.00` at 57 bold is about 310pt, inside the 330pt the card leaves.
- The status line never truncates its action: the title wraps, and if title and action don't fit on one line the action drops below the title, left-aligned.
- Only the buttons (min 56) and the classify control (min 40) have fixed heights; everything else grows.
- Order never changes with text size: a driver who zooms sees the same Home, longer.

## 8. Empty and edge states

| State | Hero | Last trip slot | Doors and ask |
|---|---|---|---|
| **New driver, 0 trips** | **Hidden.** No £0.00, no 0 miles. | `Your first trip` card, about 120: 40 `car-outline` text2 in a 48 `chart.track` circle; title 18 / bold / text1 `Your first trip`; 15 / regular / text2 `Just drive. MileClear starts recording when you pass 15 mph.`; under a hairline, one text link 14 / semibold / amber `Add a past trip` (the card's action). "How it works" is the single door row below, so it isn't repeated in the card. Start Trip is full width above it (Start Shift appears after the first trip). | One door: `How MileClear works`. One ask (vehicle or "Where did you hear about MileClear?"). Status line usually warning: `Finish setting up · 1 of 4 done`. |
| **Quiet period** (older trips exist) | Personal: label `October`, the figure replaced by 22 / bold / text1 `A quiet month so far`, line `September: 640 miles`. Work early in the tax year: last year's claim leads, line `2026-27 so far: £12.40`. | Compact look; the eyebrow can say `4 days ago`. | As normal |
| **Manual trip, no route** | | Mini map shows the dashed start-to-end line. | |
| **Free driver** | Same | Same | Pro facts swapped for free ones |
| **Offline** | From local SQLite, unchanged | Same; chip `Waiting for signal` | Rows that need the server (fuel prices) are not drawn |

Never on Home: `£0.00`, `0.0 mi today`, `0%`, `No routes yet`, `£0.00 / £500 target`.

## 9. Light appearance check

The app is dark only: `theme.ts` has one static palette, no screen picks colours from `useColorScheme`, and `LightStatusBar` in `app/_layout.tsx` forces light status-bar content on every appearance change. `app.json` still says `userInterfaceStyle: "automatic"`. With the phone in Light appearance, Home stays dark, which is right; a light Home on its own would be the only light screen.

What still follows the system in Light appearance, to check on a device once built:
- Native `Alert`s, action sheets and the share sheet turn light. Fine for system UI, but the **Recording sheet** behind the status line must be our own dark sheet, not an `ActionSheetIOS`.
- The status bar after returning from Settings (the Fix flow sends drivers there and back): confirm it is still light content.
- Android navigation bar colour: confirm it stays `bg`.
- Long term, `userInterfaceStyle: "dark"` in `app.json` would settle all of this, but it is native config (store build), so not part of this OTA-able redesign.

All contrast figures here are for the dark palette only.

## 10. Work vs Personal

Same slots, order and looks; only the words, the figure and one button change.

| Slot | Work (gig) | Personal |
|---|---|---|
| Hero | `Mileage claim · 2026-27` / `£139.33` / `182 business miles this week` | `October` / `205 miles` / `182 this week · 5 trips this month` |
| Buttons | Start Trip + Start Shift | Start Trip, full width |
| Last trip | Classify control when unsorted | Classify control only when unsorted |
| Doors | Tax, Insights, Earnings | Insights, Badges, Fuel |

## 11. Accessibility checklist

| Pair | Ratio | Passes |
|---|---|---|
| text1 on bg / surface / hero tint | 18.0 / 16.8 / 15.5 | AAA |
| text2 on bg / surface / hero tint | 6.5 / 6.1 / 5.6 | AA |
| text2 on amber strip #1b1714 / red strip #1f0e18 | 5.7 / 6.0 | AA |
| amber on bg / surface / amber strip | 9.9 / 9.3 / 8.8 | AAA |
| bg on amber (Start Trip, Business chosen) | 9.9 | AAA |
| red on red strip (`Fix`, icon) | 4.9 | AA |
| live dot on bg | 9.1 | 3:1 graphics |
| text1 on #374151 (Personal chosen, mode pill) | 9.2 | AAA |
| amber on amberDim chip over surface (#1d1d20) | 8.3 | AAA |

- Colour never alone: status looks have distinct icons and words; chosen = fill + filled icon + label; problem chip = red + icon + words.
- Touch targets: everything at least 44 x 44 (status 48, doors 52, ask 64, classify 40 + `hitSlop`, buttons 56).
- Screen-reader order matches visual order: status, hero, buttons, last trip, doors, ask.
- Reduced motion: every item in section 6 has a static path.

## 12. Dependencies and risks

- No new dependencies (Reanimated, expo-haptics, Ionicons are in the binary). Ships by OTA. The mini map is drawn with Views (rotated line segments) from the trip's simplified coordinates, or from the route polyline the trip summary already decodes; no `react-native-svg`.
- Two new tokens (`colors.redEdge`, `motion.pulse`).
- Risk: the fine-state status line is quiet enough to stop being noticed. Mitigated: every non-fine state adds a shape (a strip), not just a colour, and blocking is announced.
- Risk: a second place to classify. Home and Trips must call the same action and sync queue item, so a choice on Home shows on Trips at once.

## 13. Meeting PROPOSALS (Layout A)

| PROPOSALS | This spec |
|---|---|
| 0.1 Header pill 30 high, avatar 36 | 5.1, neutral slate pill, not amber. |
| 0.2 Status line, 8 messages | 5.2, four looks. Sync failure red, as PROPOSALS says. |
| 0.3 Hero, caps label, 15pt line | 5.3: sentence case and 16pt line, to match Insights. Figure text1, not amber. |
| 0.4 Last trip with mini map, sync chip, Auto tag | 5.5. The card doesn't jump to the next trip after a choice. |
| 0.5 Start Shift outline | 5.4: secondary with an amber icon. **Open point** for Anthony. |
| 0.6 Door rows 52 | 5.6, 15pt sentence, one bold figure. |
| 0.7 Ask row 64 | 5.7, no card. |
| Side margins 20 | **Kept at 16**, matching Insights and every other tab. |
| No Customise link, no More | Agreed; nothing below the ask. |
