export const SRS_BATCH_STORAGE_KEY = "kotoba.srsBatchSize";
export const SRS_BATCH_OPTIONS = [10, 20, 30, 50, 0] as const;

export type SrsBatchSize = (typeof SRS_BATCH_OPTIONS)[number];

export function loadSrsBatchSize(): SrsBatchSize {
  try {
    const rawValue = window.localStorage.getItem(SRS_BATCH_STORAGE_KEY);
    const parsed = Number(rawValue);
    if (SRS_BATCH_OPTIONS.includes(parsed as SrsBatchSize)) {
      return parsed as SrsBatchSize;
    }
  } catch {
    // ignore storage errors
  }
  return 20;
}

export function saveSrsBatchSize(batchSize: SrsBatchSize): void {
  try {
    window.localStorage.setItem(SRS_BATCH_STORAGE_KEY, String(batchSize));
  } catch {
    // ignore storage errors
  }
}

export function srsDuePath(batchSize: SrsBatchSize = loadSrsBatchSize()): string {
  if (batchSize === 0) return "/train/srs/due";
  return `/train/srs/due?limit=${batchSize}`;
}
