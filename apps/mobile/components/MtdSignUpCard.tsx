import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, fonts } from "../lib/theme";
import { GOVUK_MTD_SIGN_UP, forgetSignedUp, hasSaidSignedUp, rememberSignedUp } from "../lib/tax/mtdSignUp";

/**
 * "Signed up for Making Tax Digital with HMRC?" on the quarterly updates
 * screen. A "Yes" is remembered and the card never shows again; "Not yet"
 * says what HMRC asks for and opens HMRC's sign-up page. When HMRC has
 * refused because the driver isn't signed up (`notSignedUp`), the card says
 * so whatever was answered before, and forgets the "Yes".
 */
export function MtdSignUpCard({ userId, notSignedUp = false }: { userId: string | null; notSignedUp?: boolean }) {
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!userId) return;
    if (notSignedUp) {
      void forgetSignedUp(userId);
      setAnswered(false);
      return;
    }
    hasSaidSignedUp(userId).then((yes) => {
      if (alive) setAnswered(yes);
    });
    return () => {
      alive = false;
    };
  }, [userId, notSignedUp]);

  if (!userId || answered === null) return null;
  if (answered && !notSignedUp) return null;

  const openSignUp = () => {
    void WebBrowser.openBrowserAsync(GOVUK_MTD_SIGN_UP);
  };

  return (
    <View style={[styles.card, notSignedUp && styles.cardWarn]} accessibilityLabel="Signed up for Making Tax Digital with HMRC?">
      {notSignedUp ? (
        <>
          <View style={styles.titleRow}>
            <Ionicons name="alert-circle" size={20} color={colors.amber} accessible={false} />
            <Text style={styles.title}>HMRC doesn't have you signed up yet</Text>
          </View>
          <Text style={styles.body}>
            HMRC only takes quarterly updates once you've signed up for Making Tax Digital for Income Tax. It's
            free and you do it once on GOV.UK. If you have signed up, check the National Insurance Number you
            entered is yours (to change it, tap Disconnect and connect again). Then pull down to refresh.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>Signed up for Making Tax Digital with HMRC?</Text>
          <Text style={styles.body}>
            HMRC only takes quarterly updates once you've signed up. It's free and you do it once on GOV.UK.
          </Text>
          {!showHow && (
            <View style={styles.buttons}>
              <TouchableOpacity
                style={styles.primary}
                onPress={() => {
                  setAnswered(true);
                  void rememberSignedUp(userId);
                }}
                accessibilityRole="button"
                accessibilityLabel="Yes, I've signed up"
              >
                <Text style={styles.primaryText}>Yes, I have</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondary}
                onPress={() => setShowHow(true)}
                accessibilityRole="button"
                accessibilityLabel="Not yet"
              >
                <Text style={styles.secondaryText}>Not yet</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {(showHow || notSignedUp) && (
        <>
          <Text style={styles.small}>HMRC will ask for:</Text>
          {[
            "Your Government Gateway user ID and password",
            "Your National Insurance Number",
            "To be registered for Self Assessment, with a tax return sent in the last 2 years",
          ].map((line) => (
            <Text key={line} style={styles.small}>• {line}</Text>
          ))}
          <TouchableOpacity style={[styles.primary, { marginTop: 8 }]} onPress={openSignUp} accessibilityRole="link" accessibilityLabel="Sign up on GOV.UK">
            <Text style={styles.primaryText}>Sign up on GOV.UK</Text>
            <Ionicons name="open-outline" size={16} color="#000" />
          </TouchableOpacity>
          {!notSignedUp && (
            <TouchableOpacity
              onPress={() => {
                setAnswered(true);
                void rememberSignedUp(userId);
              }}
              accessibilityRole="button"
              accessibilityLabel="I've signed up now"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.link}>I've signed up now ›</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, gap: 6 },
  cardWarn: { borderWidth: 1, borderColor: colors.amber },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text1, fontSize: 16, fontFamily: fonts.bold, flexShrink: 1 },
  body: { color: colors.text2, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  small: { color: colors.text3, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  buttons: { flexDirection: "row", gap: 10, marginTop: 8 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  primaryText: { color: "#000", fontSize: 15, fontFamily: fonts.semibold },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.text3,
  },
  secondaryText: { color: colors.text1, fontSize: 15, fontFamily: fonts.semibold },
  link: { color: colors.amber, fontSize: 13, fontFamily: fonts.semibold, marginTop: 6 },
});
