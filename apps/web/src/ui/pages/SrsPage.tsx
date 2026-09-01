import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { SrsSummary, SrsWords, WordWithStats } from "../../api";
import { fetchSrsSummary, fetchSrsWords } from "../../api";
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState<SrsBatchSize>(() => loadSrsBatchSize());

  useEffect(() => {
    saveSrsBatchSize(batchSize);
  }, [batchSize]);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [loaded, summary] = await Promise.all([fetchSrsWords(), fetchSrsSummary()]);
        if (!isCancelled) {
          setSrsWords(loaded);
          setSrsSummary(summary);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
          setSrsWords(null);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  function startTraining(category: SrsCategory) {
    const query = batchSize > 0 ? `?limit=${batchSize}` : "";
    navigate(`/train/srs/${category}${query}`);
  }

  const dueCount = srsSummary?.dueCount ?? 0;
  const reviewCount = Math.max(0, dueCount - (srsSummary?.newCount ?? 0));

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
