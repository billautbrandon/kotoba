import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ActivityDay, SrsSummary, StatsOverview, StreakInfo, User } from "../../api";
import {
  fetchActivityData,
  fetchSeries,
  fetchSrsSummary,
  fetchStatsOverview,
  fetchStreak,
} from "../../api";
import { BadgeGrid } from "../components/BadgeGrid";
import { DashboardActivityCard } from "../components/DashboardActivityCard";
import { SessionHeroCard } from "../components/SessionHeroCard";
import { SrsProgressCard } from "../components/SrsProgressCard";
import { VocabProgressCard } from "../components/VocabProgressCard";

type SeriesRow = {
  tagId: number;
  tagName: string;
  wordsCount: number;
  totalScore: number;
  lastReviewedAt: string | null;
};

type HomePageProps = {
  currentUser: User | null;
};

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function HomePage({ currentUser }: HomePageProps) {
  const navigate = useNavigate();
  const [series, setSeries] = useState<SeriesRow[] | null>(null);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [loadedSeries, summary, overviewData, activityData, streak] = await Promise.all([
          fetchSeries(),
          fetchSrsSummary(),
          fetchStatsOverview(),
          fetchActivityData(),
          fetchStreak(),
        ]);
        if (!isCancelled) {
          setSeries(loadedSeries);
          setSrsSummary(summary);
          setOverview(overviewData);
          setActivity(activityData.activity);
          setStreakInfo(streak);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  const totalWords = useMemo(() => {
    if (!series) return 0;
    return series.reduce((accumulator, row) => accumulator + row.wordsCount, 0);
  }, [series]);

  const selectedSeries = useMemo(() => {
    if (!series) return [];
    return series.filter((row) => selectedTagIds.has(row.tagId));
  }, [series, selectedTagIds]);

  const selectedWordsCount = selectedSeries.reduce((total, row) => total + row.wordsCount, 0);
  const allSelected = Boolean(series && series.length > 0 && selectedTagIds.size === series.length);

  function toggleTag(tagId: number) {
    setSelectedTagIds((previous) => {
      const next = new Set(previous);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleAll() {
    if (!series) return;
    if (allSelected) {
      setSelectedTagIds(new Set());
      return;
    }
    setSelectedTagIds(new Set(series.map((row) => row.tagId)));
  }

  function startSelectedSeries() {
    if (selectedSeries.length === 0) return;
    const ids = selectedSeries.map((row) => row.tagId).join(",");
    const names = selectedSeries.map((row) => row.tagName).join(", ");
    navigate(`/train/tags?ids=${ids}&name=${encodeURIComponent(names)}`);
  }

  function startSingleSeries(row: SeriesRow) {
    navigate(`/train/tag/${row.tagId}?name=${encodeURIComponent(row.tagName)}`);
  }

  return (
    <div className="dashboard">
      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      {isLoading ? (
        <div className="muted">Chargement du tableau de bord…</div>
      ) : (
        <div className="dashboard__grid">
          <SessionHeroCard
            currentUser={currentUser}
            dueCount={srsSummary?.dueCount ?? 0}
            todayReviews={streakInfo?.todayReviews ?? 0}
            onStartSession={() => navigate("/train/srs/due")}
          />
          <VocabProgressCard overview={overview} streakInfo={streakInfo} activity={activity} />
          <SrsProgressCard summary={srsSummary} overview={overview} />
          <DashboardActivityCard activity={activity} streakInfo={streakInfo} overview={overview} />
          <BadgeGrid variant="compact" />
        </div>
      )}

      <div className="dashCard dashCard--wide">
        <div className="seriesCard__header">
          <div>
            <h2 className="seriesCard__title">Séries</h2>
            <p className="seriesCard__subtitle">
              Coche plusieurs séries pour les réviser ensemble ({totalWords} mots au total).
            </p>
          </div>
          <div className="seriesCard__actions">
            {selectedSeries.length > 0 ? (
              <button
                className="button button--primary"
                type="button"
                onClick={startSelectedSeries}
              >
                Réviser {selectedSeries.length} série{selectedSeries.length > 1 ? "s" : ""} ·{" "}
                {selectedWordsCount} mots
              </button>
            ) : null}
            <button className="button" type="button" onClick={() => navigate("/words")}>
              + Ajouter du vocabulaire
            </button>
          </div>
        </div>

        {!isLoading && series && series.length === 0 ? (
          <div className="seriesCard__empty">
            <div className="emptyState">
              <p className="emptyState__title">Aucune série pour l'instant</p>
              <p className="emptyState__text">
                Crée des tags et assigne-les à tes mots pour réviser par série.
              </p>
              <div className="emptyState__actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => navigate("/words")}
                >
                  Aller aux mots
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {series && series.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th className="seriesCard__checkCol">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th>Tag</th>
                <th>Mots</th>
                <th>Score (cumul)</th>
                <th>Dernière session</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr key={row.tagId}>
                  <td className="seriesCard__checkCol">
                    <input
                      type="checkbox"
                      checked={selectedTagIds.has(row.tagId)}
                      onChange={() => toggleTag(row.tagId)}
                      aria-label={`Sélectionner ${row.tagName}`}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.tagName}</td>
                  <td className="muted">{row.wordsCount}</td>
                  <td className="muted">{row.totalScore}</td>
                  <td className="muted" style={{ fontSize: "13px" }}>
                    {row.lastReviewedAt ? formatRelativeDate(row.lastReviewedAt) : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => startSingleSeries(row)}
                    >
                      Réviser
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
