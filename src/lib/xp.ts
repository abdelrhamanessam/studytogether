export const XP_POOLS: Record<string, number> = {
  quick: 3000,
  semester: 15000,
  year: 36000,
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
  0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620, 1900,
  2200, 2520, 2860, 3220, 3600, 4000, 4420, 4860, 5320, 5800,
  6300, 6820, 7360, 7920, 8500, 9100, 9720, 10360, 11020, 11700,
  12400, 13120, 13860, 14620, 15400, 16200, 17020, 17860, 18720, 19600,
  20500, 21420, 22360, 23320, 24300, 25300, 26320, 27360, 28420, 29500,
  30600, 31720, 32860, 34020, 35200, 36400, 37620, 38860, 40120, 41400,
  42700, 44020, 45360, 46720, 48100, 49500, 50920, 52360, 53820, 55300,
  56800, 58320, 59860, 61420, 63000, 64600, 66220, 67860, 69520, 71200,
  72900, 74620, 76360, 78120, 79900, 81700, 83520, 85360, 87220, 89100,
  91000, 92920, 94860, 96820, 98800, 100800, 102820, 104860, 106920, 109000,
];

export function calculateLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      if (i < LEVEL_THRESHOLDS.length - 1) return i + 1;
    }
  }
  if (totalXp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) {
    const baseLevel = LEVEL_THRESHOLDS.length;
    const remaining = totalXp - LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    return baseLevel + Math.floor(remaining / 2200);
  }
  return 1;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const idx = level - 1;
  if (idx < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[idx];
  const baseLevel = LEVEL_THRESHOLDS.length;
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - baseLevel) * 2200;
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
  }

  return Math.floor(base + timeBonus + completionBonus);
}

export const DURATION_LABELS: Record<string, string> = {
  quick: "Quick (1-2 weeks)",
  semester: "Semester (3-4 months)",
  year: "Full Year",
};
