import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getDatabase } from "../lib/db/index";
import { GIG_PLATFORMS } from "@mileclear/shared";

// ── Constants ────────────────────────────────────────────────────────

const BG = "#030712";
const AMBER = "#f5a623";
const EMERALD = "#10b981";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const INPUT_BG = "#111827";

// Mon–Sun order (UK convention; day 0 = Sun)
const DAYS: { label: string; short: string; value: number }[] = [
  { label: "Monday", short: "Mon", value: 1 },
  { label: "Tuesday", short: "Tue", value: 2 },
  { label: "Wednesday", short: "Wed", value: 3 },
  { label: "Thursday", short: "Thu", value: 4 },
  { label: "Friday", short: "Fri", value: 5 },
  { label: "Saturday", short: "Sat", value: 6 },
  { label: "Sunday", short: "Sun", value: 0 },
];

// ── Types ─────────────────────────────────────────────────────────────

type RuleType = "work_hours" | "saved_location";
type Classification = "business" | "personal";
type Direction = "from" | "to";

interface WorkHoursConfig {
  days: number[];
  startHour: number;
  endHour: number;
}

interface SavedLocationConfig {
  locationId: string;
  locationName: string;
  direction: Direction;
}

interface ClassificationRule {
  id: number;
  rule_type: RuleType;
  name: string;
  classification: Classification;
  platform_tag: string | null;
  config: string; // JSON
  priority: number;
  enabled: number; // 0 | 1
  created_at: string;
}

interface SavedLocationRow {
  id: string;
  name: string;
  location_type: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatHour(h: number): string {
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${ampm}`;
}

function buildDescription(rule: ClassificationRule): string {
  try {
    const cfg = JSON.parse(rule.config);
    if (rule.rule_type === "work_hours") {
      const wh = cfg as WorkHoursConfig;
      const dayLabels = wh.days
        .map((d) => DAYS.find((day) => day.value === d)?.short ?? "")
        .filter(Boolean)
        .join(", ");
      const classLabel = rule.classification === "business" ? "Business" : "Personal";
      return `${dayLabels || "No days"}, ${formatHour(wh.startHour)}-${formatHour(wh.endHour)} - ${classLabel}`;
    }
    if (rule.rule_type === "saved_location") {
      const sl = cfg as SavedLocationConfig;
      const dirLabel = sl.direction === "from" ? "From" : "To";
      const classLabel = rule.classification === "business" ? "Business" : "Personal";
      return `${dirLabel} ${sl.locationName || "location"} - ${classLabel}`;
    }
  } catch {
    // Fallback if config is malformed
  }
  return rule.rule_type === "work_hours" ? "Work hours rule" : "Saved location rule";
}

function ruleTypeIcon(ruleType: RuleType): keyof typeof Ionicons.glyphMap {
  return ruleType === "work_hours" ? "time-outline" : "location-outline";
}

function ruleTypeColor(ruleType: RuleType): string {
  return ruleType === "work_hours" ? AMBER : "#3b82f6";
}

function classificationColor(classification: Classification): string {
  return classification === "business" ? EMERALD : "#8b5cf6";
}

// ── Rule card ─────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: ClassificationRule;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const icon = ruleTypeIcon(rule.rule_type);
  const iconColor = ruleTypeColor(rule.rule_type);
  const classColor = classificationColor(rule.classification);
  const description = buildDescription(rule);
  const isEnabled = rule.enabled === 1;

  return (
    <View
      style={[s.card, !isEnabled && s.cardDisabled]}
      accessibilityRole="none"
      accessibilityLabel={`${rule.name}: ${description}. ${isEnabled ? "Enabled" : "Disabled"}`}
    >
      <View style={[s.cardIconWrap, { backgroundColor: `${iconColor}1a` }]}>
        <Ionicons name={icon} size={20} color={isEnabled ? iconColor : TEXT_3} />
      </View>

      <View style={s.cardBody}>
        <Text style={[s.cardName, !isEnabled && s.cardNameDisabled]} numberOfLines={1}>
          {rule.name}
        </Text>
        <Text style={s.cardDesc} numberOfLines={2}>
          {description}
        </Text>
        {rule.platform_tag && (
          <View style={s.platformTag}>
            <Text style={s.platformTagText}>
              {GIG_PLATFORMS.find((p) => p.value === rule.platform_tag)?.label ?? rule.platform_tag}
            </Text>
          </View>
        )}
      </View>

      <View style={s.cardRight}>
        <View style={[s.classBadge, { backgroundColor: `${classColor}1a` }]}>
          <Text style={[s.classBadgeText, { color: classColor }]}>
            {rule.classification === "business" ? "Biz" : "Personal"}
          </Text>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onToggle}
          trackColor={{ false: "#374151", true: "rgba(245, 166, 35, 0.4)" }}
          thumbColor={isEnabled ? AMBER : "#9ca3af"}
          accessibilityLabel={`${rule.name} ${isEnabled ? "enabled" : "disabled"}, tap to toggle`}
        />
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={s.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`Delete rule: ${rule.name}`}
        >
          <Ionicons name="close-circle-outline" size={22} color={TEXT_3} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Form state ────────────────────────────────────────────────────────

interface FormState {
  ruleType: RuleType;
  classification: Classification;
  platformTag: string;
  name: string;
  // Work hours
  selectedDays: number[];
  startHour: string;
  endHour: string;
  // Saved location
  direction: Direction;
  locationId: string;
  locationName: string;
}

const defaultForm = (): FormState => ({
  ruleType: "work_hours",
  classification: "business",
  platformTag: "",
  name: "",
  selectedDays: [1, 2, 3, 4, 5], // Mon-Fri default
  startHour: "9",
  endHour: "17",
  direction: "from",
  locationId: "",
  locationName: "",
});

// ── Add rule modal ─────────────────────────────────────────────────────

function AddRuleModal({
  visible,
  onClose,
  onSave,
  savedLocations,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  savedLocations: SavedLocationRow[];
}) {
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const resetAndClose = useCallback(() => {
    setForm(defaultForm());
    setShowLocationPicker(false);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    // Validation
    if (!form.name.trim()) {
      Alert.alert("Name required", "Please give this rule a name.");
      return;
    }
    if (form.ruleType === "work_hours") {
      if (form.selectedDays.length === 0) {
        Alert.alert("Days required", "Select at least one day.");
        return;
      }
      const start = parseInt(form.startHour, 10);
      const end = parseInt(form.endHour, 10);
      if (isNaN(start) || start < 0 || start > 23) {
        Alert.alert("Invalid start hour", "Enter a number between 0 and 23.");
        return;
      }
      if (isNaN(end) || end < 0 || end > 23) {
        Alert.alert("Invalid end hour", "Enter a number between 0 and 23.");
        return;
      }
      if (end <= start) {
        Alert.alert("Invalid hours", "End hour must be after start hour.");
        return;
      }
    }
    if (form.ruleType === "saved_location" && !form.locationId) {
      Alert.alert("Location required", "Please select a saved location.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      setForm(defaultForm());
      setShowLocationPicker(false);
    } finally {
      setSaving(false);
    }
  }, [form, onSave]);

  const toggleDay = useCallback((day: number) => {
    setForm((prev) => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(day)
        ? prev.selectedDays.filter((d) => d !== day)
        : [...prev.selectedDays, day],
    }));
  }, []);

  const selectLocation = useCallback((loc: SavedLocationRow) => {
    setForm((prev) => ({
      ...prev,
      locationId: loc.id,
      locationName: loc.name,
    }));
    setShowLocationPicker(false);
  }, []);

  if (showLocationPicker) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowLocationPicker(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Back to form"
            >
              <Ionicons name="arrow-back" size={22} color={TEXT_1} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Select Location</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            {savedLocations.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="location-outline" size={36} color={TEXT_3} />
                <Text style={s.emptyTitle}>No saved locations</Text>
                <Text style={s.emptyText}>
                  Add a location in Saved Locations first, then come back to create a rule.
                </Text>
              </View>
            ) : (
              savedLocations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    s.locationPickerRow,
                    form.locationId === loc.id && s.locationPickerRowSelected,
                  ]}
                  onPress={() => selectLocation(loc)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${loc.name}`}
                  accessibilityState={{ selected: form.locationId === loc.id }}
                >
                  <Ionicons name="location-outline" size={18} color={form.locationId === loc.id ? AMBER : TEXT_2} />
                  <Text
                    style={[
                      s.locationPickerText,
                      form.locationId === loc.id && s.locationPickerTextSelected,
                    ]}
                  >
                    {loc.name}
                  </Text>
                  {form.locationId === loc.id && (
                    <Ionicons name="checkmark-circle" size={18} color={AMBER} style={{ marginLeft: "auto" }} />
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        style={s.modalContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
      >
        {/* Header */}
        <View style={s.modalHeader}>
          <TouchableOpacity
            onPress={resetAndClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel, close form"
          >
            <Text style={s.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.modalTitle}>Add Rule</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Save rule"
            accessibilityState={{ disabled: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={AMBER} />
            ) : (
              <Text style={s.modalSave}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={s.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Rule type */}
          <Text style={s.fieldLabel}>Rule type</Text>
          <View style={s.chipRow}>
            {(["work_hours", "saved_location"] as RuleType[]).map((type) => {
              const isActive = form.ruleType === type;
              const label = type === "work_hours" ? "Work Hours" : "Saved Location";
              return (
                <TouchableOpacity
                  key={type}
                  style={[s.chip, isActive && s.chipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, ruleType: type }))}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons
                    name={type === "work_hours" ? "time-outline" : "location-outline"}
                    size={14}
                    color={isActive ? AMBER : TEXT_3}
                  />
                  <Text style={[s.chipText, isActive && s.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Classification */}
          <Text style={s.fieldLabel}>Classify trips as</Text>
          <View style={s.chipRow}>
            {(["business", "personal"] as Classification[]).map((cls) => {
              const isActive = form.classification === cls;
              const label = cls === "business" ? "Business" : "Personal";
              const activeColor = cls === "business" ? EMERALD : "#8b5cf6";
              return (
                <TouchableOpacity
                  key={cls}
                  style={[
                    s.chip,
                    isActive && { backgroundColor: `${activeColor}1a`, borderColor: `${activeColor}60` },
                  ]}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      classification: cls,
                      platformTag: cls === "personal" ? "" : prev.platformTag,
                    }))
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      s.chipText,
                      isActive && { color: activeColor, fontFamily: "PlusJakartaSans_600SemiBold" },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Platform tag (business only) */}
          {form.classification === "business" && (
            <>
              <Text style={s.fieldLabel}>Platform (optional)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.platformChipRow}
              >
                <TouchableOpacity
                  style={[s.chip, form.platformTag === "" && s.chipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, platformTag: "" }))}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="No platform tag"
                  accessibilityState={{ selected: form.platformTag === "" }}
                >
                  <Text style={[s.chipText, form.platformTag === "" && s.chipTextActive]}>None</Text>
                </TouchableOpacity>
                {GIG_PLATFORMS.map((p) => {
                  const isActive = form.platformTag === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[s.chip, isActive && s.chipActive]}
                      onPress={() => setForm((prev) => ({ ...prev, platformTag: p.value }))}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={p.label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text style={[s.chipText, isActive && s.chipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Rule name */}
          <Text style={s.fieldLabel}>Rule name</Text>
          <TextInput
            style={s.textInput}
            value={form.name}
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
            placeholder="e.g. Weekday deliveries"
            placeholderTextColor={TEXT_3}
            returnKeyType="done"
            accessibilityLabel="Rule name"
          />

          {/* Work hours config */}
          {form.ruleType === "work_hours" && (
            <>
              <Text style={s.fieldLabel}>Days</Text>
              <View style={s.dayGrid}>
                {DAYS.map((day) => {
                  const isActive = form.selectedDays.includes(day.value);
                  return (
                    <TouchableOpacity
                      key={day.value}
                      style={[s.dayChip, isActive && s.dayChipActive]}
                      onPress={() => toggleDay(day.value)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={day.label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text style={[s.dayChipText, isActive && s.dayChipTextActive]}>
                        {day.short}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.hourRow}>
                <View style={s.hourField}>
                  <Text style={s.fieldLabel}>Start hour</Text>
                  <TextInput
                    style={s.textInput}
                    value={form.startHour}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, startHour: v.replace(/[^0-9]/g, "") }))}
                    placeholder="9"
                    placeholderTextColor={TEXT_3}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="Start hour, 0 to 23"
                  />
                  <Text style={s.hourHint}>
                    {form.startHour !== "" && !isNaN(parseInt(form.startHour, 10))
                      ? formatHour(parseInt(form.startHour, 10))
                      : "0–23"}
                  </Text>
                </View>
                <View style={s.hourField}>
                  <Text style={s.fieldLabel}>End hour</Text>
                  <TextInput
                    style={s.textInput}
                    value={form.endHour}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, endHour: v.replace(/[^0-9]/g, "") }))}
                    placeholder="17"
                    placeholderTextColor={TEXT_3}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="End hour, 0 to 23"
                  />
                  <Text style={s.hourHint}>
                    {form.endHour !== "" && !isNaN(parseInt(form.endHour, 10))
                      ? formatHour(parseInt(form.endHour, 10))
                      : "0–23"}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Saved location config */}
          {form.ruleType === "saved_location" && (
            <>
              <Text style={s.fieldLabel}>Direction</Text>
              <View style={s.chipRow}>
                {(["from", "to"] as Direction[]).map((dir) => {
                  const isActive = form.direction === dir;
                  const label = dir === "from" ? "Trips from this location" : "Trips to this location";
                  const chipLabel = dir === "from" ? "From" : "To";
                  return (
                    <TouchableOpacity
                      key={dir}
                      style={[s.chip, isActive && s.chipActive]}
                      onPress={() => setForm((prev) => ({ ...prev, direction: dir }))}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Ionicons
                        name={dir === "from" ? "arrow-forward-outline" : "arrow-back-outline"}
                        size={14}
                        color={isActive ? AMBER : TEXT_3}
                      />
                      <Text style={[s.chipText, isActive && s.chipTextActive]}>{chipLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.fieldLabel}>Location</Text>
              <TouchableOpacity
                style={s.locationSelector}
                onPress={() => setShowLocationPicker(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  form.locationName
                    ? `Selected location: ${form.locationName}. Tap to change`
                    : "Select a saved location"
                }
              >
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={form.locationId ? AMBER : TEXT_3}
                />
                <Text
                  style={[
                    s.locationSelectorText,
                    form.locationId && s.locationSelectorTextSelected,
                  ]}
                >
                  {form.locationName || "Select a saved location"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
              </TouchableOpacity>
            </>
          )}

          {/* Bottom padding for keyboard */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────

export default function ClassificationRulesScreen() {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [ruleRows, locRows] = await Promise.all([
        db.getAllAsync<ClassificationRule>(
          "SELECT * FROM classification_rules ORDER BY priority DESC, created_at ASC"
        ),
        db.getAllAsync<SavedLocationRow>(
          "SELECT id, name, location_type FROM saved_locations ORDER BY name ASC"
        ),
      ]);
      setRules(ruleRows);
      setSavedLocations(locRows);
    } catch {
      // SQLite unavailable — leave empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleToggle = useCallback(async (rule: ClassificationRule) => {
    const next = rule.enabled === 1 ? 0 : 1;
    try {
      const db = await getDatabase();
      await db.runAsync(
        "UPDATE classification_rules SET enabled = ? WHERE id = ?",
        [next, rule.id]
      );
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r))
      );
    } catch {
      Alert.alert("Error", "Failed to update rule. Please try again.");
    }
  }, []);

  const handleDelete = useCallback((rule: ClassificationRule) => {
    Alert.alert(
      "Delete Rule",
      `Remove "${rule.name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await getDatabase();
              await db.runAsync("DELETE FROM classification_rules WHERE id = ?", [rule.id]);
              setRules((prev) => prev.filter((r) => r.id !== rule.id));
            } catch {
              Alert.alert("Error", "Failed to delete rule. Please try again.");
            }
          },
        },
      ]
    );
  }, []);

  const handleSave = useCallback(async (form: FormState) => {
    const now = new Date().toISOString();
    let config: WorkHoursConfig | SavedLocationConfig;
    if (form.ruleType === "work_hours") {
      config = {
        days: form.selectedDays,
        startHour: parseInt(form.startHour, 10),
        endHour: parseInt(form.endHour, 10),
      } satisfies WorkHoursConfig;
    } else {
      config = {
        locationId: form.locationId,
        locationName: form.locationName,
        direction: form.direction,
      } satisfies SavedLocationConfig;
    }

    const priority = rules.length; // newest rules get lowest priority initially
    const platformTag = form.platformTag || null;

    try {
      const db = await getDatabase();
      const result = await db.runAsync(
        `INSERT INTO classification_rules
           (rule_type, name, classification, platform_tag, config, priority, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          form.ruleType,
          form.name.trim(),
          form.classification,
          platformTag,
          JSON.stringify(config),
          priority,
          now,
        ]
      );
      const newRule: ClassificationRule = {
        id: result.lastInsertRowId as number,
        rule_type: form.ruleType,
        name: form.name.trim(),
        classification: form.classification,
        platform_tag: platformTag,
        config: JSON.stringify(config),
        priority,
        enabled: 1,
        created_at: now,
      };
      setRules((prev) => [newRule, ...prev]);
      setShowModal(false);
    } catch {
      Alert.alert("Error", "Failed to save rule. Please try again.");
      throw new Error("Save failed");
    }
  }, [rules.length]);

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: "Classification Rules" }} />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AMBER}
          />
        }
      >
        {/* Subtitle */}
        <Text style={s.subtitle}>
          Teach MileClear how to classify your trips automatically based on time, day, or departure location.
        </Text>

        {/* Rules list */}
        {!loading && rules.length === 0 && (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="options-outline" size={36} color={TEXT_3} />
            </View>
            <Text style={s.emptyTitle}>No rules yet</Text>
            <Text style={s.emptyText}>
              Add a rule to automatically classify trips during work hours or from your saved locations.
            </Text>
          </View>
        )}

        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onToggle={() => handleToggle(rule)}
            onDelete={() => handleDelete(rule)}
          />
        ))}

        {/* Section header when rules exist */}
        {rules.length > 0 && (
          <Text style={s.ruleCountHint}>
            {rules.length} rule{rules.length !== 1 ? "s" : ""} - applied in order from top to bottom
          </Text>
        )}

        {/* Add rule button */}
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Add classification rule"
        >
          <Ionicons name="add-circle-outline" size={20} color={AMBER} />
          <Text style={s.addBtnText}>Add Rule</Text>
        </TouchableOpacity>
      </ScrollView>

      <AddRuleModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        savedLocations={savedLocations}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 21,
    marginBottom: 20,
  },

  // Rule card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 12,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  cardNameDisabled: {
    color: TEXT_3,
  },
  cardDesc: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 17,
  },
  platformTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  platformTagText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  deleteBtn: {
    padding: 4,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textAlign: "center",
    lineHeight: 20,
  },

  // Rule count hint
  ruleCountHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },

  // Add button
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.25)",
    paddingVertical: 16,
  },
  addBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: BG,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  modalCancel: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  modalSave: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Form fields
  fieldLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 20,
  },
  textInput: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
  },

  // Chip row
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  chipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  chipText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_3,
  },
  chipTextActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },

  // Platform chip row (horizontal scroll)
  platformChipRow: {
    gap: 8,
    flexDirection: "row",
    paddingRight: 16,
  },

  // Day chips grid
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    minWidth: 52,
    alignItems: "center",
  },
  dayChipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  dayChipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
  },
  dayChipTextActive: {
    color: AMBER,
  },

  // Hour row
  hourRow: {
    flexDirection: "row",
    gap: 12,
  },
  hourField: {
    flex: 1,
  },
  hourHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 5,
    paddingLeft: 2,
  },

  // Location selector button
  locationSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  locationSelectorText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  locationSelectorTextSelected: {
    color: TEXT_1,
  },

  // Location picker list
  locationPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  locationPickerRowSelected: {
    borderColor: "rgba(245, 166, 35, 0.4)",
    backgroundColor: "rgba(245, 166, 35, 0.06)",
  },
  locationPickerText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  locationPickerTextSelected: {
    color: TEXT_1,
  },
});
