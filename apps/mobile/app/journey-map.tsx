// Journey map: your recent routes on one map (Pro). Reached from the map
// button at the top of Trips and from a recorded trip's route. It used to be
// the "Recent Journeys" card on Home; Home no longer carries it (Oct 2026
// redesign).
//
// Free drivers see their own last FREE_PREVIEW routes and what Pro adds,
// not a bare lock card: Journey Map came just before more purchases than any
// other Pro feature (26 Oct 2026), and their own map is the best pitch for it.

import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { PremiumTeaser } from "../components/PremiumGate";
import { MapOverview } from "../components/personal/MapOverview";
import { EmptyState } from "../components/EmptyState";
import { useRecentTripsWithCoords } from "../hooks/useRecentTripsWithCoords";
import { useUser } from "../lib/user/context";
import { colors, fonts, spacing } from "../lib/theme";

const PRO_COUNT = 10;
const FREE_PREVIEW = 3;

export default function JourneyMapScreen() {
  const { user } = useUser();
  const isPro = !!user?.isPremium;
  // The same fetch for both, so a Pro status that loads late never starts a
  // second load; free keeps the first FREE_PREVIEW with a route, so manual
  // entries among the latest trips don't empty the preview.
  const { trips, loading } = useRecentTripsWithCoords(PRO_COUNT);
  const withRoutes = trips
    .filter((t) => t.coordinates.length >= 2)
    .slice(0, isPro ? PRO_COUNT : FREE_PREVIEW);

  if (loading && trips.length === 0) {
    return (
      <View style={[styles.container, styles.loading]} accessibilityRole="progressbar" accessibilityLabel="Loading your journeys">
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (!isPro) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {withRoutes.length > 0 && (
          <>
            <MapOverview
              trips={withRoutes}
              title={withRoutes.length === 1 ? "Your last route" : `Your last ${withRoutes.length} routes`}
            />
            <Text style={styles.note}>
              Pro puts your last {PRO_COUNT} routes together on one map, so you can see where your driving goes.
            </Text>
          </>
        )}
        <View style={withRoutes.length > 0 ? styles.teaser : undefined}>
          <PremiumTeaser feature="Journey Map" />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {withRoutes.length === 0 ? (
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  loading: { paddingVertical: 48, alignItems: "center" },
  teaser: { marginTop: spacing.lg },
  note: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: spacing.sm },
});
