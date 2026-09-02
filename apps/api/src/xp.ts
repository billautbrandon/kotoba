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
export const XP_DAILY_GOAL = 25;
export const XP_PRACTICE_CORRECT = 8;
export const XP_DAILY_CHALLENGE = 15;
export const XP_NO_HIT_CLEAR = 40;
export const XP_NO_HIT_BREAK = -25;
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

export function computeSessionXp(results: Array<"success" | "partial" | "fail">): {
  baseXp: number;
  comboXp: number;
  maxCombo: number;
  perfectBonus: number;
  total: number;
} {
  let baseXp = 0;
  let comboXp = 0;
  let combo = 0;
  let maxCombo = 0;
  for (const result of results) {
    baseXp += reviewXp(result);
    if (result === "success") {
      combo += 1;
      if (combo >= 3) comboXp += XP_COMBO_STEP;
      if (combo > maxCombo) maxCombo = combo;
    } else {
      combo = 0;
    }
  }
  const isPerfect =
    results.length >= PERFECT_SESSION_MIN_REVIEWS &&
    results.every((result) => result === "success");
  const perfectBonus = isPerfect ? XP_PERFECT_SESSION : 0;
  return {
    baseXp,
    comboXp,
    maxCombo,
    perfectBonus,
    total: baseXp + comboXp + perfectBonus,
  };
}
