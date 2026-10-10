// Journey map: your recent routes on one map (Pro). Reached from the map
// button at the top of Trips. It used to be the "Recent Journeys" card on
// Home; Home no longer carries it (Oct 2026 redesign).

import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { PremiumGate } from "../components/PremiumGate";
import { MapOverview } from "../components/personal/MapOverview";
import { EmptyState } from "../components/EmptyState";
import { useRecentTripsWithCoords } from "../hooks/useRecentTripsWithCoords";
import { colors, fonts, spacing } from "../lib/theme";

export default function JourneyMapScreen() {
  const { trips, loading } = useRecentTripsWithCoords(10);
  const withRoutes = trips.filter((t) => t.coordinates.length >= 2);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PremiumGate feature="Journey Map">
        {loading && trips.length === 0 ? (
          <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Loading your journeys">
            <ActivityIndicator color={colors.amber} />
          </View>
        ) : withRoutes.length === 0 ? (
          <EmptyState
            icon="map-outline"
            title="No routes to show yet"
            description="Routes appear here once a recorded trip has a route on the map."
          />
        ) : (
          <>
            <MapOverview trips={withRoutes} title="Recent journeys" />
            <Text style={styles.note}>Your last {withRoutes.length} trips with a route. Tap the map to open it full screen.</Text>
          </>
        )}
      </PremiumGate>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  loading: { paddingVertical: 48, alignItems: "center" },
  note: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: spacing.sm },
});
