import React, { useEffect, useMemo, useState } from "react";

import type { WordWithTags } from "../../api";
import { fetchWordsWithTags } from "../../api";
import { extractKanji, kanjiSvgExists } from "../../utils/kanji";
import { KanjiStrokeViewer } from "../components/KanjiStrokeViewer";

export function KanjiLearningPage() {
  const [words, setWords] = useState<WordWithTags[]>([]);
  const [selectedWord, setSelectedWord] = useState<WordWithTags | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Charger les mots au montage
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const fetched = (await fetchWordsWithTags(false)) as WordWithTags[];
        if (isMounted) {
          setWords(fetched);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Erreur lors du chargement des mots",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Extraire les kanji du mot sélectionné
  const kanjiList = useMemo(() => {
    if (!selectedWord?.kanji) {
      return [];
    }
    return extractKanji(selectedWord.kanji);
  }, [selectedWord]);

  // Filtrer les mots qui ont des kanji
  const wordsWithKanji = useMemo(() => {
    return words.filter((word) => word.kanji && extractKanji(word.kanji).length > 0);
  }, [words]);

  // Sélectionner automatiquement le premier kanji quand un mot est sélectionné
  useEffect(() => {
    if (selectedWord && kanjiList.length > 0 && !selectedKanji) {
      setSelectedKanji(kanjiList[0]);
    }
  }, [selectedWord, kanjiList, selectedKanji]);

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Apprendre le tracé</h1>
          <p className="pageSubtitle">
            Sélectionne un mot contenant des kanji pour voir l'ordre de tracé.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel__content">
          {isLoading ? (
            <div className="muted">Chargement...</div>
          ) : errorMessage ? (
            <div className="formError">{errorMessage}</div>
          ) : wordsWithKanji.length === 0 ? (
            <div className="muted">
              Aucun mot avec kanji trouvé. Ajoute des mots avec des kanji dans la page "Mots".
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
              {/* Sélection du mot */}
              <div>
                <label className="field">
                  <div className="field__label">Sélectionner un mot</div>
                  <select
                    className="input"
                    value={selectedWord?.id ?? ""}
                    onChange={(e) => {
                      const wordId = Number(e.target.value);
                      const word = wordsWithKanji.find((w) => w.id === wordId);
                      setSelectedWord(word ?? null);
                      setSelectedKanji(null);
                      setShowNumbers(false);
                      setAnimate(false);
                    }}
                  >
                    <option value="">-- Choisir un mot --</option>
                    {wordsWithKanji.map((word) => (
                      <option key={word.id} value={word.id}>
                        {word.french} {word.kanji ? `(${word.kanji})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Affichage du kanji sélectionné */}
              {selectedWord && kanjiList.length > 0 && (
                <div>
                  <div
                    style={{
                      marginBottom: "var(--space-6)",
                      padding: "var(--space-5)",
                      background: "var(--color-panel-subtle)",
                      borderRadius: "var(--radius-lg)",
                    }}
                  >
                    <div
                      style={{ fontSize: "18px", fontWeight: 700, marginBottom: "var(--space-3)" }}
                    >
                      {selectedWord.french}
                    </div>
                    <div style={{ fontSize: "16px", color: "var(--color-muted)" }}>
                      {selectedWord.kanji && (
                        <>
                          <strong>Kanji:</strong> {selectedWord.kanji}
                        </>
                      )}
                      {selectedWord.kana && (
                        <>
                          {" • "}
                          <strong>Kana:</strong> {selectedWord.kana}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Sélection du kanji si plusieurs */}
                  {kanjiList.length > 1 && (
                    <div style={{ marginBottom: "var(--space-6)" }}>
                      <div className="field__label" style={{ marginBottom: "var(--space-3)" }}>
                        Choisir un kanji
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                        {kanjiList.map((kanji) => (
                          <button
                            key={kanji}
                            type="button"
                            className={`button ${selectedKanji === kanji ? "button--primary" : ""}`}
                            onClick={() => {
                              setSelectedKanji(kanji);
                              setShowNumbers(false);
                              setAnimate(false);
                            }}
                            style={{
                              fontSize: "24px",
                              padding: "var(--space-3) var(--space-5)",
                              minWidth: "60px",
                            }}
                          >
                            {kanji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contrôles */}
                  {selectedKanji && (
                    <div
                      style={{
                        marginBottom: "var(--space-6)",
                        display: "flex",
                        gap: "var(--space-4)",
                        flexWrap: "wrap",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={showNumbers}
                          onChange={(e) => setShowNumbers(e.target.checked)}
                        />
                        <span>Afficher les numéros de traits</span>
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={animate}
                          onChange={(e) => setAnimate(e.target.checked)}
                        />
                        <span>Animer le tracé</span>
                      </label>
                    </div>
                  )}

                  {/* Visualiseur de kanji */}
                  {selectedKanji && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--space-6)",
                        padding: "var(--space-8)",
                        background: "var(--color-panel-subtle)",
                        borderRadius: "var(--radius-lg)",
                        border: "2px solid var(--color-border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 700,
                          marginBottom: "var(--space-2)",
                        }}
                      >
                        {selectedKanji}
                      </div>
                      <KanjiStrokeViewer
                        kanji={selectedKanji}
                        showNumbers={showNumbers}
                        animate={animate}
                        size={300}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
