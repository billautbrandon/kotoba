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
  const streak = streakInfo?.currentStreak ?? 0;
  const weekReviews = reviewsThisWeek(activity);
  const successRate = overview?.avgSuccessRate ?? 0;

  return (
    <div className="dashCard dashCard--span2">
      <div className="dashCard__titleRow">
        <h2 className="dashCard__title">Activité</h2>
      </div>
      <div className="heatmapStats">
        <div className="heatmapStats__item">
          <div className="heatmapStats__value">
            <span className="heatmapStats__flame" aria-hidden="true">
              🔥
            </span>
            {streak}
          </div>
          <div className="heatmapStats__label">
            {streak > 1 ? "jours de série" : "jour de série"}
          </div>
        </div>
        <div className="heatmapStats__item">
          <div className="heatmapStats__value">{weekReviews}</div>
          <div className="heatmapStats__label">cette semaine</div>
        </div>
        <div className="heatmapStats__item">
          <div className="heatmapStats__value">{successRate}%</div>
          <div className="heatmapStats__label">réussite</div>
        </div>
      </div>
      <ActivityHeatmap activity={activity} weekCount={20} compact showLegend />
    </div>
  );
}
