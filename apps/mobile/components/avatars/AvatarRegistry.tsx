import React from "react";
import { View, Image, ImageSourcePropType } from "react-native";

// ---------------------------------------------------------------------------
// Vehicle avatar system — AI-generated PNG images (Gemini Flash)
// Each avatar is a flat cartoon vehicle on a coloured circular background.
// Works everywhere: Expo Go, dev builds, production.
// ---------------------------------------------------------------------------

// Static require() calls — Metro needs these at compile time
const AVATAR_IMAGES: Record<string, ImageSourcePropType> = {
  "sedan-red": require("../../assets/avatars/avatar-01.png"),
  "suv-blue": require("../../assets/avatars/avatar-02.png"),
  "taxi-yellow": require("../../assets/avatars/avatar-03.png"),
  "hatchback-green": require("../../assets/avatars/avatar-04.png"),
  "sports-orange": require("../../assets/avatars/avatar-05.png"),
  "muscle-purple": require("../../assets/avatars/avatar-06.png"),
  "convertible-pink": require("../../assets/avatars/avatar-07.png"),
  "van-white": require("../../assets/avatars/avatar-08.png"),
  "pickup-black": require("../../assets/avatars/avatar-09.png"),
  "motorcycle-silver": require("../../assets/avatars/avatar-10.png"),
  "bus-red": require("../../assets/avatars/avatar-11.png"),
  "racer-blue": require("../../assets/avatars/avatar-12.png"),
  "schoolbus-yellow": require("../../assets/avatars/avatar-13.png"),
  "electric-green": require("../../assets/avatars/avatar-14.png"),
  "monster-orange": require("../../assets/avatars/avatar-15.png"),
  "f1-teal": require("../../assets/avatars/avatar-16.png"),
  "luxury-gold": require("../../assets/avatars/avatar-17.png"),
  "jeep-brown": require("../../assets/avatars/avatar-18.png"),
  "ambulance-navy": require("../../assets/avatars/avatar-19.png"),
  "firetruck-red": require("../../assets/avatars/avatar-20.png"),
  "gokart-lime": require("../../assets/avatars/avatar-21.png"),
  "minivan-indigo": require("../../assets/avatars/avatar-22.png"),
  "scooter-rose": require("../../assets/avatars/avatar-23.png"),
  "icecream-cyan": require("../../assets/avatars/avatar-24.png"),
  "limo-magenta": require("../../assets/avatars/avatar-25.png"),
  "military-olive": require("../../assets/avatars/avatar-26.png"),
  "beetle-coral": require("../../assets/avatars/avatar-27.png"),
  "camper-turquoise": require("../../assets/avatars/avatar-28.png"),
  "classic-maroon": require("../../assets/avatars/avatar-29.png"),
  "tesla-electric": require("../../assets/avatars/avatar-30.png"),
};

interface AvatarDef {
  id: string;
  label: string;
  image: ImageSourcePropType;
}

export const AVATARS: AvatarDef[] = [
  { id: "sedan-red", label: "Red Sedan", image: AVATAR_IMAGES["sedan-red"] },
  { id: "suv-blue", label: "Blue SUV", image: AVATAR_IMAGES["suv-blue"] },
  { id: "taxi-yellow", label: "Yellow Taxi", image: AVATAR_IMAGES["taxi-yellow"] },
  { id: "hatchback-green", label: "Green Hatch", image: AVATAR_IMAGES["hatchback-green"] },
  { id: "sports-orange", label: "Sports Car", image: AVATAR_IMAGES["sports-orange"] },
  { id: "muscle-purple", label: "Muscle Car", image: AVATAR_IMAGES["muscle-purple"] },
  { id: "convertible-pink", label: "Convertible", image: AVATAR_IMAGES["convertible-pink"] },
  { id: "van-white", label: "Delivery Van", image: AVATAR_IMAGES["van-white"] },
  { id: "pickup-black", label: "Pickup Truck", image: AVATAR_IMAGES["pickup-black"] },
  { id: "motorcycle-silver", label: "Motorcycle", image: AVATAR_IMAGES["motorcycle-silver"] },
  { id: "bus-red", label: "Double Decker", image: AVATAR_IMAGES["bus-red"] },
  { id: "racer-blue", label: "Racing Car", image: AVATAR_IMAGES["racer-blue"] },
  { id: "schoolbus-yellow", label: "School Bus", image: AVATAR_IMAGES["schoolbus-yellow"] },
  { id: "electric-green", label: "Electric Car", image: AVATAR_IMAGES["electric-green"] },
  { id: "monster-orange", label: "Monster Truck", image: AVATAR_IMAGES["monster-orange"] },
  { id: "f1-teal", label: "F1 Car", image: AVATAR_IMAGES["f1-teal"] },
  { id: "luxury-gold", label: "Luxury Car", image: AVATAR_IMAGES["luxury-gold"] },
  { id: "jeep-brown", label: "Jeep", image: AVATAR_IMAGES["jeep-brown"] },
  { id: "ambulance-navy", label: "Ambulance", image: AVATAR_IMAGES["ambulance-navy"] },
  { id: "firetruck-red", label: "Fire Truck", image: AVATAR_IMAGES["firetruck-red"] },
  { id: "gokart-lime", label: "Go-Kart", image: AVATAR_IMAGES["gokart-lime"] },
  { id: "minivan-indigo", label: "Minivan", image: AVATAR_IMAGES["minivan-indigo"] },
  { id: "scooter-rose", label: "Scooter", image: AVATAR_IMAGES["scooter-rose"] },
  { id: "icecream-cyan", label: "Ice Cream Van", image: AVATAR_IMAGES["icecream-cyan"] },
  { id: "limo-magenta", label: "Limousine", image: AVATAR_IMAGES["limo-magenta"] },
  { id: "military-olive", label: "Military Jeep", image: AVATAR_IMAGES["military-olive"] },
  { id: "beetle-coral", label: "VW Beetle", image: AVATAR_IMAGES["beetle-coral"] },
  { id: "camper-turquoise", label: "Camper Van", image: AVATAR_IMAGES["camper-turquoise"] },
  { id: "classic-maroon", label: "Classic Car", image: AVATAR_IMAGES["classic-maroon"] },
  { id: "tesla-electric", label: "Tesla", image: AVATAR_IMAGES["tesla-electric"] },
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
  const source = avatar?.image ?? AVATAR_IMAGES["sedan-red"];

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
      }}
    >
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="cover"
      />
    </View>
  );
}
