import type React from "react";

import type { ActivityDay, StatsOverview, StreakInfo } from "../../api";

type VocabProgressCardProps = {
  overview: StatsOverview | null;
  streakInfo: StreakInfo | null;
  activity: ActivityDay[];
};

function lastSevenDays(
  activity: ActivityDay[],
): { date: string; count: number; isToday: boolean }[] {
  const activityMap = new Map(activity.map((day) => [day.activity_date, day.reviews_count]));
  const bars: { date: string; count: number; isToday: boolean }[] = [];
  const today = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dateString = date.toISOString().slice(0, 10);
    bars.push({
      date: dateString,
      count: activityMap.get(dateString) ?? 0,
      isToday: offset === 0,
    });
  }
  return bars;
}

export function VocabProgressCard({ overview, streakInfo, activity }: VocabProgressCardProps) {
  const todayReviews = streakInfo?.todayReviews ?? 0;
  const dailyGoal = Math.max(1, streakInfo?.dailyGoal ?? 20);
  const progressPercent = Math.min(100, Math.round((todayReviews / dailyGoal) * 100));
  const bars = lastSevenDays(activity);
  const maxBar = Math.max(1, ...bars.map((bar) => bar.count));

  return (
    <div className="dashCard">
      <h2 className="dashCard__title">Vocabulaire</h2>
      <div className="vocabProgress">
        <div className="vocabProgress__top">
          <div
            className="progressRing"
            style={{ "--progress": progressPercent } as React.CSSProperties}
          >
            <div className="progressRing__inner">
              <div className="progressRing__value">
                {todayReviews}/{dailyGoal}
              </div>
              <div className="progressRing__label">aujourd'hui</div>
            </div>
          </div>
          <div>
            <div className="vocabProgress__known">
              {(overview?.masteredCount ?? 0).toLocaleString("fr-FR")}
            </div>
            <div className="vocabProgress__knownLabel">mots maîtrisés</div>
          </div>
        </div>
        <div className="sparkBars" aria-hidden="true">
          {bars.map((bar) => (
            <div
              key={bar.date}
              className={`sparkBars__bar${bar.isToday ? " sparkBars__bar--today" : ""}`}
              style={{ height: `${Math.max(8, (bar.count / maxBar) * 100)}%` }}
              title={`${bar.date}: ${bar.count} révisions`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
