import ActivityKit
import AppIntents
import SwiftUI
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
            LockScreenView(
                state: context.state,
                attrs: context.attributes
            )
            .activityBackgroundTint(bgColor)
            .widgetURL(URL(string: "mileclear://dashboard"))
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

            Text(headerTitle)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)

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
        case "ended":
            return isShift ? "Shift Complete" : "Trip Complete"
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
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(accent)
                    Text("SAVED")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(textMuted)
                        .kerning(1.2)
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
                HStack(spacing: 10) {
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
