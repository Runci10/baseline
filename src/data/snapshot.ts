// Garmin snapshot from Monday 26 October 2026, 06:08, plus Will's starting goals.
// Temporary: step 3 replaces this with live Apple Health data.

import type { Goals } from "@/engine/plan";

export const SNAPSHOT = {
  date: "2026-10-26",
  syncedLabel: "Garmin snapshot, Mon 26 Oct 06:08",
  readiness: 40,
  hrvMs: 71,
  hrvRange: [48, 71] as const,
  restingHr: 50,
  bodyBattery: 19,
  loadRatio: 0.6,
  lastNight: { hours: 6.3, score: 74 },
  // Hours asleep, last 7 nights, oldest first
  sleepHours: [6.16, 4.02, 4.88, 4.2, 4.83, 2.97, 6.3],
};

export const sleepAvg7 = SNAPSHOT.sleepHours.reduce((a, b) => a + b, 0) / SNAPSHOT.sleepHours.length;
export const sleepPrior6 = SNAPSHOT.sleepHours.slice(0, 6).reduce((a, b) => a + b, 0) / 6;

// Starting goals: placeholders to edit. Days and long days come from Garmin settings.
export const DEFAULT_GOALS: Goals = {
  sports: [
    { id: "run", target: "10k" },
    { id: "strength", target: "general" },
  ],
  aim: "maintain",
  rateKgPerWeek: 0.25,
  targetWeightKg: 80,
  days: [0, 2, 4, 5, 6],
  longDays: [5, 6],
  minutes: 60,
  level: "intermediate",
  profile: { sex: "m", age: 25, heightCm: 188, weightKg: 80, activity: 1.35 },
};
