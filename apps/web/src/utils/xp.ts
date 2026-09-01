export type LevelProgress = {
  level: number;
  totalXp: number;
  xpInLevel: number;
  xpForNextLevel: number;
};

export const XP_SUCCESS = 10;
export const XP_PARTIAL = 4;
export const XP_FAIL = 1;
export const XP_COMBO_STEP = 2;
export const XP_PERFECT_SESSION = 30;
export const PERFECT_SESSION_MIN_REVIEWS = 5;

export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  const steps = level - 1;
  return 80 * steps + 10 * steps * level;
}

export function levelFromXp(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.trunc(xp));
  let level = 1;
  while (xpToReachLevel(level + 1) <= safeXp && level < 200) {
    level += 1;
  }
  const currentLevelStart = xpToReachLevel(level);
  const nextLevelStart = xpToReachLevel(level + 1);
  return {
    level,
    totalXp: safeXp,
    xpInLevel: safeXp - currentLevelStart,
    xpForNextLevel: nextLevelStart - currentLevelStart,
  };
}

export function reviewXp(result: "success" | "partial" | "fail"): number {
  if (result === "success") return XP_SUCCESS;
  if (result === "partial") return XP_PARTIAL;
  return XP_FAIL;
}

export function computeLiveCombo(ratingsInOrder: Array<"success" | "partial" | "fail" | null>): {
  combo: number;
  maxCombo: number;
} {
  let combo = 0;
  let maxCombo = 0;
  for (const rating of ratingsInOrder) {
    if (rating === "success") {
      combo += 1;
      if (combo > maxCombo) maxCombo = combo;
    } else if (rating === "partial" || rating === "fail") {
      combo = 0;
    }
  }
  return { combo, maxCombo };
}

export function previewReviewXp(
  result: "success" | "partial" | "fail",
  comboAfterThisSuccess: number,
): number {
  const comboBonus = result === "success" && comboAfterThisSuccess >= 3 ? XP_COMBO_STEP : 0;
  return reviewXp(result) + comboBonus;
}
