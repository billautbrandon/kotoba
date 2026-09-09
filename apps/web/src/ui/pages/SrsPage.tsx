import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { SeriesListResponse, SrsSummary, SrsWords, WordWithStats } from "../../api";
import {
  fetchSeriesSrsSettings,
  fetchSrsSummary,
  fetchSrsWords,
  updateSrsUntagged,
  updateTagSrsEnabled,
} from "../../api";
import { AudioButton } from "../components/AudioButton";
import {
  type SrsBatchSize,
  loadSrsBatchSize,
  saveSrsBatchSize,
  srsDuePath,
} from "../utils/srsBatch";

type SrsCategory = "hard" | "medium" | "easy" | "mastered";

const categoryLabels: Record<SrsCategory, string> = {
  hard: "Difficile",
  medium: "Moyen",
  easy: "Facile",
  mastered: "Maîtrisé",
};

const categoryDescriptions: Record<SrsCategory, string> = {
  hard: "Taux de réussite inférieur à 65%",
  medium: "Taux de réussite entre 65% et 80%",
  easy: "Taux de réussite supérieur à 80%",
  mastered: "10 réussites consécutives",
};

const BATCH_LABELS: Record<SrsBatchSize, string> = {
  10: "10",
  20: "20",
  30: "30",
  50: "50",
  0: "Tout",
};

export function SrsPage() {
  const navigate = useNavigate();
  const [srsWords, setSrsWords] = useState<SrsWords | null>(null);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const [seriesSettings, setSeriesSettings] = useState<SeriesListResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState<SrsBatchSize>(() => loadSrsBatchSize());
  const [savingSeriesKey, setSavingSeriesKey] = useState<string | null>(null);

  useEffect(() => {
    saveSrsBatchSize(batchSize);
  }, [batchSize]);

  const loadSrsData = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setIsLoading(true);
    setErrorMessage(null);
    try {
      const [loaded, summary, settings] = await Promise.all([
        fetchSrsWords(),
        fetchSrsSummary(),
        fetchSeriesSrsSettings(),
      ]);
      setSrsWords(loaded);
      setSrsSummary(summary);
      setSeriesSettings(settings);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
      if (showSpinner) {
        setSrsWords(null);
        setSrsSummary(null);
        setSeriesSettings(null);
      }
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSrsData(true);
  }, [loadSrsData]);

  async function handleToggleSeries(tagId: number, srsEnabled: boolean) {
    setSavingSeriesKey(`tag-${tagId}`);
    setErrorMessage(null);
    try {
      await updateTagSrsEnabled(tagId, srsEnabled);
      await loadSrsData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setSavingSeriesKey(null);
    }
  }

  async function handleToggleUntagged(includeUntagged: boolean) {
    setSavingSeriesKey("untagged");
    setErrorMessage(null);
    try {
      await updateSrsUntagged(includeUntagged);
      await loadSrsData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setSavingSeriesKey(null);
    }
  }

  function startTraining(category: SrsCategory) {
    const query = batchSize > 0 ? `?limit=${batchSize}` : "";
    navigate(`/train/srs/${category}${query}`);
  }

  const dueCount = srsSummary?.dueCount ?? 0;
  const reviewCount = Math.max(0, dueCount - (srsSummary?.newCount ?? 0));
  const seriesToggleCount = seriesSettings
    ? seriesSettings.series.length + (seriesSettings.untaggedWordsCount > 0 ? 1 : 0)
    : 0;
  const seriesEnabledCount = seriesSettings
    ? seriesSettings.series.filter((seriesItem) => seriesItem.srsEnabled).length +
      (seriesSettings.untaggedWordsCount > 0 && seriesSettings.includeUntagged ? 1 : 0)
    : 0;

  return (
    <div className="srsPage">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">SRS</h1>
          <p className="pageSubtitle">
            Révision espacée : les mots reviennent au bon moment, par petits lots.
          </p>
        </div>
      </div>

      {isLoading ? <div className="muted">Chargement…</div> : null}
      {errorMessage ? <div className="formError">Erreur: {errorMessage}</div> : null}

      {!isLoading && srsSummary ? (
        <div className="srsHero">
          <div className="srsHero__info">
            <div className="srsHero__count">{dueCount}</div>
            <div className="srsHero__label">cartes à réviser</div>
            <div className="srsHero__detail">
              {reviewCount > 0 ? <span>{reviewCount} à revoir</span> : null}
              {reviewCount > 0 && srsSummary.newCount > 0 ? " · " : null}
              {srsSummary.newCount > 0 ? <span>{srsSummary.newCount} nouveaux</span> : null}
              {dueCount === 0 ? <span>Rien n’est dû pour le moment</span> : null}
            </div>
          </div>
          <div className="srsHero__controls">
            <div className="srsHero__batchLabel">Taille du lot</div>
            <div className="srsHero__batch">
              {([10, 20, 30, 50, 0] as SrsBatchSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`srsHero__batchBtn ${batchSize === size ? "srsHero__batchBtn--active" : ""}`}
                  onClick={() => setBatchSize(size)}
                >
                  {BATCH_LABELS[size]}
                </button>
              ))}
            </div>
            <button
              className="button button--primary"
              type="button"
              disabled={dueCount === 0}
              onClick={() => navigate(srsDuePath(batchSize))}
            >
              Commencer
            </button>
          </div>
        </div>
      ) : null}

      {!isLoading && srsSummary ? (
        <div className="srsSummaryBar">
          <div className="srsSummaryBar__item">
            <span className="srsSummaryBar__value">{srsSummary.newCount}</span>
            <span className="srsSummaryBar__label">Nouveaux</span>
          </div>
          <div className="srsSummaryBar__item">
            <span className="srsSummaryBar__value">{srsSummary.learningCount}</span>
            <span className="srsSummaryBar__label">En cours</span>
          </div>
          <div className="srsSummaryBar__item">
            <span className="srsSummaryBar__value">{srsSummary.graduatedCount}</span>
            <span className="srsSummaryBar__label">Gradués</span>
          </div>
          <div className="srsSummaryBar__item">
            <span className="srsSummaryBar__value">{srsSummary.masteredCount}</span>
            <span className="srsSummaryBar__label">Maîtrisés</span>
          </div>
        </div>
      ) : null}

      {!isLoading && seriesSettings && seriesToggleCount > 0 ? (
        <details className="srsSeries">
          <summary className="srsSeries__summary">
            Séries
            <span className="srsSeries__summaryCount">
              {seriesEnabledCount}/{seriesToggleCount} actives
            </span>
          </summary>
          <div className="srsSeries__panel">
            <p className="srsSeries__hint">Les stats sont conservées si tu désactives une série.</p>
            <ul className="srsSeries__list">
            {seriesSettings.series.map((seriesItem) => {
              const seriesKey = `tag-${seriesItem.tagId}`;
              return (
                <li key={seriesItem.tagId} className="srsSeries__row">
                  <div className="srsSeries__info">
                    <span className="srsSeries__name">{seriesItem.tagName}</span>
                    <span className="srsSeries__count">
                      {seriesItem.wordsCount} mot{seriesItem.wordsCount > 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`srsSeries__switch ${seriesItem.srsEnabled ? "srsSeries__switch--on" : ""}`}
                    role="switch"
                    aria-checked={seriesItem.srsEnabled}
                    aria-label={`${seriesItem.tagName} ${seriesItem.srsEnabled ? "activée" : "désactivée"}`}
                    disabled={savingSeriesKey !== null}
                    onClick={() => handleToggleSeries(seriesItem.tagId, !seriesItem.srsEnabled)}
                  >
                    {savingSeriesKey === seriesKey
                      ? "…"
                      : seriesItem.srsEnabled
                        ? "Activée"
                        : "Désactivée"}
                  </button>
                </li>
              );
            })}
            {seriesSettings.untaggedWordsCount > 0 ? (
              <li className="srsSeries__row">
                <div className="srsSeries__info">
                  <span className="srsSeries__name">Sans série</span>
                  <span className="srsSeries__count">
                    {seriesSettings.untaggedWordsCount} mot
                    {seriesSettings.untaggedWordsCount > 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className={`srsSeries__switch ${seriesSettings.includeUntagged ? "srsSeries__switch--on" : ""}`}
                  role="switch"
                  aria-checked={seriesSettings.includeUntagged}
                  aria-label={`Sans série ${seriesSettings.includeUntagged ? "activée" : "désactivée"}`}
                  disabled={savingSeriesKey !== null}
                  onClick={() => handleToggleUntagged(!seriesSettings.includeUntagged)}
                >
                  {savingSeriesKey === "untagged"
                    ? "…"
                    : seriesSettings.includeUntagged
                      ? "Activée"
                      : "Désactivée"}
                </button>
              </li>
            ) : null}
            </ul>
          </div>
        </details>
      ) : null}

      {!isLoading && srsWords ? (
        <div className="srsGrid">
          {(["hard", "medium", "easy", "mastered"] as const)
            .filter((category) => srsWords[category].length > 0)
            .map((category) => (
              <SrsSection
                key={category}
                category={category}
                words={srsWords[category]}
                batchSize={batchSize}
                onStartTraining={() => startTraining(category)}
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}

function SrsSection({
  category,
  words,
  batchSize,
  onStartTraining,
}: {
  category: SrsCategory;
  words: WordWithStats[];
  batchSize: SrsBatchSize;
  onStartTraining: () => void;
}) {
  const label = categoryLabels[category];
  const description = categoryDescriptions[category];
  const shownCount = batchSize > 0 ? Math.min(batchSize, words.length) : words.length;

  const successRate =
    words.length > 0
      ? Math.round(
          (words.reduce((sum, word) => {
            const total = word.success_count + word.partial_count + word.fail_count;
            return sum + (total > 0 ? word.success_count / total : 0);
          }, 0) /
            words.length) *
            100,
        )
      : 0;

  return (
    <div className="srsCard">
      <div className="srsCard__header">
        <div className="srsCard__top">
          <h2 className="srsCard__title">{label}</h2>
          <span className="srsCard__count">{words.length}</span>
        </div>
        <p className="srsCard__description">{description}</p>
        {words.length > 0 ? <div className="srsCard__rate">Taux moyen : {successRate}%</div> : null}
      </div>
      <div className="srsCard__body">
        <div className="srsCard__list">
          {words.slice(0, 3).map((word) => (
            <div key={word.id} className="srsCard__word">
              <span className="srsCard__wordFr">{word.french}</span>
              <span className="srsCard__wordJp">
                {word.kanji ?? word.kana ?? word.romaji ?? "—"}
                {word.kana ? <AudioButton text={word.kana} size="small" /> : null}
              </span>
            </div>
          ))}
          {words.length > 3 ? (
            <div className="srsCard__more">+{words.length - 3} autres</div>
          ) : null}
        </div>
      </div>
      <div className="srsCard__footer">
        <button className="button button--primary" type="button" onClick={onStartTraining}>
          Lancer {shownCount} mot{shownCount > 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
