import ActivityKit
import AppIntents
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Colors

private let amberColor = Color(red: 0.961, green: 0.651, blue: 0.137)   // #F5A623
private let emeraldColor = Color(red: 0.063, green: 0.725, blue: 0.506) // #10B981
private let bgColor = Color(red: 0.012, green: 0.027, blue: 0.071)      // #030712
private let cardBg = Color(red: 0.039, green: 0.067, blue: 0.125)       // #0A1120
private let textMuted = Color(red: 0.518, green: 0.580, blue: 0.655)    // #8494A7
private let textDim = Color(red: 0.290, green: 0.333, blue: 0.408)      // #4A5568

private func modeAccent(_ isBusiness: Bool) -> Color {
    isBusiness ? amberColor : emeraldColor
}

// MARK: - Live Activity Widget

@available(iOS 16.2, *)
struct MileClearLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MileClearAttributes.self) { context in
            FamilyAwareView(
                state: context.state,
                attrs: context.attributes
            )
            .activityBackgroundTint(bgColor)
            // Tapping the lock-screen Live Activity routes back into the app.
            // For auto-detected trips ("trip"), open the active-recording
            // screen with live distance / duration / route + an end button.
            // For shifts, open the dashboard where the user manages the shift.
            .widgetURL(URL(string: context.attributes.activityType == "shift"
                ? "mileclear://dashboard"
                : "mileclear://active-recording"))
        } dynamicIsland: { context in
            let accent = modeAccent(context.attributes.isBusinessMode)
            let isEnded = context.state.phase == "ended"
            let isSaving = context.state.phase == "saving"
            let isShift = context.attributes.activityType == "shift"
            let speedMph = context.state.speedMph
            let isStopped = !isEnded && !isSaving && speedMph < 1

            return DynamicIsland {
                // --- Expanded: leading (speed / state) ---
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 3) {
                        if isSaving {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(accent)
                            Text("SAVING")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(textMuted)
                                .kerning(1.2)
                        } else if isEnded {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(accent)
                            Text("DONE")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(textMuted)
                                .kerning(1.2)
                        } else if isStopped {
                            Text("—")
                                .font(.system(size: 26, weight: .bold, design: .rounded))
                                .foregroundColor(accent.opacity(0.6))
                            Text("STOPPED")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(textMuted)
                                .kerning(1.2)
                        } else {
                            Text(String(format: "%.0f", speedMph))
                                .font(.system(size: 26, weight: .bold, design: .rounded))
                                .foregroundColor(accent)
                            Text("MPH")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(textMuted)
                                .kerning(1.2)
                        }
                    }
                }

                // --- Expanded: center (brand wordmark) ---
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        HStack(spacing: 0) {
                            Text("Mile")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.white.opacity(0.75))
                            Text("Clear")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(accent)
                        }
                        Text(isShift ? "SHIFT" : "TRIP")
                            .font(.system(size: 7, weight: .bold))
                            .foregroundColor(textDim)
                            .kerning(1.4)
                    }
                    .padding(.top, 2)
                }

                // --- Expanded: trailing (distance) ---
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(String(format: "%.1f", context.state.distanceMiles))
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("MILES")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(textMuted)
                            .kerning(1.2)
                    }
                }

                // --- Expanded: bottom (two-line layout + action buttons) ---
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        // Row 1: timer / status + vehicle or trip count
                        HStack(spacing: 10) {
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(accent)
                                    .frame(width: 5, height: 5)
                                if isSaving {
                                    Text("Saving trip...")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(textMuted)
                                } else if isEnded, let endDate = context.state.endDate {
                                    Text(dynamicIslandDurationString(
                                        start: context.state.startDate,
                                        end: endDate
                                    ))
                                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                        .foregroundColor(.white)
                                } else {
                                    Text(context.state.startDate, style: .timer)
                                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                        .foregroundColor(.white)
                                }
                            }

                            Spacer()

                            if isShift && context.state.tripCount > 0 {
                                HStack(spacing: 4) {
                                    Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                                        .font(.system(size: 11))
                                        .foregroundColor(textDim)
                                    Text("\(context.state.tripCount) trips")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundColor(.white)
                                }
                            } else if !context.attributes.vehicleName.isEmpty {
                                Text(context.attributes.vehicleName)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(textDim)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                        }

                        // Row 2: action buttons (active state only). iOS 17.2+
                        // uses LiveActivityIntent so the tap runs instantly in
                        // the widget extension process. Older iOS falls back to
                        // deep-link URLs that open the main app.
                        if !isEnded && !isSaving {
                            if #available(iOS 17.2, *) {
                                HStack(spacing: 8) {
                                    Button(intent: EndTripIntent()) {
                                        dynamicIslandButtonLabel(
                                            icon: "flag.checkered",
                                            text: isShift ? "End Shift" : "End Trip",
                                            foreground: accent,
                                            background: accent.opacity(0.2)
                                        )
                                    }
                                    .buttonStyle(.plain)

                                    Button(intent: CancelTripIntent()) {
                                        dynamicIslandButtonLabel(
                                            icon: "xmark",
                                            text: "Not Driving",
                                            foreground: textMuted,
                                            background: Color.white.opacity(0.08)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            } else {
                                HStack(spacing: 8) {
                                    Link(destination: URL(string: "mileclear://end-trip")!) {
                                        dynamicIslandButtonLabel(
                                            icon: "flag.checkered",
                                            text: isShift ? "End Shift" : "End Trip",
                                            foreground: accent,
                                            background: accent.opacity(0.2)
                                        )
                                    }
                                    Link(destination: URL(string: "mileclear://cancel-trip")!) {
                                        dynamicIslandButtonLabel(
                                            icon: "xmark",
                                            text: "Not Driving",
                                            foreground: textMuted,
                                            background: Color.white.opacity(0.08)
                                        )
                                    }
                                }
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                // --- Compact pill: leading (branded speedometer badge) ---
                if isSaving {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(accent)
                } else if isEnded {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(accent)
                } else {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.22))
                            .frame(width: 20, height: 20)
                        Image(systemName: "speedometer")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(accent)
                    }
                }
            } compactTrailing: {
                // --- Compact pill: trailing (miles, not timer) ---
                if isSaving {
                    Text("...")
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.6))
                } else {
                    HStack(spacing: 2) {
                        Text(String(format: "%.1f", context.state.distanceMiles))
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(isEnded ? accent : .white)
                        Text("mi")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(textMuted)
                    }
                }
            } minimal: {
                // --- Minimal (shared Dynamic Island) ---
                if isSaving {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(accent)
                } else if isEnded {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(accent)
                } else {
                    Image(systemName: "speedometer")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(accent)
                }
            }
        }
        // CarPlay (iOS 26) and watchOS present a Live Activity in the "small"
        // family. Without this, CarPlay builds a card from the compact
        // Dynamic Island views and, on Akbar's dashboard (3 Sep 2026), drew
        // each update over the last: "2.5 mi" and "2:3" on top of each other,
        // the speedometer badge doubled. With it, SmallFamilyView owns the
        // card: logo, distance, state.
        .supplementalActivityFamilies([.small])
    }
}

// MARK: - Family switch

/// Picks the layout for the presentation the system asked for. `.small` is
/// the CarPlay dashboard card (and a watch); everything else is the lock
/// screen / banner, which LockScreenView has always drawn.
private struct FamilyAwareView: View {
    let state: MileClearAttributes.ContentState
    let attrs: MileClearAttributes

    @Environment(\.activityFamily) private var family

    var body: some View {
        switch family {
        case .small:
            SmallFamilyView(state: state, attrs: attrs)
        default:
            LockScreenView(state: state, attrs: attrs)
        }
    }
}

// MARK: - Small family (CarPlay dashboard)

/// One line, glanceable from the driver's seat: the MileClear mark, the
/// live distance, and the state. Anthony, 3 Sep 2026: "show the MileClear
/// logo instead of 'MileClear'". The wordmark is the logo image below; no
/// text brand. Static layout, no transitions: CarPlay renders snapshots.
private struct SmallFamilyView: View {
    let state: MileClearAttributes.ContentState
    let attrs: MileClearAttributes

    private var accent: Color { modeAccent(attrs.isBusinessMode) }
    private var isShift: Bool { attrs.activityType == "shift" }
    private var isSaving: Bool { state.phase == "saving" }
    private var isEnded: Bool {
        state.phase == "ended" || state.phase == "classified_business" || state.phase == "classified_personal"
    }

    var body: some View {
        HStack(spacing: 10) {
            MileClearLogo(size: 30)

            VStack(alignment: .leading, spacing: 2) {
                if isSaving {
                    Text("Saving...")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.white.opacity(0.8))
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(String(format: "%.1f", state.distanceMiles))
                            .font(.system(size: 20, weight: .bold, design: .rounded))
                            .foregroundColor(isEnded ? accent : .white)
                        Text("mi")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(textMuted)
                    }
                }
                Text(subtitle)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(accent.opacity(0.9))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if isSaving {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(accent)
            } else if isEnded {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(accent)
            } else {
                Image(systemName: isShift ? "briefcase.fill" : "car.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(accent)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var subtitle: String {
        if isSaving { return "Saving trip" }
        if isEnded { return isShift ? "Shift complete" : "Trip complete" }
        if isShift { return "Shift recording" }
        if !attrs.tripContextLabel.isEmpty { return attrs.tripContextLabel }
        return "Recording"
    }
}

/// The app mark, embedded as PNG so the widget target needs no asset
/// catalogue of its own (the Expo plugin copies Swift files only).
private struct MileClearLogo: View {
    let size: CGFloat

    var body: some View {
        if let data = Data(base64Encoded: mileClearLogoBase64), let image = UIImage(data: data) {
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .aspectRatio(contentMode: .fit)
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        } else {
            Image(systemName: "speedometer")
                .font(.system(size: size * 0.6, weight: .bold))
                .foregroundColor(amberColor)
                .frame(width: size, height: size)
        }
    }
}

// MARK: - Dynamic Island button label helper

/// Compact button label for the Dynamic Island expanded bottom region.
/// The expanded bottom has less vertical room than the lock screen, so these
/// buttons use smaller padding and font sizes than `LockScreenView.endTripLabel`.
@available(iOS 16.2, *)
@ViewBuilder
private func dynamicIslandButtonLabel(
    icon: String,
    text: String,
    foreground: Color,
    background: Color
) -> some View {
    HStack(spacing: 4) {
        Image(systemName: icon)
            .font(.system(size: 10, weight: .semibold))
        Text(text)
            .font(.system(size: 11, weight: .semibold))
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 6)
    .background(background)
    .foregroundColor(foreground)
    .cornerRadius(6)
}

// MARK: - Duration formatting helper

/// Format a frozen duration as MM:SS or HH:MM:SS for the Dynamic Island.
private func dynamicIslandDurationString(start: Date, end: Date) -> String {
    let secs = max(0, Int(end.timeIntervalSince(start)))
    let h = secs / 3600
    let m = (secs % 3600) / 60
    let s = secs % 60
    if h > 0 {
        return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%d:%02d", m, s)
}

// MARK: - Lock Screen Banner (phase-aware)

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let state: MileClearAttributes.ContentState
    let attrs: MileClearAttributes

    private var accent: Color { modeAccent(attrs.isBusinessMode) }
    private var isShift: Bool { attrs.activityType == "shift" }

    var body: some View {
        VStack(spacing: 0) {
            // Accent bar
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [accent.opacity(0.8), accent.opacity(0.2), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(height: 2)

            VStack(spacing: 14) {
                header
                stats
                if shouldShowContextBand {
                    contextBand
                }
                if !attrs.vehicleName.isEmpty && state.phase != "saving" {
                    vehicleRow
                }
                actionRow
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 14)
        }
    }

    // MARK: - Context band (richness)

    private var shouldShowContextBand: Bool {
        if state.phase == "saving" { return false }
        // Only show when we have something useful to say — daily total
        // > current trip distance (otherwise it's just the same number)
        // OR a milestone proximity message OR shift earnings.
        let hasMeaningfulDailyTotal = state.dailyTotalMiles > state.distanceMiles + 0.1
        let hasMilestone = state.milestoneText != nil && !(state.milestoneText ?? "").isEmpty
        let hasEarnings = (state.earningsTodayPence ?? 0) > 0 && isShift
        return hasMeaningfulDailyTotal || hasMilestone || hasEarnings
    }

    @ViewBuilder
    private var contextBand: some View {
        HStack(spacing: 14) {
            if state.dailyTotalMiles > state.distanceMiles + 0.1 {
                contextItem(
                    icon: "calendar",
                    label: "TODAY",
                    value: String(format: "%.1f mi", state.dailyTotalMiles)
                )
            }
            if let milestone = state.milestoneText, !milestone.isEmpty {
                contextItem(
                    icon: "flag.checkered",
                    label: "NEXT",
                    value: milestone
                )
            }
            if isShift, let pence = state.earningsTodayPence, pence > 0 {
                contextItem(
                    icon: "sterlingsign.circle",
                    label: "EARNED",
                    value: String(format: "£%.2f", Double(pence) / 100.0)
                )
            }
        }
    }

    @ViewBuilder
    private func contextItem(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(accent.opacity(0.85))
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(textDim)
                    .kerning(1.0)
                Text(value)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Header

    @ViewBuilder
    private var header: some View {
        HStack(spacing: 6) {
            // State indicator
            if state.phase == "ended" {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(accent)
                    .font(.system(size: 14))
            } else {
                Circle()
                    .fill(accent)
                    .frame(width: 6, height: 6)
                Image(systemName: isShift ? "briefcase.fill" : "car.fill")
                    .foregroundColor(accent)
                    .font(.system(size: 12))
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(headerTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                if !attrs.tripContextLabel.isEmpty && state.phase != "saving" {
                    Text(attrs.tripContextLabel)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(accent.opacity(0.85))
                }
            }

            Spacer()

            // Branded wordmark
            HStack(spacing: 0) {
                Text("Mile")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
                Text("Clear")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(accent.opacity(0.7))
            }
        }
    }

    private var headerTitle: String {
        switch state.phase {
        case "saving":
            return "Saving trip..."
        case "ended", "classified_business", "classified_personal":
            return isShift ? "Shift Complete" : "Trip Complete"
        case "too_short", "too_short_add":
            return "Too short to log"
        case "no_signal":
            return isShift ? "Shift Active - no GPS" : "Trip Active - no GPS"
        default:
            return isShift ? "Shift Active" : "Trip Active"
        }
    }

    // MARK: - Stats

    @ViewBuilder
    private var stats: some View {
        HStack(spacing: 0) {
            // Timer - live counting for active, frozen for ended, indeterminate for saving
            VStack(spacing: 4) {
                if state.phase == "ended", let endDate = state.endDate {
                    Text(durationString(start: state.startDate, end: endDate))
                        .font(.system(size: 26, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                } else if state.phase == "saving" {
                    Text("...")
                        .font(.system(size: 26, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.6))
                } else {
                    Text(state.startDate, style: .timer)
                        .font(.system(size: 26, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                }
                Text("DURATION")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(textMuted)
                    .kerning(1.2)
            }
            .frame(maxWidth: .infinity)

            divider

            // Distance - always shown
            VStack(spacing: 4) {
                Text(String(format: "%.1f", state.distanceMiles))
                    .font(.system(size: 26, weight: .semibold, design: .rounded))
                    .foregroundColor(accent)
                Text("MILES")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(textMuted)
                    .kerning(1.2)
            }
            .frame(maxWidth: .infinity)

            divider

            // Speed or trip count - hidden in ended state (0 is not meaningful)
            VStack(spacing: 4) {
                if state.phase == "ended" {
                    // For business trips with a known HMRC deduction, surface
                    // the £ value the user just earned back. For everything
                    // else, fall back to the SAVED confirmation.
                    if let pence = state.hmrcDeductionPence, pence > 0 {
                        Text(String(format: "£%.2f", Double(pence) / 100.0))
                            .font(.system(size: 22, weight: .semibold, design: .rounded))
                            .foregroundColor(accent)
                        Text("HMRC")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(textMuted)
                            .kerning(1.2)
                    } else {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(accent)
                        Text("SAVED")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(textMuted)
                            .kerning(1.2)
                    }
                } else if isShift {
                    Text("\(state.tripCount)")
                        .font(.system(size: 26, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                    Text("TRIPS")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(textMuted)
                        .kerning(1.2)
                } else {
                    Text(String(format: "%.0f", state.speedMph))
                        .font(.system(size: 26, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                    Text("MPH")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(textMuted)
                        .kerning(1.2)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Vehicle row

    @ViewBuilder
    private var vehicleRow: some View {
        HStack(spacing: 4) {
            Image(systemName: "car.side")
                .font(.system(size: 9))
                .foregroundColor(textDim)
            Text(attrs.vehicleName)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(textDim)
        }
    }

    // MARK: - Action row (phase-dependent)

    @ViewBuilder
    private var actionRow: some View {
        switch state.phase {
        case "classified_business", "classified_personal":
            // The tap registered; the app applies it and ends the activity.
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 11))
                    .foregroundColor(accent)
                Text(state.phase == "classified_business" ? "Saved as business" : "Saved as personal")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.04))
            .cornerRadius(8)

        case "too_short":
            // The hop was below the auto-record floor. Say so, and offer the
            // alternative in one tap rather than leaving a silent gap.
            if #available(iOS 17.2, *) {
                Button(intent: AddShortTripIntent()) {
                    HStack(spacing: 5) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 11))
                        Text("Add it anyway")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(accent.opacity(0.18))
                    .foregroundColor(accent)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
            } else {
                Link(destination: URL(string: "mileclear://add-trip")!) {
                    HStack(spacing: 5) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 11))
                        Text("Add it anyway")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(accent.opacity(0.18))
                    .foregroundColor(accent)
                    .cornerRadius(8)
                }
            }

        case "too_short_add":
            HStack(spacing: 6) {
                Image(systemName: "arrow.up.forward.app.fill")
                    .font(.system(size: 11))
                    .foregroundColor(accent)
                Text("Open MileClear to finish adding it")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.04))
            .cornerRadius(8)

        case "no_signal":
            // A recording is open but no GPS is arriving. Said here because
            // this is the only moment the driver can still do something about
            // it - a push hours later is too late for those miles.
            Link(destination: URL(string: "mileclear://diagnostics")!) {
                HStack(spacing: 5) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 11))
                    Text("Not receiving GPS - tap to check")
                        .font(.system(size: 12, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color.orange.opacity(0.18))
                .foregroundColor(.orange)
                .cornerRadius(8)
            }

        case "saving":
            // No buttons while saving - the main app is working, any tap
            // would be ambiguous. A subtle progress hint instead.
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 11))
                    .foregroundColor(textMuted)
                Text("Finalizing in the app...")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.04))
            .cornerRadius(8)

        case "ended":
            // Classify CTA if needed, otherwise "View trip"
            if state.needsClassification {
                // Classify at the kerb. Two taps-worth of decision, taken while
                // the driver still remembers where they have been, without
                // opening the app: LiveActivityIntent runs in the widget
                // process. Pre-17.2 devices keep the old link into the app.
                if #available(iOS 17.2, *) {
                    HStack(spacing: 8) {
                        Button(intent: ClassifyBusinessIntent()) {
                            HStack(spacing: 5) {
                                Image(systemName: "briefcase.fill")
                                    .font(.system(size: 11))
                                Text("Business")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(accent.opacity(0.18))
                            .foregroundColor(accent)
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)

                        Button(intent: ClassifyPersonalIntent()) {
                            HStack(spacing: 5) {
                                Image(systemName: "house.fill")
                                    .font(.system(size: 11))
                                Text("Personal")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.08))
                            .foregroundColor(.white.opacity(0.85))
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    Link(destination: URL(string: "mileclear://classify-trip")!) {
                        HStack(spacing: 5) {
                            Image(systemName: "tag.fill")
                                .font(.system(size: 11))
                            Text("Classify Trip")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(accent.opacity(0.18))
                        .foregroundColor(accent)
                        .cornerRadius(8)
                    }
                }
            } else {
                Link(destination: URL(string: "mileclear://trips")!) {
                    HStack(spacing: 5) {
                        Image(systemName: "list.bullet")
                            .font(.system(size: 11))
                        Text("View Trip")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.08))
                    .foregroundColor(.white.opacity(0.85))
                    .cornerRadius(8)
                }
            }

        default: // "active"
            // End / Cancel buttons. Use LiveActivityIntent on iOS 17.2+ for
            // instant widget-side LA updates (no app launch delay), fall back
            // to deep-link URLs on iOS 17.0 - 17.1 and iOS 16.x.
            HStack(spacing: 10) {
                if #available(iOS 17.2, *) {
                    Button(intent: EndTripIntent()) {
                        endTripLabel
                    }
                    .buttonStyle(.plain)
                    .tint(accent)

                    Button(intent: CancelTripIntent()) {
                        cancelTripLabel
                    }
                    .buttonStyle(.plain)
                    .tint(.white.opacity(0.6))
                } else {
                    Link(destination: URL(string: "mileclear://end-trip")!) {
                        endTripLabel
                    }
                    Link(destination: URL(string: "mileclear://cancel-trip")!) {
                        cancelTripLabel
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var endTripLabel: some View {
        HStack(spacing: 5) {
            Image(systemName: "flag.checkered")
                .font(.system(size: 11))
            Text(isShift ? "End Shift" : "End Trip")
                .font(.system(size: 12, weight: .semibold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(accent.opacity(0.15))
        .foregroundColor(accent)
        .cornerRadius(8)
    }

    @ViewBuilder
    private var cancelTripLabel: some View {
        HStack(spacing: 5) {
            Image(systemName: "xmark")
                .font(.system(size: 11))
            Text("Not Driving")
                .font(.system(size: 12, weight: .semibold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.06))
        .foregroundColor(textMuted)
        .cornerRadius(8)
    }

    private var divider: some View {
        Rectangle()
            .fill(accent.opacity(0.15))
            .frame(width: 1, height: 36)
    }

    /// Format a frozen duration as MM:SS or HH:MM:SS.
    private func durationString(start: Date, end: Date) -> String {
        let secs = max(0, Int(end.timeIntervalSince(start)))
        let h = secs / 3600
        let m = (secs % 3600) / 60
        let s = secs % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }
}


// MARK: - Embedded logo (assets/branding/logo-120x120.png, base64)

// 120x120 PNG. Regenerate: python3 -c "import base64;print(base64.b64encode(open('assets/branding/logo-120x120.png','rb').read()).decode())"
private let mileClearLogoBase64: String = [
    "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAAAXNSR0IArs4c6QAAAHhlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEo",
    "AAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAAEsAAAAAQAAASwAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAHigAwAEAAAAAQAAAHgAAAAAXY4R8gAA",
    "AAlwSFlzAAAuIwAALiMBeKU/dgAAApxpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1w",
    "dGs9IlhNUCBDb3JlIDYuMC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4K",
    "ICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8i",
    "CiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPHRpZmY6WFJlc29sdXRpb24+MzAwPC90",
    "aWZmOlhSZXNvbHV0aW9uPgogICAgICAgICA8dGlmZjpZUmVzb2x1dGlvbj4zMDA8L3RpZmY6WVJlc29sdXRpb24+CiAgICAgICAgIDx0aWZmOlJlc29sdXRp",
    "b25Vbml0PjI8L3RpZmY6UmVzb2x1dGlvblVuaXQ+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj4xMjA8L2V4aWY6UGl4ZWxZRGltZW5zaW9uPgog",
    "ICAgICAgICA8ZXhpZjpQaXhlbFhEaW1lbnNpb24+MTIwPC9leGlmOlBpeGVsWERpbWVuc2lvbj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlm",
    "OkNvbG9yU3BhY2U+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgrSYOxcAABAAElEQVR4Aa29+ZNlx3Xfefd7",
    "33v1aunqrl7RK7YGF4AgAe47LVqkRnJIluWJmBj/4vlh5m+ZifAPEzERExN2TDisH2ZsT1hjyaIkW7JGFEUSlAiA2AE2Gr1WV9f+trvP55t5361XWxMElWjc",
    "yps3l3NOnjzn5Mnluf2Vp5yjglsfleo4ruvyoa6P+TxTyNbgu2WbVjoqa0PteNPogb8H022LbaaDTVf1TAaie01QBCjb/E0kyEh3K7VCVk94eIBqC7qVLa5n",
    "ZSAs/Jz44WDzt5UfzkDKLDDBkTn+HhMrd4ZwBo26IcVMOkgJq/Z5oP2mwDR1fx9TDnRdR/3q+W182gqFmvy2C/RSezY/cSCC1spsGqldYCAY+juwyIGmzceP",
    "9PilCf3oPpyFwaJaO2GbWLv8N8W7TRU2nnClS/juWVRnPzfYNk0fhbtKu9ReUMy2W7Xt7M8vPjV93/Rz7ZSGuOI+l9HR9IqthC4BoBlQPnr0CEI3DP8hhMOH",
    "abYZi1MmsQhM0YHGU3aDLobZmvdp1e3oe0QHN1Q2RWz9es5U1FZisriQD5pCcc+BsqQZUgoSOF2Cbq+r3co/ROj9tZkqP8TjIKHbWtrIgUqOQ/i4/N60wwxj",
    "WewN8ZtBakfpHmq1uzcC9jc9Q7mZD7Xr8zYd8vpgh/0+Ss9IAEM4aA049l9TV2XgkQzaX1vzefrnODSn34/9u4/QH62WR5eyQlCjUqjboSk+cqd8Y1ke6tic",
    "Rw5VelclDgWabvpxhu+afM2HyqUn6pmOFIH1bfoEKpXwjHq0bGT1iqE5X/bKHmr/l0jYI/Sj6bVXpWcQEd0UfmEpwC1NCR4qY5AS0xndZKlMMqgT5xkwpg+F",
    "w8Ooabeuy4agB8sEjflB51LhXp1IZAOOAcTYG1ZkN6LdoOU3yKlO1+I7rb6F5BciPi3RVPwRJb1tpm2sjbS1z0SEp8XNIuxNMTep0Fz/SjewT0uSD/+caWhf",
    "1NRQmSbscwqEFGbFCDPPgohb808Mbv6pA2b/7av0V3hpOPqRlDqieg0rWGba8/Sz7WrqaauyKZG4VYFaDNciA+AyDAyrgwz+2FsSK8iBuvR94qVMMH1C5PBE",
    "eTm+ipDOV1KUH4vApMzCZxuyKb7rqaytzfS2D3CwFsWoAfKCBVFy8EZ38NGMA7dubH9S6ApbG3Eq5ylETJhtt43bDPZV9U/DnuiYpnzEv7MQzDZWFoV95Qm1",
    "qF0YwtTqJw8SIhxrDwSFLkiV1aSEhB64QhKkueK1eqKoyO9WNl3PurQpqgcOtU/VKCMRyUydGrBQZ0oXsTmNqV49S9u3ElaVTwfzkQx8NE8eArkWzATqsJGP",
    "9vyVCG17bGqh7QHQwgSgnh/zQUwsdhCsAVSFU4SeZwQyVhZ4GP5ynAjOtSS2eIl5RR/lENms0BQvK0nDQN3TpvNCP9JpeZlDUwjOmABOUvR03LwOIaTrBZQU",
    "IKZOYKsMF5NHQ0UERzbDDbCFWiKj2vgQwdLkcMZjCd0S62CZY5q0+Q8DZNnDENrQuhnsleeJScVtcJDIZmZrVK7OQMMJPQJ5zF8zlt1S9RuKiP7ksSNDUzho",
    "UxgkVRsSBikh8qgaoiI+DTLzDkxb4lreDKubskgsy9Gm+6dUNaNM7VPnLGqzcX2eCQ3cMyk2eiyhD+U8NsH2IT1vm2+BECEcZ1LXAWztMz2Q9IXOIA8iksYg",
    "CytZphL7kOyVDaRUY9C1D0hVqcsgXguHMoru4veG201ZyVrHl2UtgaMkqGTIT69Wc4yfKhevqmsZRgqVA/2lDMTNdIJscwpqkuqZXmwb/ciRYwktaI8KBpej",
    "PhyVBvTd0LBkVdZFWZUF49HOas3T8DLsa5qyRPEC1KcJpiWb2NZtB7J9tRA2ikuCXrWQiEAnQk6ITM3KRlUNNl5YIevpNvoHCUH/+xVPCS7zNFU3pWwz5nmA",
    "GlR9IGUm79HRYwl9dPbjU13JVovevr7wJ/fgIcm7suBz4JRkDHlHnWF4GP3I571uHe/FbWL7hHDIdMOjyoM64+kbAU4i4gPiWeLyNP6lJrNYla/AVTspSrJG",
    "mqB/A8cP6ipya79CpARxocrISlFpUnGz6TkV/pXD3xuhEYEa3dNAh9uwshh2k85cP1no9nqdOAk9/kHoOAJLl//5GwSIFZ8aKJIEEsTESeFDm07lhLIseYK1",
    "zcAzpL8Y9eZTAbmVA5rWkyw3ibVSahUsC2XbdOMiL8dZPk7L0bjYHWeDYTbOyvXtka/ZD0KDWTo8DYNb6orcBKCiWhv/CE8mULZwUwvV2VqmZu7BOuNqDCXS",
    "CF4IozIpssKNGat5nW4uu9vzg9GlBefqeefMinPhqrt8cv5MvBgnXtzL/XC7dMOy7lTOkut2PAxjyWjGtZ+5ncILsrBGrHilQczqUNM43MVfaAVZGehAiKhV",
    "ipGeKAAqkfjhC1ZaWYZ16tY5/yovM7YZbowyrJy4rMg3DpDXmeMNJVCwQNJ6kqZ5WgwGxd213ffvZW/ddX6+5jwYOtuY0OHipnvRj908zvM8DSpckUFVF0EQ",
    "5TCV42S+vE5JFlN/6aeOgzF7NO+686efNOg0eqMltFEL5sv+h1+O6jAcOXXgJ96w7tCOP6gmDxajydPne9954er1y8tzPTfpxbVfpmnaCefKMiudCYw2qfxJ",
    "FgzH/jitdne3ER8lVlhWT3Jvwlcnh+fSSaFJijgUZswhYI3McZxupwPT+74LmwfYymJ/Ccq8SKX0PA0ITMMEsHw38upOErr0SuSHESkhhRMXf5U3iSPPKXwv",
    "p5LQDaMgCF1JM1os6qAOusPCf7g7eePG/b/60dtvv7310D+TOXXe6Y3yst/pVmlZZCWExkIsMfa9AkaNilgmi5tXWK3HE/ppS0k7LvYI3aQ2A6eltu8xoyjz",
    "KEQlzxfuYr3rjj745BXnH3/7yWevnYo9BqifBSeGZTKpeptb41dv3t/e3r2/tv1wc7Q9dIeZM8zKSQ5PjWE6p4DanhgO6wwGRJGFcxYSiIdlIpcQIt51y7xA",
    "dhKBb60ClBWnbzINYGBB6LoweMg/68SgLyChL0kVOm7kOoFTbxV5Enn9JJrvREu93sn+3ImluN91z51eXFmZn+t4/Y5fZFu+V1LPKz99+V/+yd137lTb8XIR",
    "LU+ycRx2wzzwvThFXnlF7TF6UMSBaR8JDx7HcnRD6JaU+yJGg8+mwEaTMk/me9Vwcznf7Y3Wf++7Z7/z1WtnFortzY1g7mzmn3z53Z0f/+zOG+89uHvv4cMq",
    "oe3SQb50aq9fOHHuoPhTBh/TQIShV+MXhb2QijlMmpXWTUq6dKjEi+aGcJxktyFzZSzvxtb2/RDxk3uYEggi+a+QIbhOYH3MyFKChb+ymOlP6eTAWBuIkYJu",
    "Tv06D/008OHxYqnvXT63eP3KyrNPnbmyMhdVO5FfrWWn/uC//O1/+Os7O+7JiRulY2+xswyf0LUlPO2iuxlwcB262erlYwjdrhkKB6lmK7LFO6LvIUJHdYeq",
    "R+P1U8HgUrX1P/z2Ey8+v9BJ8vW0LpKLP36n/H++97N3b2ylRZjXRdxJRm6fOpFggMIgg9tQ97WPcMjB39SvhvjG0IMsYj4LBkJQzAv4mtUQRGZBZfARI5vE",
    "NEE8lzLSyFTIwmFuwizeQ6J6rFIi8yGwRLgpGGQTMTqV6bWg05CyNESgFTcdR+VoISg+eeXkt7/y8euPXzgR7RTB/Pd+9O6//Hd/s1GerIOVeoLYiHKfdrBW",
    "U6ih7hSoxkqxJo6Bbfbhx72T9t3gsPdp+mpA2EtGXFWhWyyG44Xy4T//9Yvf+dJVx9sdOv6Ge+Zf/eGr/9u/f/X9ja4TnsvdXt3pjeEe/wQqRDDAmAhS6FQW",
    "VZ4LKLCUCUUTdK9my1CPr8ZMgwpGV4KASKx/StE/cYMxhJk2I457lDNdAYkNsWRRk1t9p3/WaMai4K2qkxBBJNOi8vza90svyN2wqKM66I1Sege2mHP9xXsP",
    "Rj/4yZt3HqZPXYgXFhevPXYiCZzXXv+gLKIw6tJzSGcQEBerF4WEbdTyxAzBmugvIvQUdosBzzhgqG/5w3u/+eWVf/Ktp6pqZ8ObW/Mv/M+//4P/+OO1UXI+",
    "6J2doN2CMEUF4xKto1LsDBIlTAC7+uhnt0Kq+SIfRIEwiDkIgoXIiIfgzT+UnaWxIZlAgZdMCp0m4YvcoGcQ00h4PkqWIy6Z5rkhcsKUogtIwhRx4PzYaAI8",
    "SlUV11VcYU87UVCBUxBWXseF8EUS8Ckpqg6M/P7q5IP3Xlk+tXx+vrhydmky8d/5+W3USxEiNXKqNlwMOxs2rkP0SjPgDlH6FxH6cAE3LYe3P33F+ee/88J8",
    "NBxV7mZ04V/8/v/3l69sVsljlTefZVVHaosBVfihBCVTb8wycDLcJUaAuAgTsbGYSyTSzKVGc7mFHCCQyAgx/hpOhoA2CJwaCYyNIA43T0N/msBhRyZYFfTF",
    "tXozjtJKXSvzWLK+IJ8TYeyhGDSiaILMGH5ZmuiTWi/rsPTCOuqkbrC7s3bzxo1nry4v96KrVx7/2ZtvrE3KzGWMCjgfhgF84zhAJWKLgYGAPBT8qLtMoiDc",
    "Hyy2pLcRm8evduecwf/429c+cbmDBVr2Lv4ff/LWf/rhHc8/7eRx7HodJtdVVpQjue1kOdV5PqaSMEQrMkgd/Dq5kzP/wlLD5AjCsMBEE86MZoCApUG4+UcV",
    "7WszRA1XG5aGsr4TBkztGS5VkcleRq1KMRk1qkFdIEJkLjJiGA1+UOSQBjPELxgEQUavSQcomHqBrUr9TpBiW4VZ7mWYazs7o8nG2vOfeGa+m/aXku//7GYR",
    "zOHBMvN3aqNB9opQQSQDEk1jiNnSzdJVovK4YAvYr23huNp85kry7OMnnHQziJbf+GDyV397e1IvlVXSCRMPR0I2Yb4XRLCRU2YYwRkM243CIs3ySco8sKxy",
    "ZITH0CvR+NBnSP9EsZ8zKw8wIaTlZp6QCDNOT/G5wvSv4XrcrTkmpToSbiqzDC+WmQzWdHBGp7tV4Tt5J4IuZZmOejEqZhK6oyQY+9Uw8bMO8tmn5TAv6xSb",
    "HwyK1ItQoWamGS2m4dJfv57+8LWbSVh8+vqZpy6dSEebiEH41wgysamlj4XvyKcf9ZaPzGTKqrfU1eafbAenXhyv/fY3L3/hqW7FvDW+/m//9J3vv/bAjZbQ",
    "+RpCdHTIuMPChBMxtjsIsF7ccfM8KMuESTXOBa/wqswDGayrIosx8stdJshBvDQpYWftJNojtFES0mOyV0mHM80/3jHpBBryCYuKSiA39IqZnciJUmva4lfM",
    "N2llUo2GbpGF6PJ6M/AnbrHtlYPAmbhZ5rIyUbNUiUTCmgiZ4RTIDmzxgulYwsyXwTepxnkx/PJz50O/3sk7r755q/TmXSdBMtJ/4AOZNJeWlSrrnmCp2tKW",
    "KfhBoWHztU87BOwr8bOJ89zVU9lowwm6d3acv3ntdtRZSuXm9YEPBFFTWTlEV2FblWm5EG3nW+OoTkPkArzlVnHP6fZQh3m/25nrMCkvVrd3xk733s564C4a",
    "p6nsB41IKEmwlhxzDzPztpDoafJked5LYiZkoOr5YYokkHVcxQ5dOK5Hq5fP9a8+dnYyHBRFFYbxlr9UlZPEzYfb60WWFqWzsbVdesmowkYKJyM/mVuQjoX0",
    "cDgdxxpFXkSL516+8f7t+zvnT3Q/88yVf/fHL91liiglA4hQFsEglSjDnTSjYwT4DG3tlGYP+PYzuZsesMiacQrmz55zzi100PFlr//Sz+/dHA5zNDY9CvP6",
    "yFwG39hzRgmqLRv2OuGJdPMzL/Q/+eST6e6w4/dXV1c/uHvv17/7qcfOLXulHA8PtzaH3oVd7/T/8r9//8FONolPzEAjMWJFhTF74Wherbgznxwndv0iTUn3",
    "oi5Q5bCtWzB780d3Fv3ia59P/tG3nr10dhEJVeITKKv1/he/9pUX04dvvfmTPx9tfJBnk0kR3t92PthOfvLu9vdfvZumgecJwdqLEeEoFmY/I7l5nZffuHPt",
    "Gy+cCcNrp3v3b2B1oAGw1CEtDNRAJRYxFJvBQtGD05jZTjA9o0JtIimPrzjzYSXb0++/cfvewIs01aJyuJDpOXLWLYIocrPtvj/8jW986csX755eWrx8erEc",
    "TSIfp9PCjdvetUt4BO7FcZU45ZmoGIbxOE4+eWXuB688GFdSzk1ooNebEVw01I6/xjmTJP5onDKMSrx1jtOLEr/YcUarZ7rFr72w8E+/dX0pHqS7dxg8gzwO",
    "g97XPnPJGbx3++XvdYY3zy2U6XgQ9U8ML50cdh7fSV/56Vv3MxwuzPqkmaWHyzxFNKUFXhfvnRv3C+yjfPepiys/eG+DmU6hRR+ogoFqxBXRKTtPcWj+IjrM",
    "ugfj9GBgLIJVY3XgshHbuvgEnNjHWxHmo/jWnZ2qSqKgU1aBXJFFJh+WF3h1XGXDpW71nRevPdUfeWVa777tl3WcLAdd94lrXd/fwr0fFmU+GM9158p8nNUb",
    "X3zxiZ++fh83tWl3Oo72QWU/mSSZV8ozws2DrzWMyzTHwRwzOx5vnE0m/+wffvxLz8ydTgbpcD3pLW7nSd69/Kmv/oZTrb71F38cFZvzSVmPhvNJb3swmUTZ",
    "/d2N1958Z3cElBEGhSbYsHKFgRehXQP0d+bskLMYddz60spi4KwBQoGji7knpjyw4DyQ2SQdcziIGVuGnf3cJhKZDRfPL6Dbk7AzHpSrq5saZZrHao0OXRVi",
    "RlQsjHqxn4Ql3ovNxBnWk41+kPXjvEwflvmG549dd1zku6iRHrZCWUZOFTr50088dvVSJEeFfBPmn/EhYDGbf9o7gOXW/FOi8mQMalxOorkXMc2bjJc78e/8",
    "+je/+NyTSwlOw/V+1xuNRl7c/9gL33D652/+8E/rfLOebDnFZC6Oy0wOQvoJ2bOxvo02xGEEV5pJNTY3bmDcR3XihnNxf3vgTCZj3H/nVk5iQEIW+JtZIkxt",
    "B5pZDZul4l4cGa1VCzOhtESXywCg/QILkVkGsq1wo05dTJJi40TPn1v2Ju7A8ZNh7gy3Ufu9CUOiKBNMY3S6U7ghFhxMlsYxJnPmpKOYoYclT2D661Q98Qqu",
    "3s4I53w3wnefp+l8te0O/+p/+mz20p1sPEmdqFcxG2BzdV74iCOs2yjHVVIXvbDCIB9R2SDAC+XFeQ+3aZHlibPTzW9f6Dn/7Cv+rz1/0/dTTJ2QyeAo6MVx",
    "4O1EwRvrf/b78cOb+EvLAKz8bbRrQKVpkT70y2BpIam2cJbKF4ebwAsS7EQZSnApc0svfjByBnnvdDlZmctW+oOdwZpfLzpux2yNhBRof3mzDksPukTENUER",
    "45k0dG4S1WnqLhuQCEAcyFBhnWMywV26Z8pQu22Ap+1eDA9yTms6+JeyqgePay6WQQR3u92rVy8/c/VkiEuMFZIsNRM8hJbWWViTARDJCyw0grhZ83C6o6rx",
    "nORJPenXzm998/LXv/oF8732A3ozxs1G6dFw+8Z//uPdrVUL0uzTQhYyoerQ642EJBFRyavakmtFazRF4eD/5zUI/SRhItkgSIqtxFZ7EFXz3hBa88lpUDHm",
    "B3ZVn6IEbVSRO2Ku1+1EjDL5u3awN9jBgiIwRt20dPMXXW1WvhFMgNN2pyCzooCCts9IiUJcFjRRn1ic/8YLp0/1BnUxMN446Viwhf+9Cl93YozpssLjiSDB",
    "oGLu5yMTR3NBmqQPf/eLp37tk6fDagJD4CSEvgM3yztOUabd0O0Gk6DYAj5aPPwUoRN4XfzIk2B1EhGLkihS4r6RC4Gcc70OvAsM9AL/2wrVMZqO2hL7nnsk",
    "gKH5AtVms5kW1bZCVczPJVHECgWyMtjZHVtQTBtNS+Qno2wE0VHbuGyw9bRAqyGmyeYriVASsVww/vPsC9f7H7/cDaoB7nnQMIyvftV0hR5DIGJOs7oHPtq+",
    "gUd7gpmRZHe/+/lLX3/2/BKrPtkOlVcOnor+Zh7v5NRS+TkzF/pOw8gAvIelTQEGxo0FzKCg/iDC0/So6W8UHsLErTtRyAIo6JOfPDACEYKtysYPPOkBELD/",
    "Zj7ZOQL1Uo+IjwOIEZrN9SLWUWXJ4gEYjHHfiN1MY7YN+2pSyhBfAL1rEJv2876GBCjVFgxH5HuFm4K+PNdZ//pz55b7DlqB/0Vr4cOIgthmdRoByvRLugV3",
    "Rc4Ebs4bffUTC//NF86d6rPKPl7oeVVeDMrFnfL8+Se/sbB8PfG6QVFnw7ITslypMIOqoqRAL+AhgALUJFG9BdLT3TwqBj54IhlOftXtdbTGZqZUbYXl9MDO",
    "FN+9dkQmAsNZG4Q1fElRR7WFbfcypWVhZK4Xk44LwHHjXSSHKWsz6GndFGYcQUF8D8ZJZDIdeoAMRbTIzSQRkuFdE0NVweD2Z66f+cTjK16+XRUj0oxvhBYF",
    "PBNAFD3WAL522DOui0764GOPxf/wcxeXk62FvhN3o+F4kPtxFp+99uw3F1/8B4vzZ1h7xSgKg2iSqqFZS1ZmGcEMWlCDsvQCgBEnEBGtp4GMDCMWZzFl57oR",
    "kVlawZSmrqMflqxwVkNxNWqakLeAeukBE2gUTu51NJPECkAlDyZYVvpGDjZC0NXEqUXCx4CP6AgNv5sK9Njfz+ArlGEc1uDoYVibqoNi52S3+urzl1fmsTcm",
    "CB/2YrCVTnaU5AceKURGxBQ5wVflFtdPlF/7+IkTyeaJRWT3qAghfzIMupP5c52Pf9a5c/vB7feYQ7H0UkcRWxmPpDLwSg+gKqaj01LZksKggzC2Y19QQO5u",
    "F4VhkoSZDQ1G09d9+Iq+4G+DtS+auOlY60KUpECE4UQJRWc6mBVY0dnoAV4tWERUm+VoeBN3h6F4U7v5NP3aCESEBuoFWmtUIuw8BrlXDTeef+rU1ZN+5GRa",
    "6ENQlBmTXOpBB2oBpvZw/XbctO8Ovv3p5Y+di1b6rGVPcC2NsIs7y7tl9/nPfxnX9Pt/930n3cKvmCFN5BeVFD4Q4AwCTSfy/8HBkh6kENGAM8EWARLekNGs",
    "oydx43oGbMI0w5SU9n3mKS0JmUyKnibWDBZLPvEoPKQh6/TnYq3P+X5e+6NJGUVS03iLGE9AgCOyYKELfyMrVZjHLCML2j0eIjPBtg5wxDEMxMwm0JGK8ign",
    "8+76b37tY/NeXk3GQp+c9LUXQGUENLm8PI2Lja8/f/mFJxYvLUUsjgQ1DlBa7W5O+k984kve+eXVH/2ndPvdxN8qq5FLR2hRWIcGLQyCTEazJJgFknT7iTw2",
    "BfnGQgRx0CEbXYIiMWq46HawzekX1mcBSFNWgpWBFkH7JFHsJtT2iawmD1aq1KBoor7lLxMNWogRH4AlnvJxiQOj5vhGIagzpkG1k5+h0vT09MPMX0PbIx7I",
    "vyR243Lj6fOdj7N/wWE+JPmcZdgkmsWhC7s+G0FWP3Fp/nMfXznRc/tRNR+Fbo494LFLpL9wdvmTn3Juv7l769W43sUwzPGLI3qYRjFcjMy1pLHgiEI0IGOR",
    "xx6IJl0kIADoDC7y0jEHBkvSbQaeIsXxQZ3S0kgENZlp40AR0GPUsY8LipMLjFMEBw0ZpUwpekXQEBhY2MrkN6KDZP0TsZp/BidZO0bC0ZHqyzbAdKz8+9nO",
    "hcXg85881/NHHqsxED+O4X02veB6CNK1C4vZZ55ePD8/8sIgSXBP5F1Ws7BMyvrxy5c033ntr7zNGxE7h+AQFj6Y7rFEyIIKYBunzQyOyoFosilgbsln4BZc",
    "s9SUBjIeAVw84Mk3i6U6YhpaXGYj+7x3piV5GpSDDmA7CqTDciWBGuFoTDYzAtgPKM+vpArpUKplZzMCoDbpCJM9uTTb6KPiuKRwE0duleU7H7u2fPlM9Nbt",
    "1I3mS6b4+LKrOnazOWfzG5+5+OmnT3bqdc8vh6PNpMNqH4a4G0e9B7ffDO+/nd17dTliLoery/djHNboDN/NM/gaMWshAF/byYoArWEyIG/A3sdtZGw1DohX",
    "cczWCSNzoDc56QATDpgepjZxbaAlZJphNNDMDB+rlOkxcaTpVZg5YjIsgSOjFuVi6jZjymZuCEiP4KpjNxaqZ28w0qQ1YUCEjA2OpsUGQxMP8D3iZgriNBuu",
    "zM19/hPnf37nDntGMvShW+F+6uQbz10Jv/b8mTPzeZQX3R7i08GpxkJD5SI4y/U7rzLZifLtgP1hLL9XVeqEWLiRttmgMO0GHcGucWiCgUcQCQ+DFtA2lpiB",
    "qnk1fENz/ENYa0IB0cgoxChusjZEOPjH9ujB1PbdEoXeFn2ZLzCnMFIJbxnrr6TbnLQnqM0nnhp01kY2bNJ+aqt9VARRawYKBk5QbH/qmbNLfVb/tpGJkvvp",
    "1olg/M0XHr/IzGP0cJ51lHzIIEhZf+mdKLxeXvk93Nz+pBP7g/EIsY2lAa/T5bAfNoQlpYAU5xqyNsLB8LOhsgXP5mlAbZhDbyqFfDS90tbWZDv+D5RSA1R6",
    "II+6ar86psO158Lmx5k5XVhSFdPiLXBEME7MhhlVDK0V1ANHdPtsMsYBBgaSFLIG5eT0gv/M08tBMGDVFxuhFww+c/3kJ64sJ+VuB9+HV3aTaMD2W2d+kC0N",
    "qlODfL7I2WbH3oIwdcOh76Z4AqqCdUBIntcI+obWBiDD1wZo+0qj5l/z1uI1/WrGvEFGgxWOMKxms0H0w/kpaBMbDm3kcluf+UwO2R6m56lFHansohlPzZ81",
    "cojLQmqL2riMeVtm+qGh9fSVbEeGgC3hGsM45SrMdrcaP/PUxU5X02LcLGdPzn/588/24NHhzkK/UxYpzj9WAt2gd+WpT13/5m/1l84FbpCnWZoXyVwfx2DO",
    "+iFUkagOES4toWfhAZIpXPrbQj6bbnA17GyyWqUvopjxp1E8pan5fvAR+MxjNa9leo//AFcku3US5cJYYeMQMtzDwKhYJUbisl+EZICSkYQyZI8E1hNKArpD",
    "WEAU82L75bieEVxknrA4gWZmqDFwJWGmBhZ7h4AML7+CEUEG1iF2g4qiwJgC7lSbO8+dee5zpxd//MbthST/77919omlNxLP6fQQv/TIHI7vbffs+sI/uPLZ",
    "f+qMX+8Gf77tjrhkg60LdZadYP9GlhdBiDyKtMuOpW01p/ZkHjFwJF+hvraIAA/s40sDgR9q1nFyv4A+ku4F5bXYztqjfDAB9CiwvlI2fbvoAvlRIXsIj8x2",
    "D3US1ISNPeJpi5mua3LZeJtCBpvn6EpAx7TUDElMGqlfYBaqBoCGyobOmo5rTiCjEzaja9ggG49Zs6nzJ64sXTl/OsFOy3KmRVLhbG11+qxePnX9GQjr3H3v",
    "wepdbZPhFJ1xdjMisTsYeShxGmTKo3aPClCKYBFpny2OtgQA2U+kwwp6HgpH1a00Caw2UEsbSDyujE0npy1oX9tKbMG2OOws1rF5kTyWyiK3RhuUNnrUdrks",
    "a/YtaMpdZhjU6Pbe0rk3b2+9e+fBfOR867NPLnfY/1vNJyzqMqViH5S/411w5y+devwJpxjcf/81togkfuTX+HKZmrKiEzBVZe2PDe9GakDofVK4xVGTENbk",
    "jgotmhDadsYU2YO0tiL7qDp+EUdDzQPFREHTB5bQB77a15bKvKJBufRiKhANYWUOiZwmtCQ2eSEDFIFRvZqZZ+70vOTUj1595+Fm+rFrvesXul66g9dIS93Q",
    "hVNsfs0mqXMXn3I6bvXg3ft33+4iVtiPoWmrDI5RxmEDsVPOPAiPUnNq0TZtpEYTFasis1psLQpTguqv2MIQmhJ6NZThOUVkWtExf2dFx2x8xjowY5/iWBmM",
    "QpEO4Y3jwLTQNnmgfgCQ9iAT0hlxpzUA6Iv01T8rOlqsVJbsJp1JJVYHu/Sz0sv8E2+8v8UGzuUl96uffTzMVzte1vGDdKI1FOQ/aythNH/i2uNOtbP2wct1",
    "NtDKilN2OTbjBOMxJ4LSUTrGqA/jBK8FTmkAVmtNN0t5CCONOZSHUYNarSDXHjV4IYimEFrSzEwGpyaZSW9QUdwYVoeftjrT2AFSaVBr4ZlgmwEOBo7NRYVt",
    "3Gaw6eS0EZ7k4SnRMZO4J6AlosncTLfMzB5Gr0LtjWS+g/+ot1ud+Iu/eX24nT1xfuGpS4vzHbbLyqNGR6G6Of3gOqNzS13OkDjr72zefrXHnCSdVMWEyQ5e",
    "zyxzut15rH9chHh1xtlYxyumwdIaBNv+BiNAbaEV0aZj1+IyLQpq0pbyQBgcbbq10No8ByISifSTMSVMf6Ih94BRZkCBWAxmMknhSjur8/XPdAbzbwCyLQq4",
    "KYkp28KhDrNdrakqS1MASRl1s5EqFl/wJH2eUuj80l9649b45bfusoXic08vz0eT+TgoOPiCak/YupC5QeaygL3+ZvmDjWG6VT18vxPJNxskIl6Go89NIJ3n",
    "xvROzjxIvAhV+Qc0ewwrZjCrGdrjJVbkU0t8UYBgEYHsbTeIrEBN9YxAKRyKGF16zGGh2fZsnc3TVs1LWzVV2USjTYjuQdP0/L4KWiqDrD5YDjIYMk7l1G30",
    "5B6tVbH2lLJBI5x3w+WfvHVvfbc6s+B86dnzsZ8ORztyLQURwpTdvsxsSqzI8b1bb/9k/eZry7g78rH4gS2tnjfM2FkT3XswnKTsGIgxRjudzjhF2tjQDE0B",
    "ZhDhiQqGfG0KkRZ3W6YltJC3pQxqDEub4RHPPauDTLa8fdJG+yrflqSY1lYsL/AJswkly3DjKQgNWLYIUwO8OTg2SWSMg4LOsGjUwFFUhRSEvTBNOc0Z5RMW",
    "VhQizi4aMU2NpdvZGjqvvnVzkjkvfiI508/Z7sSqeRx32P6LraotI97iyGXSOAm9tAtTTsbdGAjZau2w0RX/0tpW8Xev3fKDRXbdAWQ6YU9YYmUvcJLNBmGK",
    "7jTszPkaILG4S0bNxJXoMlDYD8IO9mbfAdXa4rYqXmdrnrYgwh7L0dNMZGjyANu0Fu3rnMZNRvaeTTuVhkniaQPWgSGfshnsbIUacRCOKRyRncEoCJPt3ZQ1",
    "KjdyhnmRe3Nvvb966+7aYt/53PNPhvVuHFTsdODgIqsN9Fqaulv5wji+PMY3j/M0weqjWAo70F7hJUWw9PK7qw+361HBwgFEw3fCdkgRkckJFDFw82iO+ZM+",
    "RQH4269NLiFraDXFGgqgJ3iT/DDhYJGm5PSP0UV2cjBNMn+bkdUQS0n0FdMq+FKdJg5szfup5Gozk8HEJc2hshXDVIHKtuDaJ9hyEF+bojSVjKpwvvD642KM",
    "oE39ub99/R3WwZ++1nuMvYjFiM2GDAyIqdHg+FnROXHpC1df/G8vPPPCJOyPNK8FYzO8CjZ5dgbV0o/eWB+6Ye6xRkE5CMLZzq74chraIQ+IBmF1v9zBJoiK",
    "hjXIbiO8gTUdCWvDabATiEBp+9WWOu55JKur0X2FGebGLLAiggaYyMrUmw4ICzmlZiN2WJmq6HvqbPqcms1yAfMD3TXDnCLoLN1aHTHHG1fzHEzwOvN3trKf",
    "vbmKVnvhYxfYuYG1xqZ2mAJ3B/v7Hb9bBIsXr39l4ZmvJ9eus7+WzcrIJJrg+GzlhpMiurvlvX3HCXp0Xk0RIEfr4kixqAH+NNLwr+Ubq0jAgq/2aenQUoNs",
    "fELhEIHWU3ZWms2v2FHhaIZv26PXYHeqm7YKBAKChtUS1Nfb0cEOT2Ux8pDntDFgRWWxwlswq0gxMKL5t25uvPzW+thbKb3OpE5eeXd9c+QwD3z2yomAc7Ei",
    "sSZ12ODIyLHb6Z264q1cc5x5Z/UhWoz94uDOJKUqUJIxkufVn2+uDR02sZU6OYyvFBcGjK3ZUBss3IY9dVaB75agIGvxtU+y2XTL0baU4WhFbW02kbgpesRj",
    "irvNaJ403DbTttRWpIgZSlOY9mqwzfC9bY+4UX9yx6kgAXJAckxhZCPHVuFtfPx1/HBQ//kP3h9XJ8q6Ny67P379Nm6hpy84FxawqzO2kbPsAqEz/ouj3TI6",
    "celppzfPnugHP387zDmNwvUQrOPFWe6keVz6Cz958wYr59reqqMGAoN2dTmHZlKGKy08FijrGLE81cg3aTmbpaWGzAHD0aRYZm7zCLNp/pmK96KQier2iEXu",
    "psCecpjmhjEtq5sEy+ZkthSXlLOCbtr/th5jLCOap4RmzIrDwSkHYx0Ycj3sMEjzylvOmzc23XDp4Vb1xs8fYox8/ImzfSeNq7TDLmQWgXSeysu8YJIszp2D",
    "navh9v1w6858NQqyERsQGEN4Dgtn7u7Dybu37nO8gp2YaD4pyCpjm3yAc0Km9BFB828jkdtv7avBsUmGvhYv3hUzwcbbgkdG9kh85GcSaY8wrdDmsqX2+vy4",
    "sja9FR1UYlIkOjD46F9cR6lcjcCfrO86P3nl7aKM3r1xd3Mn7fbmH7/yGFNp1ra0x469DNySwFywyLtLp5yTp6lkY321GqxzIKUbaptTOp64fhxGfU6b7HI0",
    "z3XW19c5CoaVYiYTWJypJU37PA5yUOaTfTZYWD+qSW8Qmaqo4yqZTUfwSUtwukashz5ldguTIj2k6RhRbJM2wpEx4+NcYBuDljo4lkMCzleO9xWs5OtcPcqK",
    "ujIwlh+bPS5aJsa9qfvWCtZM4GTmGSy2SQMinjGsgq6TDosxNxoMg856P/m3ryUXv/z0f33jgZOl1896T5/24+IevcFhukGNaRb73mI+7p9afsIJkShvVe//",
    "0YRlK5bn/QTLHZOBc/EPkvN/c/NuXixwFmxne3eUctZ3jl3bGb4TxgTXeGDbyeQUJS3FsfQ5f4d31XEzvOCSdHjy8MIT82kfE561BiabmDWhpDxCjDJ8xLXl",
    "ZHgZlSYMoZ/qbPpmOnhIpu4mkNgO72navr+q3upcdfWj8+4VNExBF0gstqOWRNCSg9SMlcZNzIJvnv/xn31/7da9xK+euLKitW2UDkKBbfheBxFZZuNuEHqj",
    "u87q6874/mjtNlt4cEEBF+iBIvOineFobX3DTDdY8zan4gwbAgDNMQz3gDMxA6HsFXWAyWNTTB8YI84UseSzn2y2tp7mU/t+VISNiKZh2kf6iNSqn78WHL20",
    "UlgDXnY0WSzFIcIvJrhGiXoWKvOnpTVIGbGo+QPTPB3L1i0n5d+9cbebDzmZ9fSVOU6z4W9Td8BBE4frSALuqfE2t97908n9H3KiMB4MNPI4HMreKIa2ZqrB",
    "+vru3dV1LzhZZcxm4GBglgYGbgQIkNDQAVIAoaFzIwx5JVCxxLu0KBDQB7YbmuIihfCSHW2ro37y8vlA5bbFPY4+/PlACtVO7WjNuVlimGbAGIdh9xqwMSua",
    "DXwyvQDZ4EFE5QDUYM3oBQGfvWRM3rRhq57z/QkuuctnO2W9I9cQTlk8FTHOJicthpy07HK0eDzwq7irCbe2INF/qo1V+qRzb21rd5DiStI8X3sA6EJJA2PL",
    "H6ayPlh4BNaMXcCLISV0Fiq2e0yK4rOrBPYT1dicpp6DD/XSLwzUbuvSNh/6DT86MZHO0GwKxEw90F2fhD+gS/o3DRkZAk3kAKFOdgnwPyvUWsiGISEKwr0q",
    "Lq44505yNN548CEVJ1JSzqWFWbCw43TKZKEKYkn6VCdH6TKzJwYPiV8HnQ/ubmScmtfxJUYLB4g49kzXs0VN99PsJ2UDFYhwWGbKRqIXAQSNNGZI7mE2Qwpp",
    "8L0PJkapAynt66M4WpVCMJU12gO9aZxHUE10BhTY+kP1lLhdvjrTLNUSxN0MVzGLx4HMwYjNqbg44U8OiowuXwh7EYstFNR+DgLqiNuWhsF8vLQMDSdb95z0",
    "wcL8go63ssVS6woslgajvP7g3ga33ajftISge1js4j2NTkcdosDCYqoWDsYv1ggWvRomNl0I2Y3sJisV0KlE6IC2V9pqiRxP50MHOm3Ls08R1GhnEnXQTday",
    "XHdi1dmgfgcTwdGKEXW5pgtmXQUWIYvJAD/LySK9gAPDnRT1eIL/T7k5xBjkxeOXHvNyTmyz3SmmcfbWs5jISknZPX/t67/nLCw6N19777/+6510jcP69JcW",
    "EH18JsHWKL/zYKfyFxAaYA7TSU2yUsD8iDClNCBCFggoHgQTMDSjU69NADvAFY6igOkD3sFdMtlQ3HaWqhWJVZAIuW0FiuuteZ0Sazq0m1bMH2WdUhOomor0",
    "ad/cqq3LFDJfAR5gWpjNB1HZgAKsJkHcQXfhNim4RQ0b0LC4LjkKnEvnT7Jaoo1lugaCFvxxMfF7c+H8JWf5KYcrK+bOIR/8gF2M3CDFMMDIjAov3BqX25wn",
    "Zqe6MXvZdgPrWTa0rfO0vGBhME8xD20oGIqDuMHdkNh0QJvZpkMBerZNJGJKNHjNprdx+hJE2te9SDs0gJodAEYO8hVySz+begUY2YgT4ZuezPaaoFeLIkRn",
    "zVALNdL+EhhyJ5mtTJTGrk1zZ4P7/WSbc/h2dOpkvNQLHRYAaw7OIz3l4WMyvT3J4v5ZlmAcJ5lw+FK3CuDl0HZsFrwZbV7SX9uaDLm7ghs5zBYce/CLvQbU",
    "jBFpGdwCDBjADF68Egcww7hcdSCqse2hpQWvFjvxqPHVkZ+CaoLtIwEbPtR3lG+L2FfVOA1Tjp7NYuK27b1kKbRGQpmyqsJW1+axrEq3GUUvQ4PW2/FFS5Zf",
    "4B/JE3NC1scbxIHO0mdRxK4k+E66OM+Fj+w7l0tEZ93pOy6x8aM6njtx9hqzE9ZhxoN1Fg5YYAcMiyHIMjI2dlLsFxYMIYFpXl2ryHReZ8HWN3G2/ac4ZLek",
    "N5+OfRjcsQj0V8VMrxyb21AfAAgNoY8Y6QJNOagFXMwTQjd12vb0ucmwb9SQnYECt8o0MSxOsVZ0wPUMc40+mFDTloAj5H7AjlzaqaJqcv5Uv6OpN+6JYsQd",
    "MCJ3PSn80u3OnTrHdNxxhqPtW3WOk1r7hsx8hzxVUYar61iEzD2FF2aHsUgxkQzVRReNKgu8fRp8hBUn6y0uxFF1+kfMMLrJI9I2ESNOZ+o0ZNrPzjbn7PMQ",
    "RxtlBYBQuc1n2lBOM16a4QDIhBa4NsIIpo+Q6VzfoTElTUQ/NpzFR7AlFfqwHxUZPeEuxpQdYJzEZ+kI9xKG3RyChisScfJj16iI5vJed67v92N2ZjvlVjFc",
    "46Ig7cUCBuxljWq2nEdrG6x/a9SzxQtVx8FcbBcO2Mm+NLc98smQuCF9iwJCxhh/JDShpew0Ye8vAgTs6I29JBODCKZyPQ58Mh79hqSQUp8tBYkczC3PhiwH",
    "/WPQTbtEqnuqXi257YDKuFAEv4iyiWWolq/qA/A37SBh8PyP0mJrMILiqAIOXfVq5/R8gi+Eyz/lr8NEg1nkXyl7bJvJ7jrOGpPvOtuCnlrZFpMKPSPiw53d",
    "CbudaA6cNCI1k9oTL/Qun2xosDP40IAsEGHe4DXNtcdJNkXA7HG08DH1kCgi6v9jgrGj6W1Dtdk8lCfMDgg6yY4XVW/D/s5QftnKoiK9DcPCsjKNqcVoc0U0",
    "fcdlVMwleHFAG+lcb+4OhpOJxIzn9Hxnscc2AZ2tY8s4BaAlGgu/fb5798FLf3jy5Clv+54z2ICIql/9bkANfC7YHY5zx+cSKRYIRGHy4JEmSHvpxJMIuhes",
    "xUkVRkWTTkU8BedRwYBvP0kZ2sw2P0DwbooeXfZRExa1JbPPdhpAWEIjBBo13QAjYQCygtJwr8oQRy5gumkI8G7VB6zuIjEq9gAszM+xwIVZwqYkGRucKxfo",
    "ZRw5nQ57aLR1POG2XO24EFvPJe5o5+bGqzdGQRLjHeQYBQcNjRMREYWwgDpUOxpzeRULg2bKLczxQaPkJGvxLwHFDLEa8Ns/tN7GFRHzUYN6RjRtCGjtk8bb",
    "A2Sacn6IcCyhgYzaeYrQpqIpofVCuj5ZXjLZjN+czCQxPkAIubkPbmqz0EJQdiLw1OWg7MUPsdCMfDAzTwgdM50zF0NjOmirMBhj8uSTyJn0uE07G/hFt/aT",
    "CVu8tINDbh0ICjwT7qUwx3mJm10jYnbwaOkgoA3YFoU23UQgqyHoDHazGWxRFTfBEmevalNWPTvN0GazEa5nnej2w5rjOboKDSWELxb1kwG+F8Nw2F+BM4q4",
    "o7iM1iYshTCoiyUwLUe5f6LEo1axYwhnMHuYIjfv66h9lSUON+ykW3l5RdKCYcWI5pbhAMKygMfmgjoouTmKDfpp1UVQs1mAC8WgZqfndKKUXRy4QnZCjBMM",
    "EnYJBLveYtE5c88/4YTjpeJGr9wKyjEXdRXlMpY2laY5F1B1tkZYwHHKTpqA62HysdPfGHeWvV22jcmKYXyMs7jT1V25FTd1sAcbrsA37nbZhIoJwJ0z3B2m",
    "e9KjKIs6TrgTDHDi6dqzNF+onEXsJR3odTe5HDjgNuNxB4nFUmTQc5wFRllYb1rK2mfbMUZv0P/qTsO6TYcZnp2OFnoPmStVi0DlDmztVieIjUwxHhCJ/W2U",
    "0uiUzxyxgMpDFRo3hGEwu9kbHw/3MHHVAJXqkuid3QFLe56u5kOuaKIQsO9W46KZfGmASLwkT33ss53TH3Py4e47f3r/rR90fUYC7KwLWeBc3Y4sUxoxLKM7",
    "zYdd15tk5erDnUsRd3ew8YPzpqznAGnuhQkSJecGwaoOYQ959XGsgAGuAbzfdBw9AAE5oAqSGrmAgTwK2F8CDZiLstpjXD0aSgxfEVCiTwQ5KqDWqYVcRtvO",
    "jAR1BW1JgFAYOsKxTOGQq6wGaToUBh2ugMYHjDkFFNqTJ5dAClV0X7WmxUwTOSSIg46KZKcJXl1lzIIO3nx6SpXu7ozybIEN50y1uGMGFLX5nhFQjkIfBx5m",
    "IjqBG0PPds6+6Kw8yz6k/s792++9WQXjUT4IQraBmX1g3FbDPd8cQwBtxmHVZWgOx1sP1kc7CyzPsJagKSbr4hMYIM8RULovTz86wC5+zpiVYczZwQDHCzyL",
    "wuYwBPuqUa3QBnOV9SKgT7oRu3dYKspGbLBSu6Kyqws4QY2dTGbKMZW2MxRvBLnIOg3iNYldWaNEpMYkc0XKMSKQm6jwQnB2L+BnCERdMychu1F52pfE7RhM",
    "ANjjoqv3tOfG1k1NaEe2lxdpwW2PsDHzwoAL4Z0B2z/1QyI4kQDXzNDU/XjzQIJ5M44FXNUdJ1pw3L7jzKVVNGEJHc90wEnNCeiBGTpXSlOcYZrU76r4KTNq",
    "P8EFyw1E2IJekrAk7NINDD0MfDmj8hQLx+M4Blf/yxqV7xqa4QvwYHxYEFlq9L/4zokT2aZMsiTOat0AznSUayRFIwjP7qVjgq7WlJwSL4v7gdIKDCIEvvLU",
    "N+lFb8TsguO+4Kij3jh/EBZcoixC0iSMjDQGTD4DMZcd7w4yt8/vrcjog/hc4IJZJAO55H7rvh/GYcxV8VxUNJpUE7bUwUJwBXs/1X06TtpFfwgqDgoyAOgF",
    "7pupuBSC6SIDpuCQkM8yOo1j/wUsd0XstOEiVLSILBr+YqgH8dZwiwvb2LTgpCwxdoGGscZcx+x2lwXOtl58sCPcg2yaCvADBtwkJSlJByFGxLdQgT1P7L+U",
    "LcLgyyfsSaEf+GEC+A0Q0WusXRhC8iaS7ONreRQAU2lGbjSsrZolcmASmRPaDwF7BcNJwaQX1xjHGXW83wgcJBdyUd1kOgNRQVEQ3YHQbFYuCvwWOmOEAKAA",
    "DYCnaKGNHWzAI50U7BA2GZGDEcntlBlSFR+IYFBHwoZeFBsOoBmOZ4Xc5YP5Qa8JITiT+5JrgGJBmBq1NYdqERRcx7+2nQeTdLfodbs+dyot8ZM3HEHgohRd",
    "ecNta4EXLeZ+vywWJiyTsTAjOmizHs3JTBc3kwClOS3LQGUUS4Ri4cDfkhiGTLRJfqkisesRQfdv2GDITVTUslysT0ZLKkVYAjC7A9wEvzq3jiI5HKhOzxtR",
    "Lvmn7ReIAukkdi8DZHQCuPgCqwoA+oQLgeFtv8dOUrqAq2PTcTqX9AA8dvjhjmrsO4z0jC1gEcwCX+nYEzs9ZbfJyqMWRAbOVPiRa5YY+1gmGH0hwoFu0wqN",
    "pu78o3O5aLb77q3hoFe/tRqcPXNqY5De365XTi12Y9x+kyjmLrJgknVHzqk7a+4at7FxLx/CAw6X5EWBxQhw8BTBWWRLUNQIbGc0nAxTbovtstqgrmCcQjdY",
    "21oHlqD7+VoDU8FQi78Nz4uyEt9iP+J0gnQvO10gLb/YwO9AlB2YQtekmbmfYWOEtSQEY5q22VUQJWH/wiTZ5FItzndjDkh8cGaicofx5jBYGpTeuF7aHu1y",
    "EW2WllxwS9mR6wzcsyPu5OEXPJhagoEfTsq5ib/ATjrpGy4OTU4W/jKXgQ+LYREguLkMpjvxl9K6yxWT0FceUSpj6ct1bzyYbEbF3E/Xzl+YX1/fLtayxy4g",
    "eLdOLiXPPfckg+a1d+7f37yzPl66uTrEbwUvc0Ef6Guqo+sc9etO6l/UKxyNvkCgp/weBN4OBbMVHQJCCPjZMCSZDwXt+Jc2Qw6Zb5J3NlJhXXMRhyQwxeVJ",
    "8JLd3fTug92nT3P2LOfqIoYmAwsuZvjIjYQLX44WLjhm4laX4eIf/Oe/+8ki996FTLh7XTY3c6QVfYVJMPcg6t5f3by1uvrXP72Z6YaphL0iyL+1euVf/JuX",
    "rp3unFoIE2QBnN1z/a6zcNZZube9tNKPPXwj4b3ifJB155jGR/JLcx/NxjD+f//i5c0xLBCzP0+jEv4Iuls5HurKvTF5Y3W8ev9+6J3wb9z169HyYvRBcRrl",
    "/ud/+erOOFw4+RQ3qjC8pKU5yAUikEQHalggRTQHLhv6Yt2vy5LQ+nCyzh3l4QpSCLSRp7Sm3y4QESUSLA3tEzD4alSNIfbMN2M/8G6MYgpT3Ehxhk11Zy29",
    "xiwmLM+e7FXlgP0kSDsmNTqJw7YBL0J94Cau/OThzvAHf/t+Vmwj7dC5OBmkxKUXUQBcbsx9n1ghyda4iOd9lksY/KyxPhx3Nm+O335vg/OYmAZGO+iYGzPI",
    "xf/zPzKu+JmVOZAe7XR95pBObzGOou7D+5urG5MH404VLQRxHwGKmYgFjw0ED5ROd3XH9QfFYNzlYl06BrV5e3f8841XgWpzx026C+v3t3CToPqMK9BgzGBC",
    "0vmIOO4McYt0eHaF3awcUe3eWr2lnxSVQNVGWWOhiUxGxs4QciaqHWvTV4iJSWQDiXQDnQFdILWoAx0xa26uYgl3qtHOlQsnvfJmJw65L5wBHUJLzRWwmtjK",
    "PIEp/M4pgd7jCl60P2Bo1o1tpOOl/GhWyU4MqBAl/U6KdzTiyg3ywBZIRn7Wgh8gYoxgQ8NXDFcM4fLuvV2ED1udsUqwN+T4R3lWW72EO3OxnrtuZ4lNjtx3",
    "ygkMpnhcFcrNZmYuHg64/ZSLpLHWk046okc7XO65mQ64G6SKOoMctyfXgnAhA9YbcEpno1UBmJ8dwivFXWSdoD670keOZlX3g/sjVAJaEC0uFcgdyEDGIIJO",
    "xynDKZX3/VXPmGFgylHaBNjf9d6552wO65VugHv+ZD+4tfMgTBYwTTmWDR/Dzfgt+I1NjmL7zhwjP0exgat1zXDqXQsrMnWYW6C3YDcs8knG/eRIDtgL1g6w",
    "jhlqmVwZKf5S6mS+KLmSs91fupRC7LHDaMCCQ7JzLZzf0XjKuaIcmSoLXU4B2WUIPRLk6cY8QAFG44w1Mzaowbv6KQLuEsJuAxydGYBFkZXYDfoRE/Q27zJr",
    "MSG9bHchri5dOA2r7WbJux/soBgQFlPKMIlgmgYXwXJHBzl8+aKumD6ZzkkL7tkp9JHy0Mv8++Chc2e9ONn1zyx3nriwcO+NTa5IxbVDq7LxtE3NY4rFbAV/",
    "OyNO1oY6WeIIzSbzgxGHAtD0i5s/YzaUssdtzPWLmHcYxayxYs4yOOB9nVYWmTSSpa5Djg6iDZEweAale6AMfgZ2ztENzDu44z/kaCdrL+OO04Ge0wAAD09J",
    "REFU2bmgqTTYS5PTUwnWYLcz8N0uW9NZ9mX5TNdiadLP1dKanCOZ5QWAsXU6HpWoNcG6HsXl2qUz7vkzK+PCu7/p3l6jb3DoSiCKh7B0wIqoCN1KCJG0DXup",
    "syLcsjMpsjgkiUQquoR/W6nz+jurGLnMRV945sK8jxNtKOZCELMxn5sFGHuIR26Z4wAV/OfJHwxTm9r0gFVIIQmSEWhLdr4m+rAvmGuaj03IzfFc4wPOkjgE",
    "tjpKJTFN1lUQmlAITY12ApWoCa6F1dyVu9Jw8UjgADbZgMiMCcxes8zMVmtxqv4h4ug2XBpQ1nShdpZBOKwpYyUFhS5qGYZp9sL18xjvfnLi9XdXd8eAj9EN",
    "XXASYCIbzTMVuy1xZyPCWqJZ6rNNPypmPgLKqAx/9NMb+tGBdOfFZy+fP4ntxgEztt7i34CZJdAwrbnAtiiZsW/DxEJYe23gP2464JZnLjHWz7SxeuymRSC/",
    "DT+SojMRCXqUn9njN2gQIYjlgloZFpzs9ubY7snQxJWDBV2y9ZlfbsPYxEvBDI29TfQR4wofDD64eHeMamalix3pPp85B8o9DNwAzJyZX4djOufxy3W+bjU1",
    "0wwIOO97XX7SDE5CgEhGwyzaYRa7WLLV6Pwp59MfPwduwzT48cs/x28J+2IbmMk3/WemR4YdWyIeiOxx9P4Px9LaD5du3h689NJLzJFOzCff+upn2eMND7DF",
    "Al7WYinjTUMa61nCVkDAxWJoRJJhF05HQBS5IuFkfj5BEhS/h3wkUpUUhZtEBAY+skPOHM236duc33FjAz/CAcMFVLF06Vu7jsrQkVDXb+0g0/kxG4gWwKZQ",
    "A98Lpcdc7oEiZ4R5MRKd2yUYMfz4Asvm6FwsNCarcDEDAlgZJYhdRFjKry145Ve/ePHqY6fg9JdfeeOtd29G0Rzj3ASjBsFRcuNRwY/nliX1yap/RMBV/xiL",
    "JsaTzhDdzbynYoqBR+Ph2uZnPvVcXNx/7upCtXv33nv3jdLlagvNUANHilGshFYBBOgEpmIS9rVwaRKzCeVjr7UMGc2o1CyqEXeYV3E3ARYFloksIilyzdC4",
    "cZ1xj0ChFul5xpaR+5TXFzKQmVUC6Zw6R8lpEgnTcRUt0hmnlHiPipC8+k2LmvvNuZCdgYdwVWcCJU4ntkdzpSpcgQkywYU9ccdfWLv5289Xv/vdZ1LHWy2v",
    "/q//9ys3h70dOpUBpV9xoi7c4XKlIWP0I3Zwj6HX/ifKe675rayD3SHiHxHcIIn8fP3+euBsfvrZZ2CD608/Mxps3LiB4EZmIPywLEQaRCa3N0gTSfVbcwCy",
    "aGCi2YzP1zZhqAxZFOhqsutv+0/9T7Lp7jaxjRi2gPRg2BYkvwlKUdxkNonqI3pIXE4yzVOr9LiqZzO+rkGL+I0CZ5JUu16+kZQ7v/Xp6ju/8Y1grpuFJ/+v",
    "773yX374bjB3ip1rjCrYRBeJiqzIXbEL3a/HUUG/w3JUuil+1Ac5c6FWXN14f52z2Z96+lowvPfi02dO9dM1fuIS7w2XGVUA3HdG2ZyHQQI4hr0gLx2POkLK",
    "cCU/pploABWFrzrCcC6ila4yBLBkECWQOJp5KF0ilAj/mD0RJ6fGB4aifZpPTQbicnY1+ZXIq12PQNYheXDtoZAZZHi98duZcwzueKuXP5zLBteXyt/9ysXf",
    "++61oJdMelf+6Ef3/80fvZyHp5FzcvIh1Zio0b0MJRkbBO1/0JA7Krjtz+wd/Erxo0LOOWH4sxxG+UN++/S/+/Yz/+irT3AnSbc/f2e7+LOX7/31K/f4QdER",
    "Nwkg8jJutpTJIZNABoagwtgGPIa4hIC4q2GBKRsahxxdoH5QxsNQ2E82XcIRUEHvwNN8pnib2VZFdjSDuFdbbjTgzCFqHZYuJsNOWC1E1cUVD4Pq+WfOXDy7",
    "nLmbaXT2D1/a/Vf/4Ue7xaLrz3HUQh2rPUDqftk1uBflOKPvcLI08B8A+5cmNEdyEGs0hSiMqkHP2fzu56/+zrc/dXqO2zHWkiSis+/eH9z8YOPOrY3xKLs7",
    "ZHLF7x86o9TBvS9TWvJDTwipPQGAK7IazoYrJPf02gZLak0gGA5t6jQCJ1O+NZnafqEG4hot09p45V+UwYpIewaRwzU1ncSZ7zi9WM/TJ5OVU/1LF8+cObuM",
    "2QcrUPbO5Owf/MlL//4vb4z8Zba6jsfjftLFkJrUGD7UhJ8FeSF4OW3HUgULMFPQ9v39pQldVUN+0I87jhjSnJL3y91q94NPXu385tee/PLzl/lFAyfldpKQ",
    "BSLustTVJPjsmYCgy7FJuDSGhSAdZNWvHOOUZ6GXFGwK0hDcSJeo+YXOfVDyAqH1nPK4YU9Q0o/skA6hLcPaJynyQMDO0HraaXrnV5q5oYuz9x1u/8eIx9Cr",
    "uEpfv1HLTz8YAcVxoBGr08mJYRH+7PX3/vX37r7+zl2ve6UMO2m+1evF8kTzGw5eV61jrSJK2LXGMXzmm7j8RJkjwi9N6NQv+bVcuRBQ5bp2cRj4w6rcit3d",
    "q+fmP//sk88+fu7iUrKQsJo8SDCY012hbbAFT+JGZ8mEUtw+4Yo2XsrPJS2290dRM6MxaaaIYhoMWCpmCDTFhaTlYiQJldMBpmmiTTBHZxlP9CoAKI+mS8Z3",
    "VXndUd3ZGoe31qtX37n/k9c+eO/9e1vBShJ05CapSo7hTrI0nDu5O9GkgXlg4AyRQj43TMoaZQ5VcuuaQDsU+BVl/eZs2+17GY6R0amcpxyE4xckYVutp3Fv",
    "H2YvnMVBBw5fzgf5xVPRM5eXHjvXWVnqnV3CXxSJicJIA1Z0oGp0tF2VkU0iQSJFpSDFJ6kt6xJSmCc5lYOnSMtsvEk3Xw2vm3S+2jpMRTJTmoAaQPAYpcyZ",
    "AVqWu8QsjrBJoRin+aioNnbH99bHHzzg95M3bt2b7KSs0jKf72/gf/JDf1xzAIGrKxDGqdvj8hUGH7c3+e4uSkAuCuDVIgkzHRH9cDiCo+lk8pkOP5y/QZ4c",
    "UvtGFdhMVqKx4oFTza1YMMU5p18Yxm2NL437w3udhJ9Q4n8cfkyxdNkzu0nM/IFj3ppHY3dQCzt2DUm05RCTXE8RFAZtUmRIgBGXQaPQ+OVEoMAKAEMBRIfJ",
    "eDQb0mTmmF3o9viF1ijKaptzIXj4mL1w9c84HY8nLA2Pi3JzyMIOhjFXNfErDhLQWCMwwWbClgQ8Mixx6SfL4Qp+flVrYSI0U6yxHCYYd0zOmB01zHAE3aYr",
    "LIapGxJjHOwNz4NlNHnTuBY/gigx2VxmBoGOQSLIwcQkzyTDetvjIbsS3G1wx4uDIpX+Q4ngvwA8jVqYGCSku2T3omipcwqABG0LgTKYtm0KeamUyaNsPbmD",
    "mpwaHYwL40WZihHDOkZ84WGVwYkew9JnVunwA7JzGmVYa+IuYYSnmfkPzheZgPwumBQ1q8b8PKAZjQZ3SrLzRotJYK2iRJiXY97pZpbDoXH82w8C0LKzYNrD",
    "cLaY9AsQaEcBK4SyH/CHAh3sCOJQDeDUa7LgsenYFmH2ylhGI4+OYcm0hy2oiMXA2cqpiAt9TXmTbvbt2AwqtZdZ5CDQvyadmkhpZAUlycm7JT0ZlHMqr2N5",
    "XpDd0CYwuxvMXZVybLHhBErSzVQApzB9DfG5hDkzSktoMKIoM8BUE3taE//qqZ5QMVmugv6oIL/XUemPSKOnxYQwGyUZTeYMH8uxpIOSKKzCaptXnDhGiCmO",
    "m0xTXWxqMuGXQOoyLgwhBDGAIicQgjao16lKVFIQQclCNgHccLrI19DcZDIPilEKhp1mbj6J9E6deDg/oROzef2QMudG9FlykN4HHKICVVJIjMoPZ7GNQhxE",
    "IWAnLxaG0RMCX7hLYVA3EQ2JprFDf/ZEh5oznX8oz/4EAcp2B+grvtABYuEv4BjBiGeBZ8hhKRg43HQKcdQ9EMXIU8XxtOkpM5ggXtGEExObA+aqy/gzDJkt",
    "VAhc8yYoQdYW09NYu6pjGvhM0B73aaAGggS9IMUvSBVsT6BJkOC3EEUgSyo4m0+QCyBYAYWCrMGrXRcnIsAbUce2buYl/Gqn4TQaMdCwwcIUmjZ64G9DaOA4",
    "8OG4V8xz6MIwk1gy2+O4GVaSwxBAMyNoygAEDTNzZv4LmOpvtSHkrfCR/CALY9/SDDmjr/SSuoHQDrU2YtMtqL8w0crotgilKMKTDUjqRwkdDXN2k+kLmxg5",
    "14UX1bhJ5TMHTgxY9QAdLL0CnCKo5oRgLl6G0+Fx0u0/nSBTB6ns4dAQ+vCH41Lqik1ZtIVlg75XnzN6ZYiK7jAo2EDrhkxQX9wPhQ05jXcDDDTw8YSSBor6",
    "aoJBT3y3F6wQbL5OWQHE1HVN0B1SBENHUmlfg1kZeKou0yXQq4mXXPRmW4IhEHfaliLSsDtChpM2DDAupZCRPnrwW/bUZqBSWwxJ+6KhDG/IsDMSQ9oKytja",
    "VHx/EKFnUJ1VOPsztm9MPZuZs1ltUj9DMuIagUZQSdoZPGkV1rGsDr4aq2rOEELTMoIcoZQXSqYbZkg7A5hymmBqMWOEJkyp6URGNagFBcXNU68CRUpBge+j",
    "Eic2/KxfrYbAeFaVR64s8mhlFpNJDAA8UvDkNEQXXPzTmANRI1qk+Fl+MIQ2wlCrCNJURwZ3fuUZ+2EKZZPNQjZbZj9i+mLBb9Lh8kcGm63NcqC5Nr2hSPs+",
    "jbTFDxRsdK/JJlIZ6k8L7f1tSxlHttKVAm9MQ4OF6SrLsvtSTLWktPUYyTktPPPXjicS2pz2o0bNhwnHIfBhypLnVyw+28qjqwK9AxjOln10/EDB2Vcbn015",
    "dFWHv0p0PLr8AcT2vU6Z2NQwfTnUyL4ih74eSLCZbV2NTD+QY9ptjwDbfnpEu48oe6i1JmG2yEeo+VF29COqOw6aw+l/L5UcrpaUpmYrlo/KAWkOtz5Lr9lC",
    "R6a3iW3EtqvXY/lqtta9+C9tdewV/XAxLGMyHkb4GFmq8dVWLDuKBIuSKWARnq3NqtamyAzyNufh/G3lHzlCnbMAfMh6jia0KqI+qxmOJcmHbELZfvWqbA22",
    "ydn4PkJPIZrN0LY+/XjEX/L/UrRT/b8kWQ4S+nB7Fug2fRYHy3t8Isww4hGY2KTZssdnOvilMVtnuHW2thaG2UTitAVUB+s66v0AVHoVGZuy9qt9PZDzqMoa",
    "luJTW4PN9mGtjg/TxqMbPvLrR0sEmAPw2JTZJzUfyHNkWx8mT1uwpd0vVcoW//8B394L1otE07IAAAAASUVORK5CYII="
].joined()
