import { Link } from "react-router-dom";

import type { StatsOverview } from "../../api";

type SeriesPreview = {
  tagId: number;
  tagName: string;
  wordsCount: number;
  lastReviewedAt: string | null;
};

type VocabProgressCardProps = {
  overview: StatsOverview | null;
  series: SeriesPreview[];
};

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

export function VocabProgressCard({ overview, series }: VocabProgressCardProps) {
  const totalWords = overview?.totalWords ?? 0;
  const masteredCount = overview?.masteredCount ?? 0;
  const seriesCount = series.length;
  const masteryPercent =
    totalWords > 0 ? Math.min(100, Math.round((masteredCount / totalWords) * 100)) : 0;
  const recentSeries = [...series]
    .sort((left, right) => {
      const leftTime = left.lastReviewedAt ? new Date(left.lastReviewedAt).getTime() : 0;
      const rightTime = right.lastReviewedAt ? new Date(right.lastReviewedAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 3);

  return (
    <div className="dashCard">
      <div className="dashCard__titleRow">
        <h2 className="dashCard__title">Vocabulaire</h2>
        <Link className="dashCard__link" to="/dictionary">
          Voir les séries
        </Link>
      </div>
      <div className="vocabProgress">
        <div className="vocabProgress__hero">
          <div className="vocabProgress__known">{totalWords.toLocaleString("fr-FR")}</div>
          <div className="vocabProgress__knownLabel">
            {pluralize(totalWords, "mot", "mots")} · {pluralize(seriesCount, "série", "séries")}
          </div>
        </div>
        <div className="vocabProgress__mastery">
          <div className="vocabProgress__masteryRow">
            <span>{masteredCount.toLocaleString("fr-FR")} maîtrisés</span>
            <span>{masteryPercent}%</span>
          </div>
          <div className="vocabProgress__barTrack" aria-hidden="true">
            <div className="vocabProgress__barFill" style={{ width: `${masteryPercent}%` }} />
          </div>
        </div>
        {recentSeries.length > 0 ? (
          <div className="vocabProgress__series">
            <div className="vocabProgress__seriesLabel">Récemment révisées</div>
            <div className="vocabProgress__chips">
              {recentSeries.map((item) => (
                <Link
                  key={item.tagId}
                  className="vocabProgress__chip"
                  to={`/train/tag/${item.tagId}?name=${encodeURIComponent(item.tagName)}`}
                >
                  {item.tagName}
                  <span>{item.wordsCount}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="vocabProgress__empty">Ajoute une série pour commencer à réviser.</p>
        )}
      </div>
    </div>
  );
}
