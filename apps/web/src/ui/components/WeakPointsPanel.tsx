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

const MODE_LABELS: Record<string, string> = {
  phrases: "Phrases",
  jlpt: "JLPT",
  conjugaison: "Conjugaison",
  construction: "Construction",
  ecoute: "Écoute",
  srs: "SRS",
  train: "Vocabulaire",
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
    return () => {
      isCancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="statsPanel">
        <div className="statsPanel__header">
          <div>
            <h2 className="statsPanel__title">Points faibles</h2>
            <p className="statsPanel__text">Analyse des 30 derniers jours</p>
          </div>
        </div>
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  const hasErrorTypes = Boolean(data && data.byErrorType.length > 0);
  const maxErrorCount = hasErrorTypes
    ? Math.max(1, ...(data?.byErrorType ?? []).map((entry) => entry.count))
    : 1;
  const trend =
    data && data.lastWeek > 0
      ? Math.round(((data.thisWeek - data.lastWeek) / data.lastWeek) * 100)
      : 0;
  const modeChips = data?.byMode.filter((entry) => entry.count > 0).slice(0, 4) ?? [];

  return (
    <div className="statsPanel">
      <div className="statsPanel__header">
        <div>
          <h2 className="statsPanel__title">Points faibles</h2>
          <p className="statsPanel__text">Erreurs des 30 derniers jours, par type</p>
        </div>
        {trend !== 0 ? (
          <span className={`statsTrend ${trend < 0 ? "statsTrend--up" : "statsTrend--down"}`}>
            {trend < 0 ? `−${Math.abs(trend)}% cette semaine` : `+${trend}% cette semaine`}
          </span>
        ) : null}
      </div>

      {!hasErrorTypes ? (
        <p className="statsPanel__empty">
          Pas encore assez d'erreurs pour dégager un profil. Continue à t'entraîner.
        </p>
      ) : (
        <>
          <div className="statsWeak__bars">
            {data?.byErrorType.map((entry) => (
              <div key={entry.error_type} className="statsWeak__row">
                <div className="statsWeak__label">
                  {ERROR_TYPE_LABELS[entry.error_type] ?? entry.error_type}
                </div>
                <div className="statsWeak__track">
                  <div
                    className="statsWeak__fill"
                    style={{ width: `${(entry.count / maxErrorCount) * 100}%` }}
                  />
                </div>
                <div className="statsWeak__count">{entry.count}</div>
              </div>
            ))}
          </div>

          {modeChips.length > 0 ? (
            <div className="statsWeak__modes">
              {modeChips.map((entry) => (
                <span key={entry.exercise_mode} className="statsWeak__mode">
                  {MODE_LABELS[entry.exercise_mode] ?? entry.exercise_mode}
                  <strong>{entry.count}</strong>
                </span>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              navigate("/pratique?tab=phrases");
            }}
          >
            Travailler mes points faibles
          </button>
        </>
      )}
    </div>
  );
}
