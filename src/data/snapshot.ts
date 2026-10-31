// Garmin snapshot from Saturday 31 October 2026, refreshed 12:15.
// Temporary: step 3 replaces this with live Apple Health data.

import type { Goals } from "@/engine/plan";

export const SNAPSHOT = {
  date: "2026-10-31",
  syncedLabel: "Garmin, Sat 31 Oct 12:15",
  readiness: 29,
  hrvMs: 60,
  hrvWeeklyMs: 68,
  hrvRange: [50, 74] as const,
  restingHr: 51,
  bodyBattery: 39,
  loadRatio: 1.2,
  lastNight: { hours: 6.48, score: 61 },
  // Hours asleep, last 7 nights, oldest first (nights ending 25–31 Oct)
  sleepHours: [2.97, 6.3, 5.32, 5.02, 6.87, 4.65, 6.48],
  lastWorkout: { date: "2026-10-30", title: "Run", km: 6.46, minutes: 37.2, avgHr: 169 },
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
  targetWeightKg: 75.7,
  days: [0, 2, 4, 5, 6],
  longDays: [5, 6],
  minutes: 60,
  level: "intermediate",
  profile: { sex: "m", age: 25, heightCm: 188, weightKg: 75.7, activity: 1.35 },   // Garmin weigh-in 31 Oct
};

// Current fitness for session targets, from Garmin on 31 October 2026.
// Running uses Garmin's current 5 km prediction (22:20); the all-time best is 21:26.
import type { Fitness } from "@/engine/targets";
export const FITNESS: Fitness = {
  run: { distanceM: 5000, timeS: 22 * 60 + 20, source: "Garmin 5 km prediction" },
  lthr: 183,
  ftpW: 194,
};
