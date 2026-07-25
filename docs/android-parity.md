# Android vs iOS feature parity

Audit date: 25 July 2026, branch `android`.

Method: every `Platform.OS === "ios"` site in `app/`, `lib/` and `components/`
was read and classified, plus every iOS-only native module, config plugin and
`Alert.prompt` call site. Nothing here is inferred from the feature list; each
row was checked against the code.

**Nothing below has been verified at runtime.** There is no Android device or
emulator yet. "Works" means the code path exists and compiles for Android, not
that it has been observed working.

## 1. Full parity — same code, both platforms

Trips (GPS + manual), shifts, vehicles + DVLA lookup, fuel logs, earnings,
expenses, invoices, clients, saved locations, geofencing, gamification and
achievements, business insights, analytics, exports, tax tooling (Tax
Readiness, HMRC reconciliation, Self Assessment wizard, MTD), feedback,
referrals, admin panels, sync engine, offline SQLite, auth by email and
password, dark/light themes.

These have no platform branches at all.

**Receipt OCR** joined this list on 25 Jul (`d17493c`): Apple Vision on iOS,
Google ML Kit on Android, one interface, shared parser. The only visible
difference is that Android shows no confidence percentage, because ML Kit
doesn't report one and inventing a figure would present a guess as a
measurement.

**Navigation deep links** already had a Google Maps path on Android.

## 2. Fixed during this audit

| Gap | Was | Now |
|---|---|---|
| Hourly rate for live shift earnings | `Alert.prompt` with no platform check. RN wraps that whole API in an iOS check, so on Android the button did **nothing at all** — no dialog, no error | Android gets a real input modal (`1a8eee7`) |
| Permission + biometric guidance | Told Android users to find "Always Allow" in "iOS Settings" | Platform-correct wording (`5c2e849`) |
| Receipt OCR | iOS only | ML Kit on Android (`d17493c`) |

## 3. Degraded on Android — works, but worse

| Feature | Why | Impact |
|---|---|---|
| Employer mileage rate, other annual income, PAYE paid (`settings/work-tax.tsx`) | `Alert.prompt` is iOS-only; Android falls back to **preset buttons** (40p flat, 55p/25p) | An Android user cannot type an arbitrary rate such as 42p in the app. Existing fallback, pre-dating this port; the code points them at the web dashboard |
| Weekly miles goal (`DrivingGoals`) | Same reason; Android uses a confirm flow | Coarser goal setting |
| Account deletion | Already handled — Android uses an inline `AppModal` for the password | None |

The work-tax presets are the weakest spot: those values feed tax
calculations, so "close enough" is not really close enough. Worth converting
to the same input-modal pattern now used for the hourly rate.

## 4. iOS-only, no Android equivalent built

| Feature | Android status |
|---|---|
| **Live Activities / Dynamic Island** (`lib/liveActivity`, 10 guarded call sites) | Nothing. Android's closest equivalent is an ongoing foreground-service notification, which RNBG already shows while tracking — so the *tracking* is visible, but the live trip/shift card is not |
| **Siri Shortcuts** (`lib/siri`, `with-siri-shortcuts`) | Nothing. Equivalent would be Google Assistant App Actions or a quick-settings tile. Help topic is now hidden on Android |
| **CarPlay** | Nothing. Android Auto is a separate build |
| **`modules/car-audio`** — detects car bluetooth/audio connect to infer driving | Nothing. Android could use bluetooth device connection, but RNBG's activity recognition already covers much of this signal |
| **`modules/visit-monitor`** — iOS Visits API for arrival/departure | Nothing needed: RNBG provides equivalent geofence and activity detection on Android |
| **Home screen widgets** (`MileClearWidgets` app extension) | Nothing. Android widgets are a separate implementation |
| **Apple Sign-In** | Correctly hidden on Android. But see below |

## 5. Blocked on credentials, not code

| Feature | Blocker |
|---|---|
| Push notifications | No `google-services.json` — FCM project needed |
| Maps rendering | No Android Maps SDK key — maps render blank |
| Google Sign-In | Needs an Android OAuth client + SHA-1. **This matters more on Android than iOS**: Apple Sign-In is correctly hidden there, so without Google, Android users have email and password only |
| Google Play Billing | Code complete both ends; needs Play Console products + service account |
| Background capture | RNBG works in debug builds; a release build needs the paid licence |

## 6. Cosmetic only

`Button` glow shadows are iOS-only (`shadowColor` has no Android effect;
Android needs `elevation`), several `KeyboardAvoidingView behavior` branches,
`DateTimePicker` inline vs dialog presentation, and assorted padding offsets.

Deliberately not addressed: UI 2.0 will rewrite this surface, and doing it
now means doing it twice.

## Honest summary

Functionally, Android is close. The core product — capture, classification,
tax, money, sync, exports — is shared code with no platform branches, and the
three real gaps found in the audit are now fixed or documented.

What Android genuinely lacks is the **iOS-flavoured surface**: Live
Activities, Siri, CarPlay, widgets. None of those are core to the value
proposition; all of them are things iOS users notice and Android users have
never had.

The honest risk is not the feature list. It is that **none of this has run on
an Android device**, and the one thing that matters most — background capture
surviving OEM battery killers — cannot be assessed from code at all.
