import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  ActivityDay,
  SrsSummary,
  SrsWords,
  StatsOverview,
  StreakInfo,
  User,
  WordWithStats,
} from "../../api";
import {
  fetchActivityData,
  fetchDueWords,
  fetchSeries,
  fetchSrsSummary,
  fetchSrsWords,
  fetchStatsOverview,
  fetchStreak,
} from "../../api";
import { BadgeGrid } from "../components/BadgeGrid";
import { DashboardActivityCard } from "../components/DashboardActivityCard";
import { SessionHeroCard } from "../components/SessionHeroCard";
import { SrsProgressCard } from "../components/SrsProgressCard";
import { StudyQueueCard } from "../components/StudyQueueCard";
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
  const [srsWords, setSrsWords] = useState<SrsWords | null>(null);
  const [dueWords, setDueWords] = useState<WordWithStats[]>([]);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [loadedSeries, summary, words, due, overviewData, activityData, streak] =
          await Promise.all([
            fetchSeries(),
            fetchSrsSummary(),
            fetchSrsWords(),
            fetchDueWords(),
            fetchStatsOverview(),
            fetchActivityData(),
            fetchStreak(),
          ]);
        if (!isCancelled) {
          setSeries(loadedSeries);
          setSrsSummary(summary);
          setSrsWords(words);
          setDueWords(due.words);
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

  const newCount = srsSummary?.newCount ?? 0;
  const dueTodayCount = Math.max(0, (srsSummary?.dueCount ?? 0) - newCount);
  const duePreview = dueWords.slice(0, dueTodayCount);
  const newPreview = dueWords.slice(dueTodayCount);

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
            previewWords={dueWords}
            onStartSession={() => navigate("/train/srs/due")}
          />
          <VocabProgressCard overview={overview} streakInfo={streakInfo} activity={activity} />
          <SrsProgressCard summary={srsSummary} overview={overview} />
          <StudyQueueCard
            weakest={{
              label: "Plus faibles",
              count: srsWords?.hard.length ?? 0,
              words: srsWords?.hard ?? [],
            }}
            dueToday={{
              label: "Due aujourd'hui",
              count: dueTodayCount,
              words: duePreview,
            }}
            newWords={{
              label: "Nouveaux",
              count: newCount,
              words: newPreview,
            }}
          />
          <DashboardActivityCard activity={activity} streakInfo={streakInfo} overview={overview} />
          <BadgeGrid variant="compact" />
        </div>
      )}

      <div className="dashCard dashCard--wide">
        <div className="seriesCard__header">
          <div>
            <h2 className="seriesCard__title">Séries</h2>
            <p className="seriesCard__subtitle">
              Lance une session d'entraînement par tag ({totalWords} mots au total).
            </p>
          </div>
          <button
            className="button button--primary"
            type="button"
            onClick={() => navigate("/words")}
          >
            + Ajouter du vocabulaire
          </button>
        </div>

        {!isLoading && series && series.length === 0 ? (
          <div className="seriesCard__empty">
            Aucune série : crée des tags et assigne-les à des mots dans « Mots ».
          </div>
        ) : null}

        {series && series.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Mots</th>
                <th>Score (cumul)</th>
                <th>Dernière session</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr
                  key={row.tagId}
                  className="tableRowLink"
                  tabIndex={0}
                  onClick={() =>
                    navigate(`/train/tag/${row.tagId}?name=${encodeURIComponent(row.tagName)}`)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/train/tag/${row.tagId}?name=${encodeURIComponent(row.tagName)}`);
                    }
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{row.tagName}</td>
                  <td className="muted">{row.wordsCount}</td>
                  <td className="muted">{row.totalScore}</td>
                  <td className="muted" style={{ fontSize: "13px" }}>
                    {row.lastReviewedAt ? formatRelativeDate(row.lastReviewedAt) : "—"}
                  </td>
                  <td className="muted" style={{ textAlign: "right" }}>
                    →
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
