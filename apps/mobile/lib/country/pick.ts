// What happens when a driver picks a country (Settings > Country, or the
// one-off "Where do you drive?" step). Saves it, then, if that country uses
// kilometres and the app shows miles, asks once. Never changes units silently.
import { Alert } from "react-native";
import { countryByCode } from "@mileclear/shared";
import { chooseCountry, currentCountry } from "./country";
import { chooseDistanceUnit, currentDistanceUnit } from "../units/distanceUnit";

export async function pickCountry(code: string): Promise<void> {
  const before = currentCountry();
  await chooseCountry(code);
  const c = countryByCode(code);
  if (!c || !c.usesKm || c.code === before || currentDistanceUnit() === "km") return;
  await new Promise<void>((resolve) => {
    Alert.alert(
      "Show distances in kilometres?",
      `Roads in ${c.name} use kilometres. You can change this any time in Settings > Distances.`,
      [
        { text: "Keep miles", style: "cancel", onPress: () => resolve() },
        { text: "Yes", onPress: () => void chooseDistanceUnit("km").finally(resolve) },
      ],
      { cancelable: true, onDismiss: () => resolve() }
    );
  });
}
