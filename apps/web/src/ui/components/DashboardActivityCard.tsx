import type { ActivityDay, StatsOverview, StreakInfo } from "../../api";
import { ActivityHeatmap } from "./ActivityHeatmap";

type DashboardActivityCardProps = {
  activity: ActivityDay[];
  streakInfo: StreakInfo | null;
  overview: StatsOverview | null;
};

function reviewsThisWeek(activity: ActivityDay[]): number {
  const today = new Date();
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(today.getDate() - mondayOffset);
  const startString = startOfWeek.toISOString().slice(0, 10);
  return activity
    .filter((day) => day.activity_date >= startString)
    .reduce((total, day) => total + day.reviews_count, 0);
}

export function DashboardActivityCard({
  activity,
  streakInfo,
  overview,
}: DashboardActivityCardProps) {
  return (
    <div className="dashCard dashCard--span2">
      <h2 className="dashCard__title">Activité</h2>
      <ActivityHeatmap activity={activity} weekCount={16} compact />
      <div className="heatmapStats">
        <div className="heatmapStats__item">
          <div className="heatmapStats__value">{streakInfo?.currentStreak ?? 0}</div>
          <div className="heatmapStats__label">jours de série</div>
        </div>
        <div className="heatmapStats__item">
          <div className="heatmapStats__value">{reviewsThisWeek(activity)}</div>
          <div className="heatmapStats__label">cette semaine</div>
        </div>
        <div className="heatmapStats__item">
          <div className="heatmapStats__value">{overview?.avgSuccessRate ?? 0}%</div>
          <div className="heatmapStats__label">réussite</div>
        </div>
      </div>
    </div>
  );
}
