import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { BadgeDefinition, SrsSummary, StatsOverview, StreakInfo, User } from "../../api";
import { fetchSeries, fetchSrsSummary, fetchStatsOverview, fetchStreak } from "../../api";
import { BadgeNotification } from "../components/BadgeNotification";
import { LevelUpOverlay } from "../components/LevelUpOverlay";
import { SessionHeroCard } from "../components/SessionHeroCard";
import { srsDuePath } from "../utils/srsBatch";

type HomePageProps = {
  currentUser: User | null;
};

type SeriesPreview = {
  tagId: number;
  tagName: string;
  wordsCount: number;
  lastReviewedAt: string | null;
};

export function HomePage({ currentUser }: HomePageProps) {
  const navigate = useNavigate();
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [series, setSeries] = useState<SeriesPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newBadges, setNewBadges] = useState<BadgeDefinition[]>([]);
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [summary, overviewData, streak, seriesData] = await Promise.all([
          fetchSrsSummary(),
          fetchStatsOverview(),
          fetchStreak(),
          fetchSeries(),
        ]);
        if (!isCancelled) {
          setSrsSummary(summary);
          setOverview(overviewData);
          setStreakInfo(streak);
          setSeries(seriesData);
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

  const level = streakInfo?.level ?? currentUser?.level ?? 1;
  const xpInLevel = streakInfo?.xpInLevel ?? currentUser?.xpInLevel ?? 0;
  const xpForNextLevel = streakInfo?.xpForNextLevel ?? currentUser?.xpForNextLevel ?? 100;
  const dueCount = srsSummary?.dueCount ?? 0;
  const totalWords = overview?.totalWords ?? 0;
  const seriesCount = series.length;
  const masteredCount = overview?.masteredCount ?? 0;

  return (
    <div className="dashboard dashboard--compact">
      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      {isLoading ? (
        <div className="muted">Chargement du tableau de bord…</div>
      ) : (
        <>
          <SessionHeroCard
            currentUser={currentUser}
            dueCount={dueCount}
            todayReviews={streakInfo?.todayReviews ?? 0}
            currentStreak={streakInfo?.currentStreak ?? 0}
            level={level}
            xpInLevel={xpInLevel}
            xpForNextLevel={xpForNextLevel}
            onStartSession={() => navigate(srsDuePath())}
          />
          <nav className="dashShortcuts" aria-label="Raccourcis">
            <Link className="dashShortcuts__item" to="/dictionary">
              <span className="dashShortcuts__label">Vocabulaire</span>
              <span className="dashShortcuts__hint">
                {`${totalWords} mot${totalWords > 1 ? "s" : ""} · ${seriesCount} série${seriesCount > 1 ? "s" : ""}`}
              </span>
            </Link>
            <Link className="dashShortcuts__item" to="/srs">
              <span className="dashShortcuts__label">SRS</span>
              <span className="dashShortcuts__hint">
                {dueCount > 0
                  ? `${dueCount} carte${dueCount > 1 ? "s" : ""} due${dueCount > 1 ? "s" : ""}`
                  : "Rien à réviser"}
              </span>
            </Link>
            <Link className="dashShortcuts__item" to="/pratique">
              <span className="dashShortcuts__label">Pratique</span>
              <span className="dashShortcuts__hint">Phrases, JLPT, conjugaison</span>
            </Link>
            <Link className="dashShortcuts__item" to="/stats">
              <span className="dashShortcuts__label">Statistiques</span>
              <span className="dashShortcuts__hint">
                {masteredCount} maîtrisé{masteredCount > 1 ? "s" : ""}
              </span>
            </Link>
          </nav>
        </>
      )}
      <BadgeNotification badges={newBadges} onDismiss={() => setNewBadges([])} />
      {leveledUpTo ? (
        <LevelUpOverlay level={leveledUpTo} onDismiss={() => setLeveledUpTo(null)} />
      ) : null}
    </div>
  );
}
