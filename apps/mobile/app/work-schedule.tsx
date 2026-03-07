import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  getSchedule,
  setScheduleSlot,
  removeScheduleSlot,
  getScheduleSetting,
  setScheduleSetting,
  dayName,
  dayNameShort,
  type ScheduleSlot,
  type ScheduleSetting,
} from "../lib/schedule/index";
import { scheduleShiftReminders } from "../lib/notifications/index";

// ── Constants ──────────────────────────────────────────────────────

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const GREEN = "#10b981";

// Days ordered Mon–Sun for UK users
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function parseTime(str: string): Date {
  const [h, m] = str.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimeDisplay(str: string): string {
  const [h, m] = str.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m}${ampm}`;
}

// ── Component ──────────────────────────────────────────────────────

export default function WorkScheduleScreen() {
  const [slots, setSlots] = useState<Map<number, ScheduleSlot>>(new Map());
  const [autoClassify, setAutoClassify] = useState(true);
  const [autoMode, setAutoMode] = useState(false);
  const [reminder, setReminder] = useState(true);
  const [loading, setLoading] = useState(true);

  // Time picker state
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"start" | "end" | null>(null);
  const [pickerDate, setPickerDate] = useState(new Date());

  // ── Load data ──────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const [schedule, ac, am, rem] = await Promise.all([
        getSchedule(),
        getScheduleSetting("schedule_auto_classify"),
        getScheduleSetting("schedule_auto_mode"),
        getScheduleSetting("schedule_reminder"),
      ]);

      const map = new Map<number, ScheduleSlot>();
      for (const s of schedule) {
        map.set(s.dayOfWeek, s);
      }
      setSlots(map);
      setAutoClassify(ac);
      setAutoMode(am);
      setReminder(rem);
      setLoading(false);
    })();
  }, []);

  // ── Toggle day ─────────────────────────────────────────────────

  const toggleDay = useCallback(
    async (day: number) => {
      const existing = slots.get(day);
      if (existing) {
        await removeScheduleSlot(day);
        const next = new Map(slots);
        next.delete(day);
        setSlots(next);
      } else {
        const slot: ScheduleSlot = {
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "17:00",
          enabled: true,
        };
        await setScheduleSlot(slot);
        const next = new Map(slots);
        next.set(day, slot);
        setSlots(next);
      }
      scheduleShiftReminders();
    },
    [slots]
  );

  // ── Toggle slot enabled ────────────────────────────────────────

  const toggleSlotEnabled = useCallback(
    async (day: number) => {
      const existing = slots.get(day);
      if (!existing) return;
      const updated = { ...existing, enabled: !existing.enabled };
      await setScheduleSlot(updated);
      const next = new Map(slots);
      next.set(day, updated);
      setSlots(next);
    },
    [slots]
  );

  // ── Time editing ───────────────────────────────────────────────

  const openTimePicker = useCallback(
    (day: number, field: "start" | "end") => {
      const slot = slots.get(day);
      if (!slot) return;
      const timeStr = field === "start" ? slot.startTime : slot.endTime;
      setPickerDate(parseTime(timeStr));
      setEditingDay(day);
      setEditingField(field);
    },
    [slots]
  );

  const onTimeChange = useCallback(
    async (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        setEditingDay(null);
        setEditingField(null);
      }

      if (event.type === "dismissed" || !date || editingDay === null || !editingField) {
        setEditingDay(null);
        setEditingField(null);
        return;
      }

      const timeStr = formatTime(date);
      const slot = slots.get(editingDay);
      if (!slot) return;

      const updated = { ...slot };
      if (editingField === "start") {
        if (timeStr >= updated.endTime) {
          Alert.alert("Invalid time", "Start time must be before end time.");
          return;
        }
        updated.startTime = timeStr;
      } else {
        if (timeStr <= updated.startTime) {
          Alert.alert("Invalid time", "End time must be after start time.");
          return;
        }
        updated.endTime = timeStr;
      }

      await setScheduleSlot(updated);
      const next = new Map(slots);
      next.set(editingDay, updated);
      setSlots(next);

      if (Platform.OS === "ios") {
        setPickerDate(date);
      }
    },
    [slots, editingDay, editingField]
  );

  const dismissPicker = useCallback(() => {
    setEditingDay(null);
    setEditingField(null);
  }, []);

  // ── Settings toggles ──────────────────────────────────────────

  const handleSettingToggle = useCallback(
    async (key: ScheduleSetting, value: boolean) => {
      await setScheduleSetting(key, value);
      if (key === "schedule_auto_classify") setAutoClassify(value);
      if (key === "schedule_auto_mode") setAutoMode(value);
      if (key === "schedule_reminder") {
        setReminder(value);
        scheduleShiftReminders();
      }
    },
    []
  );

  // ── Render ─────────────────────────────────────────────────────

  if (loading) return <View style={s.container} />;

  const hasAnySlots = slots.size > 0;

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: "Work Schedule" }} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.subtitle}>
          Set your regular work hours. Trips during these times can be auto-classified as business.
        </Text>

        {/* Day selector — quick toggle */}
        <View style={s.dayRow}>
          {DAY_ORDER.map((day) => {
            const active = slots.has(day);
            return (
              <TouchableOpacity
                key={day}
                style={[s.dayChip, active && s.dayChipActive]}
                onPress={() => toggleDay(day)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${dayName(day)}: ${active ? "work day, tap to remove" : "not a work day, tap to add"}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.dayChipText, active && s.dayChipTextActive]}>
                  {dayNameShort(day)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Per-day time slots */}
        {hasAnySlots && (
          <View style={s.slotsSection}>
            {DAY_ORDER.filter((d) => slots.has(d)).map((day) => {
              const slot = slots.get(day)!;
              return (
                <View key={day} style={[s.slotCard, !slot.enabled && s.slotCardDisabled]}>
                  <View style={s.slotHeader}>
                    <Text style={[s.slotDay, !slot.enabled && s.slotDayDisabled]}>
                      {dayName(day)}
                    </Text>
                    <Switch
                      value={slot.enabled}
                      onValueChange={() => toggleSlotEnabled(day)}
                      trackColor={{ false: "#374151", true: "rgba(245, 166, 35, 0.4)" }}
                      thumbColor={slot.enabled ? AMBER : "#9ca3af"}
                      accessibilityLabel={`${dayName(day)} schedule ${slot.enabled ? "enabled" : "disabled"}`}
                    />
                  </View>

                  <View style={s.timeRow}>
                    <TouchableOpacity
                      style={s.timeButton}
                      onPress={() => openTimePicker(day, "start")}
                      activeOpacity={0.7}
                      disabled={!slot.enabled}
                      accessibilityRole="button"
                      accessibilityLabel={`${dayName(day)} start time: ${formatTimeDisplay(slot.startTime)}. Tap to change`}
                      accessibilityState={{ disabled: !slot.enabled }}
                    >
                      <Ionicons name="time-outline" size={14} color={slot.enabled ? AMBER : TEXT_3} />
                      <Text style={[s.timeText, !slot.enabled && s.timeTextDisabled]}>
                        {formatTimeDisplay(slot.startTime)}
                      </Text>
                    </TouchableOpacity>

                    <Text style={s.timeSep}>to</Text>

                    <TouchableOpacity
                      style={s.timeButton}
                      onPress={() => openTimePicker(day, "end")}
                      activeOpacity={0.7}
                      disabled={!slot.enabled}
                      accessibilityRole="button"
                      accessibilityLabel={`${dayName(day)} end time: ${formatTimeDisplay(slot.endTime)}. Tap to change`}
                      accessibilityState={{ disabled: !slot.enabled }}
                    >
                      <Ionicons name="time-outline" size={14} color={slot.enabled ? AMBER : TEXT_3} />
                      <Text style={[s.timeText, !slot.enabled && s.timeTextDisabled]}>
                        {formatTimeDisplay(slot.endTime)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!hasAnySlots && (
          <View style={s.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color={TEXT_3} />
            <Text style={s.emptyText}>
              Tap the days above to set your work hours
            </Text>
          </View>
        )}

        {/* Time picker (iOS inline, Android modal) */}
        {editingDay !== null && editingField && (
          <>
            {Platform.OS === "ios" && (
              <View style={s.pickerWrap}>
                <View style={s.pickerHeader}>
                  <Text style={s.pickerLabel}>
                    {dayName(editingDay)} — {editingField === "start" ? "Start" : "End"} time
                  </Text>
                  <TouchableOpacity onPress={dismissPicker} accessibilityRole="button" accessibilityLabel="Done, close time picker">
                    <Text style={s.pickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  onChange={onTimeChange}
                  minuteInterval={5}
                  textColor={TEXT_1}
                />
              </View>
            )}
            {Platform.OS === "android" && (
              <DateTimePicker
                value={pickerDate}
                mode="time"
                display="default"
                onChange={onTimeChange}
                minuteInterval={5}
              />
            )}
          </>
        )}

        {/* Settings */}
        {hasAnySlots && (
          <>
            <Text style={s.settingsTitle}>Schedule Settings</Text>

            <View style={s.settingCard}>
              <View style={s.settingRow}>
                <View style={s.settingBody}>
                  <Text style={s.settingLabel}>Auto-classify trips</Text>
                  <Text style={s.settingHint}>
                    Trips during work hours are automatically classified as business
                  </Text>
                </View>
                <Switch
                  value={autoClassify}
                  onValueChange={(v) => handleSettingToggle("schedule_auto_classify", v)}
                  trackColor={{ false: "#374151", true: "rgba(245, 166, 35, 0.4)" }}
                  thumbColor={autoClassify ? AMBER : "#9ca3af"}
                  accessibilityLabel="Auto-classify trips during work hours as business"
                />
              </View>

              <View style={s.settingDivider} />

              <View style={s.settingRow}>
                <View style={s.settingBody}>
                  <Text style={s.settingLabel}>Auto-switch mode</Text>
                  <Text style={s.settingHint}>
                    Dashboard switches to Work mode during scheduled hours
                  </Text>
                </View>
                <Switch
                  value={autoMode}
                  onValueChange={(v) => handleSettingToggle("schedule_auto_mode", v)}
                  trackColor={{ false: "#374151", true: "rgba(245, 166, 35, 0.4)" }}
                  thumbColor={autoMode ? AMBER : "#9ca3af"}
                  accessibilityLabel="Auto-switch dashboard to Work mode during scheduled hours"
                />
              </View>

              <View style={s.settingDivider} />

              <View style={s.settingRow}>
                <View style={s.settingBody}>
                  <Text style={s.settingLabel}>Shift reminder</Text>
                  <Text style={s.settingHint}>
                    Get a notification 10 minutes before your scheduled start
                  </Text>
                </View>
                <Switch
                  value={reminder}
                  onValueChange={(v) => handleSettingToggle("schedule_reminder", v)}
                  trackColor={{ false: "#374151", true: "rgba(245, 166, 35, 0.4)" }}
                  thumbColor={reminder ? AMBER : "#9ca3af"}
                  accessibilityLabel="Shift reminder notification 10 minutes before scheduled start"
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 21,
    marginBottom: 24,
  },

  // Day row
  dayRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 20,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  dayChipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  dayChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
  },
  dayChipTextActive: {
    color: AMBER,
  },

  // Slots section
  slotsSection: {
    gap: 10,
    marginBottom: 24,
  },
  slotCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
  },
  slotCardDisabled: {
    opacity: 0.5,
  },
  slotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  slotDay: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  slotDayDisabled: {
    color: TEXT_3,
  },

  // Time row
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timeText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  timeTextDisabled: {
    color: TEXT_3,
  },
  timeSep: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },

  // Empty state
  emptyCard: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textAlign: "center",
  },

  // Time picker
  pickerWrap: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 20,
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  pickerLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  pickerDone: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },

  // Settings
  settingsTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingBody: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    marginBottom: 2,
  },
  settingHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    lineHeight: 17,
  },
  settingDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginVertical: 12,
  },
});
