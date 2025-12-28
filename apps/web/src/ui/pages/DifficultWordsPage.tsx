import React, { useEffect, useState } from "react";

import { type WordWithStats, computeFailRate, fetchDifficultWords } from "../../api";
import { AudioButton } from "../components/AudioButton";

export function DifficultWordsPage() {
  const [words, setWords] = useState<WordWithStats[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const loadedWords = await fetchDifficultWords();
        if (!isCancelled) {
          setWords(loadedWords);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
          setWords([]);
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

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Mots difficiles</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Vue filtrée: score bas ou fail rate élevé (seuils configurables côté API).
          </div>
        </div>
        <div className="row">
          <a className="button button--primary" href="/train/difficult">
            Entraîner ces mots
          </a>
        </div>
      </div>

      {isLoading ? (
        <div style={{ marginTop: 16 }} className="muted">
          Chargement…
        </div>
      ) : null}

      {errorMessage ? (
        <div style={{ marginTop: 16 }} className="muted">
          Erreur: {errorMessage}
        </div>
      ) : null}

      {!isLoading && words && words.length === 0 ? (
        <div style={{ marginTop: 16 }} className="muted">
          Aucun mot ne matche la règle “difficile” pour le moment.
        </div>
      ) : null}

      {words && words.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Français</th>
                <th>JP</th>
                <th>Stats</th>
              </tr>
            </thead>
            <tbody>
              {words.map((word) => {
                const attempts = word.success_count + word.partial_count + word.fail_count;
                const failRate = computeFailRate(word);

                return (
                  <tr key={word.id}>
                    <td>{word.french}</td>
                    <td className="muted">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        {word.kanji ?? word.kana ?? word.romaji ?? "—"}
                        {word.kana && <AudioButton text={word.kana} size="small" />}
                      </span>
                    </td>
                    <td className="muted">
                      {attempts} essais — ❌ {(failRate * 100).toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
