import { useEffect, useState } from "react";

import {
  type ActivityDay,
  type SrsSummary,
  type StatsOverview,
  type StreakInfo,
  fetchActivityData,
  fetchSrsSummary,
  fetchStatsOverview,
  fetchStreak,
} from "../../api";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { BadgeGrid } from "../components/BadgeGrid";
import { WeakPointsPanel } from "../components/WeakPointsPanel";

export function StatsPage() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [overviewData, activityData, srsData, streakData] = await Promise.all([
          fetchStatsOverview(),
          fetchActivityData(),
          fetchSrsSummary(),
          fetchStreak(),
        ]);
        if (!isCancelled) {
          setOverview(overviewData);
          setActivity(activityData.activity);
          setSrsSummary(srsData);
          setStreakInfo(streakData);
        }
      } catch {
        /* ignore */
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div>
        <div className="pageHeader">
          <h1 className="pageTitle">Statistiques</h1>
        </div>
        <div className="muted">Chargement…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Statistiques</h1>
          <p className="pageSubtitle">Vue d'ensemble de ta progression</p>
        </div>
      </div>

      {overview && (
        <div className="statsOverview">
          <OverviewCard label="Mots totaux" value={overview.totalWords} />
          <OverviewCard label="Maîtrisés" value={overview.masteredCount} />
          <OverviewCard label="Taux de réussite" value={`${overview.avgSuccessRate}%`} />
          <OverviewCard label="Révisions totales" value={overview.totalReviews} />
          <OverviewCard label="Série actuelle" value={`${streakInfo?.currentStreak ?? 0} jours`} />
        </div>
      )}

      <WeakPointsPanel />

      {srsSummary && (
        <div className="statsSection">
          <h2 className="statsSection__title">Distribution SRS</h2>
          <SrsDistributionChart summary={srsSummary} />
        </div>
      )}

      <BadgeGrid />

      <div className="statsSection">
        <h2 className="statsSection__title">Activité (12 derniers mois)</h2>
        <ActivityHeatmap activity={activity} />
      </div>
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="statsCard">
      <div className="statsCard__value">{value}</div>
      <div className="statsCard__label">{label}</div>
    </div>
  );
}

function SrsDistributionChart({ summary }: { summary: SrsSummary }) {
  const categories = [
    { label: "Nouveaux", value: summary.newCount, color: "var(--color-muted)" },
    { label: "En cours", value: summary.learningCount, color: "var(--color-warning)" },
    { label: "Gradués", value: summary.graduatedCount, color: "var(--color-primary)" },
    { label: "Maîtrisés", value: summary.masteredCount, color: "var(--color-success)" },
  ];
  const maxValue = Math.max(1, ...categories.map((category) => category.value));

  return (
    <div className="srsDistribution">
      {categories.map((category) => (
        <div key={category.label} className="srsDistribution__row">
          <div className="srsDistribution__label">{category.label}</div>
          <div className="srsDistribution__barTrack">
            <div
              className="srsDistribution__barFill"
              style={{
                width: `${(category.value / maxValue) * 100}%`,
                backgroundColor: category.color,
              }}
            />
          </div>
          <div className="srsDistribution__count">{category.value}</div>
        </div>
      ))}
    </div>
  );
}
