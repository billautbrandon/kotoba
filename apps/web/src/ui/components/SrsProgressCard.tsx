import { Link } from "react-router-dom";

import type { SrsSummary, StatsOverview } from "../../api";

type SrsProgressCardProps = {
  summary: SrsSummary | null;
  overview: StatsOverview | null;
};

export function SrsProgressCard({ summary, overview }: SrsProgressCardProps) {
  const masteredCount = overview?.masteredCount ?? summary?.masteredCount ?? 0;
  const totalWords = Math.max(1, overview?.totalWords ?? 0);
  const progressPercent = Math.min(100, Math.round((masteredCount / totalWords) * 100));

  const pills = [
    { label: "Nouveaux", value: summary?.newCount ?? 0 },
    { label: "En cours", value: summary?.learningCount ?? 0 },
    { label: "Gradués", value: summary?.graduatedCount ?? 0 },
    { label: "Maîtrisés", value: summary?.masteredCount ?? 0 },
  ];

  return (
    <div className="dashCard">
      <div className="dashCard__titleRow">
        <h2 className="dashCard__title">Progression SRS</h2>
        <Link className="dashCard__link" to="/srs">
          Voir le SRS
        </Link>
      </div>
      <div className="srsProgress">
        <div className="srsProgress__level">{progressPercent}% maîtrisés</div>
        <div className="srsProgress__barTrack">
          <div className="srsProgress__barFill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="srsProgress__xp">
          {masteredCount} / {overview?.totalWords ?? 0} mots
        </div>
        <div className="srsProgress__pills">
          {pills.map((pill) => (
            <div key={pill.label} className="srsProgress__pill">
              <span className="srsProgress__pillValue">{pill.value}</span>
              <span className="srsProgress__pillLabel">{pill.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
