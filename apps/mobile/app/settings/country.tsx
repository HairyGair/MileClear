import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CountryList } from "../../components/country/CountryList";
import { useCountry } from "../../lib/country/country";
import { pickCountry } from "../../lib/country/pick";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

/** Settings > Country (23 Oct 2026). Decides which UK-only features show. */
export default function CountrySettings() {
  const router = useRouter();
  const country = useCountry();
  const onPick = useCallback(
    async (code: string) => {
      await pickCountry(code);
      router.back();
    },
    [router]
  );

  return (
    <View style={styles.root}>
      <CountryList
        selected={country}
        onPick={onPick}
        header={
          <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
            Recording and your trips work everywhere. Tax figures and the UK features (HMRC, Self Assessment,
            DVLA, fuel prices, roadworks) only show for the UK for now.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  note: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
});
