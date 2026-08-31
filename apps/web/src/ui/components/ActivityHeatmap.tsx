import { useMemo } from "react";

import type { ActivityDay } from "../../api";

type HeatmapDay = {
  date: string;
  count: number;
  dayOfWeek: number;
};

type ActivityHeatmapProps = {
  activity: ActivityDay[];
  weekCount?: number;
  compact?: boolean;
};

export function ActivityHeatmap({
  activity,
  weekCount = 52,
  compact = false,
}: ActivityHeatmapProps) {
  const heatmapData = useMemo(() => {
    const activityMap = new Map(activity.map((day) => [day.activity_date, day.reviews_count]));

    const today = new Date();
    const dayOfWeek = today.getDay();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - dayOfWeek));

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (weekCount * 7 - 1));

    const weeks: HeatmapDay[][] = [];
    let currentWeek: HeatmapDay[] = [];
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const dateString = cursor.toISOString().slice(0, 10);
      const count = activityMap.get(dateString) ?? 0;
      const weekDay = cursor.getDay();

      currentWeek.push({ date: dateString, count, dayOfWeek: weekDay });

      if (weekDay === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks;
  }, [activity, weekCount]);

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
    if (count === 0) return "var(--color-heatmap-0)";
    const ratio = count / maxCount;
    if (ratio < 0.25) return "var(--color-heatmap-1)";
    if (ratio < 0.5) return "var(--color-heatmap-2)";
    if (ratio < 0.75) return "var(--color-heatmap-3)";
    return "var(--color-heatmap-4)";
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
    <div className={`heatmap${compact ? " heatmap--compact" : ""}`}>
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
