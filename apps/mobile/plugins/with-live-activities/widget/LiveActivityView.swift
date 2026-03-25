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
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(format: "%.0f", context.state.speedMph))
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundColor(accent)
                        Text("MPH")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(textMuted)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(String(format: "%.1f", context.state.distanceMiles))
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("MILES")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(textMuted)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        HStack(spacing: 4) {
                            Image(systemName: "timer")
                                .font(.system(size: 11))
                                .foregroundColor(textDim)
                            Text(context.state.startDate, style: .timer)
                                .font(.system(size: 13, weight: .medium, design: .monospaced))
                                .foregroundColor(.white)
                        }

                        if context.attributes.activityType == "shift" && context.state.tripCount > 0 {
                            Spacer()
                            HStack(spacing: 4) {
                                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                                    .font(.system(size: 11))
                                    .foregroundColor(textDim)
                                Text("\(context.state.tripCount) trips")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(.white)
                            }
                        }

                        if !context.attributes.vehicleName.isEmpty {
                            Spacer()
                            Text(context.attributes.vehicleName)
                                .font(.system(size: 11))
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
        VStack(spacing: 12) {
            // Header
            HStack {
                Image(systemName: "car.fill")
                    .foregroundColor(accent)
                    .font(.system(size: 13))
                Text(isShift ? "Shift Active" : "Trip Active")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                Text("MileClear")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(textDim)
            }

            // Stats row
            HStack(spacing: 0) {
                // Timer (native iOS counting)
                VStack(spacing: 2) {
                    Text(state.startDate, style: .timer)
                        .font(.system(size: 24, weight: .light, design: .monospaced))
                        .foregroundColor(.white)
                    Text("DURATION")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(textMuted)
                }
                .frame(maxWidth: .infinity)

                divider

                // Distance
                VStack(spacing: 2) {
                    Text(String(format: "%.1f", state.distanceMiles))
                        .font(.system(size: 24, weight: .light, design: .rounded))
                        .foregroundColor(accent)
                    Text("MILES")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(textMuted)
                }
                .frame(maxWidth: .infinity)

                divider

                // Speed or trip count
                VStack(spacing: 2) {
                    if isShift {
                        Text("\(state.tripCount)")
                            .font(.system(size: 24, weight: .light, design: .rounded))
                            .foregroundColor(.white)
                        Text("TRIPS")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(textMuted)
                    } else {
                        Text(String(format: "%.0f", state.speedMph))
                            .font(.system(size: 24, weight: .light, design: .rounded))
                            .foregroundColor(.white)
                        Text("MPH")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(textMuted)
                    }
                }
                .frame(maxWidth: .infinity)
            }

            // Vehicle
            if !attrs.vehicleName.isEmpty {
                Text(attrs.vehicleName)
                    .font(.system(size: 11))
                    .foregroundColor(textDim)
            }
        }
        .padding(16)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.08))
            .frame(width: 1, height: 32)
    }
}
