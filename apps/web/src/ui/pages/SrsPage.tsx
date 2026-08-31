import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { SrsSummary, SrsWords, WordWithStats } from "../../api";
import { fetchSrsSummary, fetchSrsWords } from "../../api";
import { AudioButton } from "../components/AudioButton";

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

export function SrsPage() {
  const navigate = useNavigate();
  const [srsWords, setSrsWords] = useState<SrsWords | null>(null);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  function startTraining(category: SrsCategory) {
    navigate(`/train/srs/${category}`);
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">SRS</h1>
          <p className="pageSubtitle">
            Révision espacée : les mots reviennent au bon moment pour une mémorisation durable.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ marginTop: 16 }} className="muted">
          Chargement…
        </div>
      ) : null}

      {errorMessage ? (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Erreur: {errorMessage}</div>
        </div>
      ) : null}

      {!isLoading && srsSummary && srsSummary.dueCount > 0 && (
        <div className="srsDueCard">
          <div className="srsDueCard__info">
            <div className="srsDueCard__count">{srsSummary.dueCount}</div>
            <div className="srsDueCard__label">mots à réviser</div>
            <div className="srsDueCard__detail">
              {srsSummary.newCount > 0 && <span>{srsSummary.newCount} nouveaux</span>}
              {srsSummary.newCount > 0 && srsSummary.dueCount - srsSummary.newCount > 0 && " · "}
              {srsSummary.dueCount - srsSummary.newCount > 0 && (
                <span>{srsSummary.dueCount - srsSummary.newCount} à revoir</span>
              )}
            </div>
          </div>
          <button
            className="button button--primary"
            type="button"
            onClick={() => navigate("/train/srs/due")}
            style={{ padding: "var(--space-3) var(--space-6)", fontSize: "16px" }}
          >
            Commencer la révision
          </button>
        </div>
      )}

      {!isLoading && srsSummary && (
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
      )}

      {!isLoading && srsWords ? (
        <div className="srsGrid">
          {(["hard", "medium", "easy", "mastered"] as const).map((category) => {
            const words = srsWords[category];
            return (
              <SrsSection
                key={category}
                category={category}
                words={words}
                onStartTraining={() => startTraining(category)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SrsSection({
  category,
  words,
  onStartTraining,
}: {
  category: SrsCategory;
  words: WordWithStats[];
  onStartTraining: () => void;
}) {
  const label = categoryLabels[category];
  const description = categoryDescriptions[category];

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
        {words.length > 0 && <div className="srsCard__rate">Taux moyen : {successRate}%</div>}
      </div>
      <div className="srsCard__body">
        {words.length > 0 ? (
          <div className="srsCard__list">
            {words.slice(0, 3).map((word) => (
              <div key={word.id} className="srsCard__word">
                <span className="srsCard__wordFr">{word.french}</span>
                <span className="srsCard__wordJp">
                  {word.kanji ?? word.kana ?? word.romaji ?? "—"}
                  {word.kana && <AudioButton text={word.kana} size="small" />}
                </span>
              </div>
            ))}
            {words.length > 3 && <div className="srsCard__more">+{words.length - 3} autres</div>}
          </div>
        ) : (
          <div className="srsCard__empty">Aucun mot</div>
        )}
      </div>
      <div className="srsCard__footer">
        <button
          className="button button--primary"
          type="button"
          onClick={onStartTraining}
          disabled={words.length === 0}
          style={{ width: "100%" }}
        >
          Lancer l&apos;entraînement
        </button>
      </div>
    </div>
  );
}
