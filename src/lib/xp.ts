export const XP_POOLS: Record<string, number> = {
  quick: 3000,
  semester: 15000,
  year: 36000,
};

// Mission sizes a user can pick when creating a subject (or a daily mission).
// Each size maps to an XP pool that determines how much a completed mission is
// worth. "small" ~ a few days / one week, "medium" ~ a month, "large" ~ a big
// multi-week mission.
export const MISSION_SIZES = ["small", "medium", "large"] as const;
export type MissionSize = (typeof MISSION_SIZES)[number];

export const MISSION_POOLS: Record<MissionSize, number> = {
  small: 3000,
  medium: 15000,
  large: 36000,
};

export const MISSION_LABELS: Record<MissionSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export const MISSION_HINTS: Record<MissionSize, string> = {
  small: "A few days / one week",
  medium: "About a month",
  large: "A big multi-week mission",
};

// XP awarded for completing a single daily mission by size.
export const DAILY_MISSION_XP: Record<MissionSize, number> = {
  small: 50,
  medium: 120,
  large: 250,
};

export const STREAK_MULTIPLIERS = [
  { minDays: 31, multiplier: 1.75 },
  { minDays: 15, multiplier: 1.50 },
  { minDays: 8, multiplier: 1.30 },
  { minDays: 4, multiplier: 1.20 },
  { minDays: 1, multiplier: 1.10 },
  { minDays: 0, multiplier: 1.00 },
];

export function getStreakMultiplier(streak: number): number {
  for (const tier of STREAK_MULTIPLIERS) {
    if (streak >= tier.minDays) return tier.multiplier;
  }
  return 1.0;
}

export function getStreakLabel(streak: number): string {
  if (streak >= 31) return "Legendary";
  if (streak >= 15) return "On Fire";
  if (streak >= 8) return "Blazing";
  if (streak >= 4) return "Heating Up";
  if (streak >= 1) return "Warming Up";
  return "No Streak";
}

export function calculateLessonXp(totalXp: number, totalLessons: number, isRevision: boolean): number {
  const base = Math.max(20, Math.floor(totalXp / Math.max(totalLessons, 1)));
  if (isRevision) return Math.max(8, Math.floor(base * 0.4));
  return base;
}

const LEVEL_THRESHOLDS = [
  0, 1000, 2150, 3450, 4900, 6500, 8250, 10150, 12200, 14400, 16750,
  19250, 21900, 24700, 27650, 30750, 34000, 37400, 40950, 44650, 48500,
  52500, 56500, 60500, 64500, 68500, 72500, 76500, 80500, 84500, 88500,
  92500, 96500, 100500, 104500, 108500, 112500, 116500, 120500, 124500,
  128500, 132500, 136500, 140500, 144500, 148500, 152500, 156500, 160500,
  164500, 168500, 172500, 176500, 180500, 184500, 188500, 192500, 196500,
  200500, 204500, 208500, 212500, 216500, 220500, 224500, 228500, 232500,
  236500, 240500, 244500, 248500, 252500, 256500, 260500, 264500, 268500,
  272500, 276500, 280500, 284500, 288500, 292500, 296500, 300500, 304500,
  308500, 312500, 316500, 320500, 324500, 328500, 332500, 336500, 340500,
  344500, 348500, 352500, 356500, 360500, 364500,
];

export function calculateLevel(totalXp: number): number {
  const last = LEVEL_THRESHOLDS.length - 1;
  if (totalXp >= LEVEL_THRESHOLDS[last]) {
    return LEVEL_THRESHOLDS.length + Math.floor((totalXp - LEVEL_THRESHOLDS[last]) / 4000);
  }
  for (let i = last - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const idx = level - 1;
  if (idx < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[idx];
  const baseLevel = LEVEL_THRESHOLDS.length;
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - baseLevel) * 4000;
}

export function xpForNextLevel(level: number): number {
  return xpForLevel(level + 1);
}

export function xpProgress(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
  xpToNext: number;
} {
  const level = calculateLevel(totalXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForNextLevel(level);
  const progressXp = totalXp - currentLevelXp;
  const needed = nextLevelXp - currentLevelXp;
  const progress = needed > 0 ? Math.min(progressXp / needed, 1) : 1;
  const xpToNext = Math.max(nextLevelXp - totalXp, 0);
  return { level, currentLevelXp, nextLevelXp, progress, xpToNext };
}

export function calculateSessionXp(actualMinutes: number, plannedMinutes?: number): {
  baseXp: number;
  completionBonus: number;
  timeBonus: number;
  totalXp: number;
  breakdown: { label: string; amount: number }[];
} {
  const baseXp = actualMinutes * 3;

  let timeBonus = 0;
  if (actualMinutes >= 120) {
    timeBonus = Math.floor(actualMinutes * 1.5);
  } else if (actualMinutes >= 60) {
    timeBonus = Math.floor(actualMinutes * 1.2);
  } else if (actualMinutes >= 40) {
    timeBonus = Math.floor(actualMinutes * 1.0);
  } else if (actualMinutes >= 25) {
    timeBonus = Math.floor(actualMinutes * 0.8);
  } else {
    timeBonus = Math.floor(actualMinutes * 0.5);
  }

  let completionBonus = 0;
  if (plannedMinutes && plannedMinutes > 0) {
    const ratio = actualMinutes / plannedMinutes;
    if (ratio >= 0.9) {
      completionBonus = Math.floor(plannedMinutes * 5);
    } else if (ratio >= 0.5) {
      completionBonus = Math.floor(plannedMinutes * ratio * 3);
    }
  } else {
    // Unstructured/count-up sessions (stopwatch) get the same XP as a
    // perfectly-completed structured session, so the user is rewarded equally.
    completionBonus = Math.min(actualMinutes * 5, 800);
  }

  const totalXp = baseXp + timeBonus + completionBonus;
  const breakdown = [
    { label: `Base (${actualMinutes}min × 3)`, amount: baseXp },
    { label: "Time bonus", amount: timeBonus },
  ];
  if (completionBonus > 0) {
    breakdown.push({ label: "Completion bonus", amount: completionBonus });
  }

  return { baseXp, completionBonus, timeBonus, totalXp, breakdown };
}

export function estimateLiveXp(elapsedSeconds: number, studyDuration?: number): number {
  const minutes = elapsedSeconds / 60;
  const base = minutes * 3;
  let timeBonus = 0;
  if (minutes >= 60) {
    timeBonus = minutes * 1.2;
  } else if (minutes >= 40) {
    timeBonus = minutes * 1.0;
  } else if (minutes >= 25) {
    timeBonus = minutes * 0.8;
  } else {
    timeBonus = minutes * 0.5;
  }

  let completionBonus = 0;
  if (studyDuration && studyDuration > 0) {
    const plannedMin = studyDuration / 60;
    const ratio = minutes / plannedMin;
    if (ratio >= 0.9) {
      completionBonus = plannedMin * 5;
    } else if (ratio >= 0.5) {
      completionBonus = plannedMin * ratio * 3;
    }
  } else {
    // Count-up sessions (stopwatch) with no planned duration get the same
    // completion bonus as calculateSessionXp, so the live value matches
    // exactly what will be awarded on finish.
    completionBonus = Math.min(minutes * 5, 800);
  }

  return Math.floor(base + timeBonus + completionBonus);
}

export const DURATION_LABELS: Record<string, string> = {
  quick: "Quick (1-2 weeks)",
  semester: "Semester (3-4 months)",
  year: "Full Year",
};
