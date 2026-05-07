import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { useLayoutPrefs, SECTION_REGISTRY } from "../../lib/layout";

/**
 * "What you see" - the user-facing surface for the dashboard layout
 * preference system. Wraps useLayoutPrefs so users can hide cards they
 * don't use without having to learn the drag-and-drop screen.
 *
 * Locked sections (CTAs, identity card, etc.) are filtered out - they're
 * structural, not optional.
 */
export default function VisibilitySettings() {
  const router = useRouter();
  const work = useLayoutPrefs("dashboard_work");
  const personal = useLayoutPrefs("dashboard_personal");

  const workSections = SECTION_REGISTRY.dashboard_work.filter((s) => !s.locked);
  const personalSections = SECTION_REGISTRY.dashboard_personal.filter((s) => !s.locked);

  return (
    <SettingsScreen>
      <SettingsGroup title="WORK DASHBOARD">
        {workSections.map((section) => (
          <ToggleRow
            key={section.key}
            icon={section.icon as keyof typeof Ionicons.glyphMap}
            label={section.label}
            hint={section.description}
            value={work.isVisible(section.key)}
            onToggle={() => work.toggleVisibility(section.key)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="PERSONAL DASHBOARD">
        {personalSections.map((section) => (
          <ToggleRow
            key={section.key}
            icon={section.icon as keyof typeof Ionicons.glyphMap}
            label={section.label}
            hint={section.description}
            value={personal.isVisible(section.key)}
            onToggle={() => personal.toggleVisibility(section.key)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="LAYOUT">
        <SettingsRow
          icon="grid-outline"
          label="Reorder dashboard cards"
          hint="Drag to set the order you prefer"
          onPress={() => router.push("/customize-layout" as never)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
