import React from "react";
import { View, Text } from "react-native";

// ---------------------------------------------------------------------------
// Vehicle avatar system — pure React Native Views (no native SVG dependency)
// Each avatar is a coloured circle with a vehicle emoji.
// Works everywhere: Expo Go, dev builds, production.
// ---------------------------------------------------------------------------

interface AvatarDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export const AVATARS: AvatarDef[] = [
  { id: "sedan-red", label: "Red Sedan", emoji: "\uD83D\uDE97", color: "#e53e3e" },
  { id: "suv-blue", label: "Blue SUV", emoji: "\uD83D\uDE99", color: "#3182ce" },
  { id: "taxi-yellow", label: "Yellow Taxi", emoji: "\uD83D\uDE95", color: "#d69e2e" },
  { id: "hatchback-green", label: "Green Hatch", emoji: "\uD83D\uDE97", color: "#38a169" },
  { id: "sports-orange", label: "Sports Car", emoji: "\uD83C\uDFCE\uFE0F", color: "#dd6b20" },
  { id: "muscle-purple", label: "Muscle Car", emoji: "\uD83D\uDE97", color: "#805ad5" },
  { id: "convertible-pink", label: "Convertible", emoji: "\uD83D\uDE97", color: "#d53f8c" },
  { id: "van-white", label: "Delivery Van", emoji: "\uD83D\uDE90", color: "#a0aec0" },
  { id: "pickup-black", label: "Pickup Truck", emoji: "\uD83D\uDEFB", color: "#4a5568" },
  { id: "motorcycle-silver", label: "Motorcycle", emoji: "\uD83C\uDFCD\uFE0F", color: "#718096" },
  { id: "bus-red", label: "Double Decker", emoji: "\uD83D\uDE8C", color: "#c53030" },
  { id: "racer-blue", label: "Racing Car", emoji: "\uD83C\uDFCE\uFE0F", color: "#2b6cb0" },
  { id: "schoolbus-yellow", label: "School Bus", emoji: "\uD83D\uDE8C", color: "#b7791f" },
  { id: "electric-green", label: "Electric Car", emoji: "\u26A1", color: "#2f855a" },
  { id: "monster-orange", label: "Monster Truck", emoji: "\uD83D\uDE9A", color: "#c05621" },
  { id: "f1-teal", label: "F1 Car", emoji: "\uD83C\uDFCE\uFE0F", color: "#319795" },
  { id: "luxury-gold", label: "Luxury Car", emoji: "\uD83D\uDE97", color: "#b7791f" },
  { id: "jeep-brown", label: "Jeep", emoji: "\uD83D\uDE99", color: "#8B4513" },
  { id: "ambulance-navy", label: "Ambulance", emoji: "\uD83D\uDE91", color: "#2a4365" },
  { id: "firetruck-red", label: "Fire Truck", emoji: "\uD83D\uDE92", color: "#e53e3e" },
  { id: "gokart-lime", label: "Go-Kart", emoji: "\uD83C\uDFCE\uFE0F", color: "#84cc16" },
  { id: "minivan-indigo", label: "Minivan", emoji: "\uD83D\uDE90", color: "#5a67d8" },
  { id: "scooter-rose", label: "Scooter", emoji: "\uD83D\uDEF5", color: "#ed64a6" },
  { id: "icecream-cyan", label: "Ice Cream Van", emoji: "\uD83C\uDF66", color: "#00b5d8" },
  { id: "limo-magenta", label: "Limousine", emoji: "\uD83D\uDE97", color: "#9f1239" },
  { id: "military-olive", label: "Military Jeep", emoji: "\uD83D\uDE99", color: "#6b7821" },
  { id: "beetle-coral", label: "VW Beetle", emoji: "\uD83D\uDE97", color: "#f56565" },
  { id: "camper-turquoise", label: "Camper Van", emoji: "\uD83D\uDE90", color: "#0d9488" },
  { id: "classic-maroon", label: "Classic Car", emoji: "\uD83D\uDE97", color: "#7b341e" },
  { id: "tesla-electric", label: "Tesla", emoji: "\u26A1", color: "#0ea5e9" },
];

export function getAvatarById(id: string): AvatarDef | undefined {
  return AVATARS.find((a) => a.id === id);
}

interface AvatarIconProps {
  avatarId: string;
  size: number;
}

export function AvatarIcon({ avatarId, size }: AvatarIconProps) {
  const avatar = getAvatarById(avatarId);
  const bg = avatar?.color ?? "#f5a623";
  const emoji = avatar?.emoji ?? "\uD83D\uDE97";

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.2)",
      }}
    >
      <Text style={{ fontSize: size * 0.5, textAlign: "center" }}>
        {emoji}
      </Text>
    </View>
  );
}
