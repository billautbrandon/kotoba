import { useEffect, useMemo, useState } from "react";

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
        <h1 className="pageTitle">Statistiques</h1>
        <p className="pageSubtitle">Vue d'ensemble de ta progression</p>
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

      {srsSummary && (
        <div className="statsSection">
          <h2 className="statsSection__title">Distribution SRS</h2>
          <SrsDistributionChart summary={srsSummary} />
        </div>
      )}

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
    { label: "En cours", value: summary.learningCount, color: "#f59e0b" },
    { label: "Gradués", value: summary.graduatedCount, color: "#3b82f6" },
    { label: "Maîtrisés", value: summary.masteredCount, color: "#22c55e" },
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

function ActivityHeatmap({ activity }: { activity: ActivityDay[] }) {
  const heatmapData = useMemo(() => {
    const activityMap = new Map(activity.map((day) => [day.activity_date, day.reviews_count]));

    const today = new Date();
    const dayOfWeek = today.getDay();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - dayOfWeek));

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 364);

    const weeks: { date: string; count: number; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const count = activityMap.get(dateStr) ?? 0;
      const weekDay = cursor.getDay();

      currentWeek.push({ date: dateStr, count, dayOfWeek: weekDay });

      if (weekDay === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks;
  }, [activity]);

  const maxCount = useMemo(() => {
    let maximum = 1;
    for (const week of heatmapData) {
      for (const day of week) {
        if (day.count > maximum) maximum = day.count;
      }
    }
    return maximum;
  }, [heatmapData]);

  function getIntensity(count: number): string {
    if (count === 0) return "var(--color-heatmap-0, #ebedf0)";
    const ratio = count / maxCount;
    if (ratio < 0.25) return "var(--color-heatmap-1, #9be9a8)";
    if (ratio < 0.5) return "var(--color-heatmap-2, #40c463)";
    if (ratio < 0.75) return "var(--color-heatmap-3, #30a14e)";
    return "var(--color-heatmap-4, #216e39)";
  }

  const dayLabels = [
    { key: "dim", label: "Dim" },
    { key: "lun", label: "" },
    { key: "mar", label: "Mar" },
    { key: "mer", label: "" },
    { key: "jeu", label: "Jeu" },
    { key: "ven", label: "" },
    { key: "sam", label: "Sam" },
  ];

  return (
    <div className="heatmap">
      <div className="heatmap__labels">
        {dayLabels.map((day) => (
          <div key={day.key} className="heatmap__dayLabel">
            {day.label}
          </div>
        ))}
      </div>
      <div className="heatmap__grid">
        {heatmapData.map((week) => (
          <div key={week[0]?.date ?? "empty"} className="heatmap__week">
            {week.map((day) => (
              <div
                key={day.date}
                className="heatmap__cell"
                style={{ backgroundColor: getIntensity(day.count) }}
                title={`${day.date}: ${day.count} révisions`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
