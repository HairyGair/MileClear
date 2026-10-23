// One odometer box on the fuel or trip form (23 Oct 2026). The rules are in
// shared (odometerBoxReduce): miles cars keep the old text and parsing
// exactly; an untouched box follows a km car's unit; typing always wins and
// is read in the unit it was typed in.
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ODOMETER_BOX_EMPTY,
  odometerBoxMiles,
  odometerBoxReduce,
  type OdometerUnit,
} from "@mileclear/shared";

export function useOdometerBox(carUnit: OdometerUnit) {
  const [state, dispatch] = useReducer(odometerBoxReduce, ODOMETER_BOX_EMPTY);
  useEffect(() => {
    if (!state.touched && state.unit !== carUnit) dispatch({ type: "carUnit", unit: carUnit });
  }, [carUnit, state.unit, state.touched]);
  const carUnitRef = useRef(carUnit);
  carUnitRef.current = carUnit;
  /** A stored figure arrives (edit), filled in the car's unit as it stands. */
  const load = useCallback(
    (miles: number | null | undefined) => dispatch({ type: "load", miles, unit: carUnitRef.current }),
    []
  );
  /** The driver typed. */
  const type = useCallback((text: string) => dispatch({ type: "type", text }), []);
  /** The form set the text itself (a restored draft). */
  const set = useCallback((text: string) => dispatch({ type: "set", text }), []);
  /** Miles to store, where the old code called parseFloat(text). */
  const miles = useCallback((text: string = state.text) => odometerBoxMiles(state, text), [state]);
  return { text: state.text, unit: state.unit, load, type, set, miles };
}
