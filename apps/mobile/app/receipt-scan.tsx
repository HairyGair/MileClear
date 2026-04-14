import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { recognizeText, parseReceiptText, isOcrAvailable } from "../lib/ocr";

const BG = "#030712";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#9ca3af";
const SURFACE = "#0a1120";
const BORDER = "rgba(255,255,255,0.06)";

type ScanState = "idle" | "scanning" | "review";

export default function ReceiptScanScreen() {
  const router = useRouter();

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Editable extracted fields
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [vendor, setVendor] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState(0);

  const ocrAvailable = isOcrAvailable();

  // ── Image selection ──────────────────────────────────────────────────────────

  const processImage = useCallback(async (uri: string) => {
    setScanState("scanning");
    setImageUri(uri);

    try {
      const lines = await recognizeText(uri);
      const parsed = parseReceiptText(lines);

      setAmount(
        parsed.amountPence !== null
          ? (parsed.amountPence / 100).toFixed(2)
          : ""
      );
      setDate(parsed.date ?? "");
      setVendor(parsed.vendor ?? "");
      setOcrConfidence(parsed.confidence);
      setScanState("review");
    } catch {
      Alert.alert("Scan failed", "Could not read the image. Please try again.");
      setScanState("idle");
    }
  }, []);

  const handleCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera permission required",
        "Allow camera access in Settings to scan receipts."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  }, [processImage]);

  const handleLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Library permission required",
        "Allow photo library access in Settings to import receipts."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  }, [processImage]);

  // ── Navigate to earning form with pre-filled data ─────────────────────────

  const handleUseData = useCallback(() => {
    const params: Record<string, string> = {};
    if (amount.trim()) params.prefillAmount = amount.trim();
    if (date.trim()) params.prefillDate = date.trim();
    if (vendor.trim()) params.prefillVendor = vendor.trim();

    router.push({ pathname: "/earning-form", params });
  }, [amount, date, vendor, router]);

  const handleRetry = useCallback(() => {
    setImageUri(null);
    setAmount("");
    setDate("");
    setVendor("");
    setOcrConfidence(0);
    setScanState("idle");
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!ocrAvailable) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Scan Receipt" }} />
        <View style={styles.unavailableBox}>
          <Text style={styles.unavailableIcon}>📷</Text>
          <Text style={styles.unavailableTitle}>
            Receipt scanning requires a development build
          </Text>
          <Text style={styles.unavailableBody}>
            This feature uses Apple Vision for on-device text recognition and
            is not available in Expo Go. Build the app via EAS to use it.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Scan Receipt" }} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Idle: pick source ── */}
        {scanState === "idle" && (
          <View style={styles.idleBox}>
            <Text style={styles.idleHeading}>Scan a receipt</Text>
            <Text style={styles.idleSubheading}>
              Text recognition runs entirely on your device.
              Nothing is uploaded or shared.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleCamera}
              accessibilityRole="button"
              accessibilityLabel="Take a photo of a receipt"
            >
              <Text style={styles.primaryButtonText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleLibrary}
              accessibilityRole="button"
              accessibilityLabel="Choose a photo from your library"
            >
              <Text style={styles.secondaryButtonText}>Choose from Library</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Scanning: image + spinner ── */}
        {scanState === "scanning" && imageUri && (
          <View style={styles.scanningBox}>
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel="Receipt image being scanned"
            />
            <View style={styles.scanningOverlay}>
              <ActivityIndicator size="large" color={AMBER} />
              <Text style={styles.scanningLabel}>Reading receipt...</Text>
            </View>
          </View>
        )}

        {/* ── Review: editable extracted data ── */}
        {scanState === "review" && (
          <View>
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={styles.reviewThumbnail}
                resizeMode="cover"
                accessibilityLabel="Scanned receipt"
              />
            )}

            {ocrConfidence > 0 && (
              <Text style={styles.confidenceLabel}>
                Confidence: {Math.round(ocrConfidence * 100)}%
              </Text>
            )}

            <Text style={styles.fieldLabel}>Amount (GBP)</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencyPrefix} accessible={false}>
                PS
              </Text>
              <TextInput
                style={[styles.input, styles.amountInput]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={TEXT_2}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount in pounds"
              />
            </View>

            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-04-14"
              placeholderTextColor={TEXT_2}
              accessibilityLabel="Receipt date"
            />

            <Text style={styles.fieldLabel}>Vendor / Description</Text>
            <TextInput
              style={styles.input}
              value={vendor}
              onChangeText={setVendor}
              placeholder="Store or supplier name"
              placeholderTextColor={TEXT_2}
              accessibilityLabel="Vendor name"
            />

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 28 }]}
              onPress={handleUseData}
              accessibilityRole="button"
              accessibilityLabel="Use extracted data and open earning form"
            >
              <Text style={styles.primaryButtonText}>Use this data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { marginTop: 12 }]}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Try scanning again"
            >
              <Text style={styles.secondaryButtonText}>
                Not a receipt? Try again
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },

  // Unavailable state
  unavailableBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  unavailableIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  unavailableTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 12,
  },
  unavailableBody: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },

  // Idle state
  idleBox: {
    paddingTop: 32,
    alignItems: "stretch",
  },
  idleHeading: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    marginBottom: 8,
  },
  idleSubheading: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 22,
    marginBottom: 40,
  },

  // Scanning state
  scanningBox: {
    alignItems: "center",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: 400,
    borderRadius: 12,
  },
  scanningOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    borderRadius: 12,
    backgroundColor: "rgba(3,7,18,0.6)",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  scanningLabel: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },

  // Review state
  reviewThumbnail: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },
  confidenceLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 20,
  },

  // Form fields
  fieldLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    borderWidth: 1,
    borderColor: BORDER,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
  },

  // Buttons
  primaryButton: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
  },
});
