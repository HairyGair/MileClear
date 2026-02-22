import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchTrips, fetchTrip, type TripDetail } from "../lib/api/trips";

export function useRecentTripsWithCoords(count = 5) {
  const [trips, setTrips] = useState<TripDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTrips({ pageSize: count });
      if (!mountedRef.current) return;

      const details = await Promise.all(
        res.data.map(async (trip) => {
          try {
            const detail = await fetchTrip(trip.id);
            return detail.data;
          } catch {
            return null;
          }
        })
      );

      if (!mountedRef.current) return;
      setTrips(details.filter((d): d is TripDetail => d !== null));
    } catch {
      if (mountedRef.current) setTrips([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [count]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { trips, loading, reload: load };
}
