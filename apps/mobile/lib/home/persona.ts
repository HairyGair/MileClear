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

/** Start Shift is a gig idea: gig and Both drivers, in Work mode only. */
export function showsStartShift(persona: HomePersona): boolean {
  return persona === "gig" || persona === "both";
}
