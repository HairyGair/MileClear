import ActivityKit
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

            return DynamicIsland {
                // --- Expanded regions ---
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(String(format: "%.0f", context.state.speedMph))
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .foregroundColor(accent)
                        Text("MPH")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(textMuted)
                            .kerning(1.2)
                    }
                }

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

                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(accent)
                                .frame(width: 5, height: 5)
                            Text(context.state.startDate, style: .timer)
                                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                .foregroundColor(.white)
                        }

                        if context.attributes.activityType == "shift" && context.state.tripCount > 0 {
                            Spacer()
                            HStack(spacing: 4) {
                                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                                    .font(.system(size: 11))
                                    .foregroundColor(textDim)
                                Text("\(context.state.tripCount) trips")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }

                        if !context.attributes.vehicleName.isEmpty {
                            Spacer()
                            Text(context.attributes.vehicleName)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(textDim)
                                .lineLimit(1)
                        }
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                // --- Compact pill: leading ---
                Image(systemName: "car.fill")
                    .font(.system(size: 12))
                    .foregroundColor(accent)
            } compactTrailing: {
                // --- Compact pill: trailing ---
                Text(context.state.startDate, style: .timer)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
            } minimal: {
                // --- Minimal (shared Dynamic Island) ---
                Image(systemName: "car.fill")
                    .font(.system(size: 10))
                    .foregroundColor(accent)
            }
        }
    }
}

// MARK: - Lock Screen Banner

@available(iOS 16.1, *)
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
                // Header
                HStack(spacing: 6) {
                    // Live indicator
                    Circle()
                        .fill(accent)
                        .frame(width: 6, height: 6)

                    Image(systemName: isShift ? "briefcase.fill" : "car.fill")
                        .foregroundColor(accent)
                        .font(.system(size: 12))
                    Text(isShift ? "Shift Active" : "Trip Active")
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

                // Stats row
                HStack(spacing: 0) {
                    // Timer (native iOS counting)
                    VStack(spacing: 4) {
                        Text(state.startDate, style: .timer)
                            .font(.system(size: 26, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                        Text("DURATION")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(textMuted)
                            .kerning(1.2)
                    }
                    .frame(maxWidth: .infinity)

                    divider

                    // Distance
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

                    // Speed or trip count
                    VStack(spacing: 4) {
                        if isShift {
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

                // Vehicle
                if !attrs.vehicleName.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "car.side")
                            .font(.system(size: 9))
                            .foregroundColor(textDim)
                        Text(attrs.vehicleName)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(textDim)
                    }
                }

                // Action buttons
                HStack(spacing: 10) {
                    Link(destination: URL(string: "mileclear://end-trip")!) {
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

                    Link(destination: URL(string: "mileclear://cancel-trip")!) {
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
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 14)
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(accent.opacity(0.15))
            .frame(width: 1, height: 36)
    }
}
