import type { GeminiQuota } from "../../api";

export function QuotaBar({ quota }: { quota: GeminiQuota }) {
  const usagePercent = Math.min(100, (quota.used / quota.limit) * 100);
  const isLow = quota.remaining <= 20;
  const isDepleted = quota.remaining === 0;

  const resetsAt = new Date(quota.resetsAt);
  const nowMs = Date.now();
  const diffMs = Math.max(0, resetsAt.getTime() - nowMs);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const resetLabel =
    diffHours > 0 ? `${diffHours}h${String(diffMinutes).padStart(2, "0")}` : `${diffMinutes}min`;

  return (
    <div className={`quotaBar ${isDepleted ? "quotaBar--depleted" : isLow ? "quotaBar--low" : ""}`}>
      <div className="quotaBar__info">
        <span className="quotaBar__label">
          Quota Gemini : {quota.remaining} / {quota.limit} restant
        </span>
        <span className="quotaBar__reset">Reset dans {resetLabel}</span>
      </div>
      <div className="quotaBar__track">
        <div className="quotaBar__fill" style={{ width: `${usagePercent}%` }} />
      </div>
    </div>
  );
}
