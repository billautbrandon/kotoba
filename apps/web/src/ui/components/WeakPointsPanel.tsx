import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type WeakPointsData, fetchWeakPoints } from "../../api";

const ERROR_TYPE_LABELS: Record<string, string> = {
  particle: "Particules",
  conjugation: "Conjugaison",
  kanji: "Kanji",
  vocabulary: "Vocabulaire",
  grammar: "Grammaire",
  meaning: "Sens",
  pronunciation: "Prononciation",
  kana: "Kana",
  other: "Autre",
};

export function WeakPointsPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState<WeakPointsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    fetchWeakPoints()
      .then((weakPoints) => {
        if (!isCancelled) setData(weakPoints);
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => { isCancelled = true; };
  }, []);

  if (isLoading || !data || data.byErrorType.length === 0) return null;

  const maxErrorCount = Math.max(1, ...data.byErrorType.map((entry) => entry.count));
  const trend = data.lastWeek > 0
    ? Math.round(((data.thisWeek - data.lastWeek) / data.lastWeek) * 100)
    : 0;

  return (
    <div className="statsSection">
      <h2 className="statsSection__title">Points faibles (30 derniers jours)</h2>

      {trend !== 0 && (
        <p style={{ fontSize: "13px", color: "var(--color-text-soft)", marginBottom: "var(--space-4)" }}>
          {trend < 0
            ? `En amélioration : ${Math.abs(trend)}% d'erreurs en moins cette semaine`
            : `Attention : ${trend}% d'erreurs en plus cette semaine`}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {data.byErrorType.map((entry) => (
          <div key={entry.error_type} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div style={{ width: "110px", fontSize: "14px", fontWeight: 500, flexShrink: 0 }}>
              {ERROR_TYPE_LABELS[entry.error_type] ?? entry.error_type}
            </div>
            <div style={{ flex: 1, height: "8px", background: "var(--color-border)", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(entry.count / maxErrorCount) * 100}%`,
                background: "var(--color-danger, #ef4444)",
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }} />
            </div>
            <div style={{ width: "40px", textAlign: "right", fontSize: "13px", color: "var(--color-text-soft)" }}>
              {entry.count}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="button"
        style={{ marginTop: "var(--space-4)" }}
        onClick={() => {
          const topErrorType = data.byErrorType[0]?.error_type;
          if (topErrorType) {
            navigate(`/pratique?tab=phrases`);
          }
        }}
      >
        Travailler mes points faibles
      </button>
    </div>
  );
}
