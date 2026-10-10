import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { useLayoutPrefs, SECTION_REGISTRY } from "../../lib/layout";

/**
 * "What you see" - the user-facing surface for the Profile layout
 * preference system. Wraps useLayoutPrefs so users can hide cards they
 * don't use without having to learn the reorder screen. (The Home
 * dashboards were taken out of this in the Oct 2026 Home redesign.)
 *
 * Locked sections (CTAs, identity card, etc.) are filtered out - they're
 * structural, not optional.
 */
export default function VisibilitySettings() {
  const router = useRouter();
  // Home no longer has cards to hide (Oct 2026 redesign): its shortcuts live
  // in Settings > Home screen. What is left here is the Profile screen.
  const profile = useLayoutPrefs("profile");
  const profileSections = SECTION_REGISTRY.profile.filter((s) => !s.locked && !s.hiddenInCustomise);

  return (
    <SettingsScreen>
      <SettingsGroup title="PROFILE">
        {profileSections.map((section) => (
          <ToggleRow
            key={section.key}
            icon={section.icon as keyof typeof Ionicons.glyphMap}
            label={section.label}
            hint={section.description}
            value={profile.isVisible(section.key)}
            onToggle={() => profile.toggleVisibility(section.key)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="LAYOUT">
        <SettingsRow
          icon="grid-outline"
          label="Reorder Profile cards"
          hint="Set the order you prefer"
          onPress={() => router.push("/customize-layout" as never)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
