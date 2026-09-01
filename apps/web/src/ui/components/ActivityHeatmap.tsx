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
  showLegend?: boolean;
};

const MONTH_LABELS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

const DAY_LABELS = [
  { key: "dim", label: "Dim" },
  { key: "lun", label: "" },
  { key: "mar", label: "Mar" },
  { key: "mer", label: "" },
  { key: "jeu", label: "Jeu" },
  { key: "ven", label: "" },
  { key: "sam", label: "Sam" },
];

const HEATMAP_LEVELS = [
  "var(--color-heatmap-0)",
  "var(--color-heatmap-1)",
  "var(--color-heatmap-2)",
  "var(--color-heatmap-3)",
  "var(--color-heatmap-4)",
];

function parseLocalDate(dateString: string): Date {
  return new Date(`${dateString}T12:00:00`);
}

function formatHeatmapTitle(dateString: string, count: number): string {
  const formattedDate = parseLocalDate(dateString).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const reviewLabel = count === 1 ? "révision" : "révisions";
  return `${formattedDate} : ${count} ${reviewLabel}`;
}

export function ActivityHeatmap({
  activity,
  weekCount = 52,
  compact = false,
  showLegend,
}: ActivityHeatmapProps) {
  const shouldShowLegend = showLegend ?? !compact;
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

  const monthLabels = useMemo(() => {
    const labels: Array<string | null> = heatmapData.map(() => null);
    let lastMonth = -1;
    let lastLabelWeek = -3;
    const minGap = compact ? 1 : 2;

    heatmapData.forEach((week, weekIndex) => {
      const firstDay = week[0];
      if (!firstDay) return;
      const month = parseLocalDate(firstDay.date).getMonth();
      if (month === lastMonth) return;
      lastMonth = month;
      if (weekIndex === 0 || weekIndex - lastLabelWeek >= minGap) {
        labels[weekIndex] = MONTH_LABELS[month];
        lastLabelWeek = weekIndex;
      }
    });

    return labels;
  }, [compact, heatmapData]);

  function getIntensity(count: number): string {
    if (count === 0) return HEATMAP_LEVELS[0];
    const ratio = count / maxCount;
    if (ratio < 0.25) return HEATMAP_LEVELS[1];
    if (ratio < 0.5) return HEATMAP_LEVELS[2];
    if (ratio < 0.75) return HEATMAP_LEVELS[3];
    return HEATMAP_LEVELS[4];
  }

  return (
    <div className={`heatmap${compact ? " heatmap--compact" : ""}`}>
      <div className="heatmap__body">
        <div className="heatmap__labels">
          {DAY_LABELS.map((day) => (
            <div key={day.key} className="heatmap__dayLabel">
              {day.label}
            </div>
          ))}
        </div>
        <div className="heatmap__gridWrap">
          <div className="heatmap__months">
            {heatmapData.map((week, weekIndex) => (
              <div key={week[0]?.date ?? `month-${weekIndex}`} className="heatmap__month">
                {monthLabels[weekIndex] ?? ""}
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
                    title={formatHeatmapTitle(day.date, day.count)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {shouldShowLegend ? (
        <div className="heatmap__legend">
          <span>Moins</span>
          {HEATMAP_LEVELS.map((levelColor) => (
            <span
              key={levelColor}
              className="heatmap__legendSwatch"
              style={{ backgroundColor: levelColor }}
              aria-hidden="true"
            />
          ))}
          <span>Plus</span>
        </div>
      ) : null}
    </div>
  );
}
