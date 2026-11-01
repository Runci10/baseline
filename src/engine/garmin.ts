// Baseline → Garmin Connect workouts.
// Converts a planned session into Garmin's workout format, so it can be uploaded to Garmin Connect,
// scheduled on the calendar and followed on the watch (pace targets, repeats and recoveries).
// Pure functions only: uploading is done by whatever has Garmin access (for the trial, Claude's
// Garmin connection on Will's computer; in the product, Garmin's Training API or Apple WorkoutKit).

import type { Session } from "./plan";
import { runStructure, sessionTargets, type Fitness, type RunBlock, type RunRepeat } from "./targets";

const RUNNING = { sportTypeId: 1, sportTypeKey: "running" };
const STEP_TYPE = {
  warmup: { stepTypeId: 1, stepTypeKey: "warmup" },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown" },
  interval: { stepTypeId: 3, stepTypeKey: "interval" },
  recovery: { stepTypeId: 4, stepTypeKey: "recovery" },
  repeat: { stepTypeId: 6, stepTypeKey: "repeat" },
} as const;

/** Pace range (s per km, fast then slow) as Garmin speed targets in m/s, slower value first. */
const speeds = ([fast, slow]: [number, number]) => ({ targetValueOne: +(1000 / slow).toFixed(3), targetValueTwo: +(1000 / fast).toFixed(3) });

function step(b: RunBlock, order: number) {
  return {
    type: "ExecutableStepDTO",
    stepOrder: order,
    stepType: STEP_TYPE[b.type],
    description: b.detail.slice(0, 100),
    endCondition: b.meters ? { conditionTypeId: 3, conditionTypeKey: "distance" } : { conditionTypeId: 2, conditionTypeKey: "time" },
    endConditionValue: b.meters ?? b.seconds,
    targetType: { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone" },
    ...speeds(b.pace),
  };
}

/** Garmin workout JSON for a running session, or null for other sports or missing fitness. */
export function garminRunWorkout(s: Session | null, fit: Fitness, name?: string) {
  if (!s || s.sport !== "run") return null;
  const st = runStructure(s, s.key ?? s.kind, s.goal ?? "", fit);
  if (!st) return null;
  let order = 0;
  const steps = st.blocks.map(b => {
    if ("repeat" in b) {
      const r = b as RunRepeat;
      const groupOrder = ++order;
      return {
        type: "RepeatGroupDTO",
        stepOrder: groupOrder,
        stepType: STEP_TYPE.repeat,
        numberOfIterations: r.repeat,
        endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
        endConditionValue: r.repeat,
        workoutSteps: r.steps.map(x => step(x, ++order)),
      };
    }
    return step(b as RunBlock, ++order);
  });
  return {
    workoutName: (name ?? `Baseline: ${s.title}`).slice(0, 80),
    description: `${st.summary}. ${st.effort}.`.slice(0, 512),
    sportType: RUNNING,
    workoutSegments: [{ segmentOrder: 1, sportType: RUNNING, workoutSteps: steps }],
  };
}

/** Strength session as a simple exercise list (name, sets, reps, rest) for Garmin strength workouts. */
export function garminStrengthExercises(s: Session | null, goalTarget: string, fit: Fitness) {
  if (!s || s.sport !== "strength") return null;
  const t = sessionTargets(s, goalTarget, fit);
  if (!t) return null;
  return t.steps
    .filter(x => x.label !== "Warm-up")
    .map(x => {
      const m = x.detail.match(/^(\d+) × (\d+)(?:–(\d+))?/);
      const rest = x.detail.match(/rest (\d+)(?:–\d+)? (s|min)/);
      return {
        name: x.label,
        sets: m ? +m[1] : 3,
        reps: m ? +m[2] : 10,              // bottom of the range: the minimum to complete
        rest_seconds: rest ? +rest[1] * (rest[2] === "min" ? 60 : 1) : 60,
      };
    });
}
