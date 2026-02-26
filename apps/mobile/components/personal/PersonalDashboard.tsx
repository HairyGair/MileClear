import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRecentTripsWithCoords } from "../../hooks/useRecentTripsWithCoords";
import { LiveMapTracker } from "../map/LiveMapTracker";
import { MapOverview } from "./MapOverview";
import { JourneyTimeline } from "./JourneyTimeline";

export function PersonalDashboard({ avatarId }: { avatarId?: string | null }) {
  const { trips, loading } = useRecentTripsWithCoords(5);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#f5a623" />
      </View>
    );
  }

  return (
    <View>
      <LiveMapTracker height={220} trailDefault={false} avatarId={avatarId} />
      <MapOverview trips={trips} />
      <JourneyTimeline trips={trips} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 40,
    alignItems: "center",
  },
});
