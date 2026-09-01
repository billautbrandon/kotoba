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
import { PillNav } from "../components/PillNav";
import { WeakPointsPanel } from "../components/WeakPointsPanel";
import { XpBar } from "../components/XpBar";

type StatsTab = "overview" | "activity" | "practice" | "badges";

const STATS_TABS: Array<{ id: StatsTab; label: string; hint: string }> = [
  { id: "overview", label: "Vue d’ensemble", hint: "Mots et série" },
  { id: "activity", label: "Activité", hint: "Tes révisions" },
  { id: "practice", label: "SRS", hint: "Mémorisation" },
  { id: "badges", label: "Badges", hint: "Succès" },
];

export function StatsPage() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<StatsTab>("overview");

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setHasLoadError(false);
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
        if (!isCancelled) setHasLoadError(true);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  const activeSinceLabel = overview?.activeSince
    ? new Date(overview.activeSince).toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      })
    : null;
  const masteredPercent =
    overview && overview.totalWords > 0
      ? Math.round((overview.masteredCount / overview.totalWords) * 100)
      : 0;
  const todayReviews = streakInfo?.todayReviews ?? 0;

  return (
    <div className="statsPage">
      <div className="pageHeader">
        <div>
          <p className="statsPage__kicker">Progression</p>
          <h1 className="pageTitle">Statistiques</h1>
          <p className="pageSubtitle">
            Vue d'ensemble de tes révisions, de ta série et de tes badges
            {activeSinceLabel ? ` · actif depuis ${activeSinceLabel}` : ""}.
          </p>
        </div>
      </div>

      {isLoading ? <StatsLoadingState /> : null}

      {!isLoading && hasLoadError ? (
        <div className="statsPanel">
          <p className="statsPanel__title">Impossible de charger les statistiques</p>
          <p className="statsPanel__text">Réessaie dans un instant.</p>
        </div>
      ) : null}

      {!isLoading && !hasLoadError ? (
        <>
          <PillNav
            ariaLabel="Sections des statistiques"
            items={STATS_TABS}
            value={activeTab}
            onChange={setActiveTab}
          />

          {activeTab === "overview" ? (
            <>
              {streakInfo ? (
                <div className="statsPanel statsPanel--xp">
                  <XpBar
                    level={streakInfo.level}
                    xpInLevel={streakInfo.xpInLevel}
                    xpForNextLevel={streakInfo.xpForNextLevel}
                  />
                </div>
              ) : null}

              {overview ? (
                <div className="statsOverview">
                  <OverviewCard
                    label="Mots totaux"
                    value={overview.totalWords}
                    hint="Dans ton vocabulaire"
                    tone="primary"
                  />
                  <OverviewCard
                    label="Maîtrisés"
                    value={overview.masteredCount}
                    hint={
                      overview.totalWords > 0
                        ? `${masteredPercent}% du vocabulaire`
                        : "Aucun mot encore"
                    }
                    tone="success"
                  />
                  <OverviewCard
                    label="Taux de réussite"
                    value={`${overview.avgSuccessRate}%`}
                    hint="Sur l'ensemble des révisions"
                    tone="accent"
                  />
                  <OverviewCard
                    label="Révisions"
                    value={overview.totalReviews}
                    hint="Toutes sessions confondues"
                  />
                  <OverviewCard
                    label="Série actuelle"
                    value={`${streakInfo?.currentStreak ?? 0}`}
                    hint={streakInfo?.currentStreak === 1 ? "jour d'affilée" : "jours d'affilée"}
                    tone="warning"
                  />
                  <OverviewCard
                    label="Aujourd'hui"
                    value={todayReviews}
                    hint={todayReviews === 1 ? "révision aujourd'hui" : "révisions aujourd'hui"}
                  />
                </div>
              ) : (
                <div className="statsPanel">
                  <p className="statsPanel__title">Pas encore de données</p>
                  <p className="statsPanel__text">
                    Ajoute des mots et lance une session pour voir tes statistiques ici.
                  </p>
                </div>
              )}

              <WeakPointsPanel />
            </>
          ) : null}

          {activeTab === "activity" ? (
            <div className="statsPanel">
              <div className="statsPanel__header">
                <div>
                  <h2 className="statsPanel__title">Activité</h2>
                  <p className="statsPanel__text">Tes révisions sur les 12 derniers mois</p>
                </div>
              </div>
              {activity.length === 0 ? (
                <p className="statsPanel__empty">Aucune révision enregistrée pour le moment.</p>
              ) : null}
              <ActivityHeatmap activity={activity} />
            </div>
          ) : null}

          {activeTab === "practice" && srsSummary ? (
            <div className="statsPanel">
              <div className="statsPanel__header">
                <div>
                  <h2 className="statsPanel__title">Distribution SRS</h2>
                  <p className="statsPanel__text">
                    Où en est ton vocabulaire dans le cycle de mémorisation
                  </p>
                </div>
              </div>
              <SrsDistributionChart summary={srsSummary} />
            </div>
          ) : null}

          {activeTab === "badges" ? <BadgeGrid /> : null}
        </>
      ) : null}
    </div>
  );
}

function StatsLoadingState() {
  return (
    <div className="statsLoading" aria-busy="true" aria-live="polite">
      <span className="srOnly">Chargement des statistiques…</span>
      <div className="statsOverview">
        {["a", "b", "c", "d", "e", "f"].map((placeholderKey) => (
          <div key={placeholderKey} className="statsCard statsCard--skeleton" />
        ))}
      </div>
      <div className="statsPanel statsPanel--skeleton" />
    </div>
  );
}

function OverviewCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "primary" | "success" | "accent" | "warning";
}) {
  return (
    <div className={`statsCard statsCard--${tone}`}>
      <div className="statsCard__label">{label}</div>
      <div className="statsCard__value">{value}</div>
      {hint ? <div className="statsCard__hint">{hint}</div> : null}
    </div>
  );
}

function SrsDistributionChart({ summary }: { summary: SrsSummary }) {
  const categories = [
    { label: "Nouveaux", value: summary.newCount, color: "var(--color-muted-light)" },
    { label: "En cours", value: summary.learningCount, color: "var(--color-warning)" },
    { label: "Gradués", value: summary.graduatedCount, color: "var(--color-primary)" },
    { label: "Maîtrisés", value: summary.masteredCount, color: "var(--color-success)" },
  ];
  const totalCount = categories.reduce((sum, category) => sum + category.value, 0);
  const maxValue = Math.max(1, ...categories.map((category) => category.value));

  if (totalCount === 0) {
    return <p className="statsPanel__empty">Ajoute des mots pour voir leur répartition SRS.</p>;
  }

  return (
    <div className="srsDistribution">
      {categories.map((category) => {
        const percent = Math.round((category.value / totalCount) * 100);
        return (
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
            <div className="srsDistribution__meta">
              <span className="srsDistribution__count">{category.value}</span>
              <span className="srsDistribution__percent">{percent}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
