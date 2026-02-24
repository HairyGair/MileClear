import { Stack, useRouter } from "expo-router";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AvatarMenuButton from "../../components/AvatarMenuButton";

function HeaderAddButton({ route }: { route: string }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push(route as any)}
      hitSlop={8}
      style={headerStyles.addBtn}
    >
      <Ionicons name="add" size={20} color="#f5a623" />
    </TouchableOpacity>
  );
}

const headerStyles = StyleSheet.create({
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(245,166,35,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});

function BrandHeader() {
  return (
    <View style={brandStyles.row}>
      <Image
        source={require("../../assets/branding/logo-original.png")}
        style={brandStyles.icon}
        resizeMode="contain"
      />
      <Text style={brandStyles.nameWhite}>Mile</Text>
      <Text style={brandStyles.nameAmber}>Clear</Text>
    </View>
  );
}

const brandStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 8,
  },
  nameWhite: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  nameAmber: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
});

const HEADER_BG = { backgroundColor: "#030712" } as const;

function HeaderRightWithAdd({ route }: { route: string }) {
  return (
    <View style={headerStyles.rightRow}>
      <HeaderAddButton route={route} />
      <AvatarMenuButton />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: HEADER_BG,
        headerTintColor: "#f0f2f5",
        headerTitleStyle: { fontFamily: "PlusJakartaSans_300Light", color: "#f0f2f5" },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTitle: () => <BrandHeader />,
        headerRight: () => <AvatarMenuButton />,
        animation: "fade",
      }}
    >
      <Stack.Screen name="dashboard" />
      <Stack.Screen
        name="trips"
        options={{
          headerRight: () => <HeaderRightWithAdd route="/trip-form" />,
        }}
      />
      <Stack.Screen
        name="fuel"
        options={{
          headerRight: () => <HeaderRightWithAdd route="/fuel-form" />,
        }}
      />
      <Stack.Screen
        name="earnings"
        options={{
          headerRight: () => <HeaderRightWithAdd route="/earning-form" />,
        }}
      />
      <Stack.Screen name="profile" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}
