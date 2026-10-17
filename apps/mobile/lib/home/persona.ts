// Who is looking at Home. One word per driver type, so every Home rule (hero,
// buttons, door rows, classify choice) reads the same answer.
//
// Work mode: gig, both, employee, company. Personal mode: personal, whatever
// the driver's work type. Matches lib/tax/persona.resolvePersona exactly, so
// Home and the Tax tab agree about who the driver is.

import { resolvePersona, type Persona } from "../tax/persona";

export type HomePersona = Persona;

export function homePersona(args: {
  isPersonal: boolean;
  isCompanyDriver: boolean;
  workType: string | null | undefined;
}): HomePersona {
  return resolvePersona(args);
}

/**
 * Start Shift is a gig idea: gig and Both drivers, in Work mode only. A work
 * driver who has already used shifts keeps the button whatever "You drive for"
 * says; 1.3.13 hid it from 11 employer drivers mid-habit (Will, 17 Oct 2026).
 */
export function showsStartShift(persona: HomePersona, completedShifts = 0): boolean {
  if (persona === "gig" || persona === "both") return true;
  return persona !== "personal" && completedShifts > 0;
}
