// Mileage milestones shown on Insights and Home. The 250 mi milestone used
// to be called "Road Warrior", which is also the 500 mi badge; it is now
// "Long Way Round" so no milestone shares a name with a badge.

export interface Milestone {
  miles: number;
  label: string;
  funFact: string;
}

export const MILESTONES: Milestone[] = [
  { miles: 10, label: "First Steps", funFact: "London to Brighton (almost!)" },
  { miles: 50, label: "Getting Going", funFact: "London to Canterbury" },
  { miles: 100, label: "Century Club", funFact: "London to Bristol" },
  { miles: 250, label: "Long Way Round", funFact: "London to Manchester" },
  { miles: 500, label: "Explorer", funFact: "London to Edinburgh" },
  { miles: 1000, label: "Mile Master", funFact: "Land's End to John o' Groats" },
  { miles: 2500, label: "Distance King", funFact: "London to Marrakech" },
  { miles: 5000, label: "Globe Trotter", funFact: "London to New York (by air)" },
  { miles: 10000, label: "Legend", funFact: "Halfway around the world" },
  { miles: 25000, label: "Orbital", funFact: "Around the entire Earth" },
  { miles: 50000, label: "Cosmic", funFact: "Twice around the Earth" },
];

export interface MilestoneRoad {
  next: Milestone;
  lastAchieved: Milestone | null;
  /** 0 to 1 between the last milestone (or 0) and the next. */
  progress: number;
  milesToGo: number;
}

/** Null when there is nothing to show (under 5 miles, or all passed). */
export function getMilestoneRoad(totalMiles: number): MilestoneRoad | null {
  if (!isFinite(totalMiles) || totalMiles < 5) return null;
  let lastAchieved: Milestone | null = null;
  let next: Milestone | null = null;
  for (const m of MILESTONES) {
    if (totalMiles >= m.miles) lastAchieved = m;
    else {
      next = m;
      break;
    }
  }
  if (!next) return null;
  const from = lastAchieved ? lastAchieved.miles : 0;
  const progress = Math.min(1, Math.max(0, (totalMiles - from) / (next.miles - from)));
  return { next, lastAchieved, progress, milesToGo: next.miles - totalMiles };
}

/** The road for the Insights card: before 5 miles it shows the first milestone at the start. */
export function getMilestoneRoadOrStart(totalMiles: number): MilestoneRoad | null {
  const road = getMilestoneRoad(totalMiles);
  if (road) return road;
  const miles = isFinite(totalMiles) ? Math.max(0, totalMiles) : 0;
  if (miles < 5) {
    return {
      next: MILESTONES[0],
      lastAchieved: null,
      progress: Math.min(1, miles / MILESTONES[0].miles),
      milesToGo: MILESTONES[0].miles - miles,
    };
  }
  return null; // every milestone passed
}

/** Highest milestone passed so far, or null. */
export function highestPassed(totalMiles: number): Milestone | null {
  let out: Milestone | null = null;
  for (const m of MILESTONES) if (totalMiles >= m.miles) out = m;
  return out;
}

/**
 * Should we celebrate? Only when a milestone is above the one last seen on
 * this phone. A first ever visit (lastSeenMiles null) never celebrates: it
 * would replay old milestones, so the caller just stores the current one.
 */
export function newlyPassed(totalMiles: number, lastSeenMiles: number | null): Milestone | null {
  if (lastSeenMiles === null) return null;
  const top = highestPassed(totalMiles);
  return top && top.miles > lastSeenMiles ? top : null;
}

/** "178 miles to go", "Less than a mile to go". */
export function milesToGoText(milesToGo: number): string {
  if (milesToGo < 1) return "Less than a mile to go";
  const n = milesToGo < 10 ? Math.round(milesToGo * 10) / 10 : Math.round(milesToGo);
  return `${n.toLocaleString("en-GB")} miles to go`;
}
