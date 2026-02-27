import { View, Text } from "react-native";

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#ff0000", justifyContent: "center", alignItems: "center" }}>
      <Text style={{ color: "#ffffff", fontSize: 32, fontWeight: "bold" }}>LAYOUT WORKS</Text>
      <Text style={{ color: "#ffffff", fontSize: 18, marginTop: 10 }}>Build 12 - Debug</Text>
    </View>
  );
}
