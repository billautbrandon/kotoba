import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { SrsWords, WordWithStats } from "../../api";
import { fetchSrsWords } from "../../api";
import { AudioButton } from "../components/AudioButton";

type SrsCategory = "hard" | "medium" | "easy";

const categoryLabels: Record<SrsCategory, string> = {
  hard: "Difficile",
  medium: "Moyen",
  easy: "Facile",
};

const categoryDescriptions: Record<SrsCategory, string> = {
  hard: "Mots avec score négatif ou fail rate > 50%",
  medium: "Mots avec une note acceptable mais pas encore 5 réussites de suite",
  easy: "Mots réussis 5 fois de suite",
};

export function SrsPage() {
  const navigate = useNavigate();
  const [srsWords, setSrsWords] = useState<SrsWords | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const loaded = await fetchSrsWords();
        if (!isCancelled) {
          setSrsWords(loaded);
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
        <h1 className="pageTitle">SRS</h1>
        <p className="pageSubtitle">
          Répartition des mots selon ton apprentissage : Difficile, Moyen, Facile. Entraîne-toi par
          catégorie pour progresser efficacement.
        </p>
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

      {!isLoading && srsWords ? (
        <div
          style={{
            marginTop: "var(--space-8)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-10)",
          }}
        >
          {(["hard", "medium", "easy"] as const).map((category) => {
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

  return (
    <div
      style={{
        border: "2px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "var(--space-5)",
          background: "var(--color-panel-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>{label}</h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
            {description} — {words.length} mot(s)
          </p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={onStartTraining}
          disabled={words.length === 0}
        >
          Lancer l&apos;entraînement
        </button>
      </div>
      {words.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Français</th>
              <th>JP</th>
              <th>Score</th>
              <th>Réussites de suite</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => (
              <tr key={word.id}>
                <td style={{ fontWeight: 600 }}>{word.french}</td>
                <td className="muted">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    {word.kanji ?? word.kana ?? word.romaji ?? "—"}
                    {word.kana && <AudioButton text={word.kana} size="small" />}
                  </span>
                </td>
                <td className="muted">{word.score}</td>
                <td className="muted">{word.consecutive_success_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: "var(--space-6)", textAlign: "center" }} className="muted">
          Aucun mot dans cette catégorie pour le moment.
        </div>
      )}
    </div>
  );
}
