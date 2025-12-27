import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type ReviewResult,
  type WordWithStats,
  fetchDifficultWords,
  fetchSeriesWords,
  fetchWords,
  submitReview,
} from "../../api";

type TrainMode = "all" | "difficult" | "tag";

export function TrainPage(props: { mode: TrainMode }) {
  const routeParams = useParams();
  const tagId = props.mode === "tag" ? Number(routeParams.tagId) : null;

  const [words, setWords] = useState<WordWithStats[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [sessionReviewedCount, setSessionReviewedCount] = useState<number>(0);
  const [sessionSuccessCount, setSessionSuccessCount] = useState<number>(0);
  const [sessionPartialCount, setSessionPartialCount] = useState<number>(0);
  const [sessionFailCount, setSessionFailCount] = useState<number>(0);
  const [sessionScoreDelta, setSessionScoreDelta] = useState<number>(0);
  const [isSessionFinished, setIsSessionFinished] = useState<boolean>(false);

  const modeLabel =
    props.mode === "difficult"
      ? "Mots difficiles"
      : props.mode === "tag"
        ? `Série (tag ${tagId ?? "?"})`
        : "Tous les mots";

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsRevealed(false);
      setCurrentIndex(0);
      setIsSessionFinished(false);
      setSessionReviewedCount(0);
      setSessionSuccessCount(0);
      setSessionPartialCount(0);
      setSessionFailCount(0);
      setSessionScoreDelta(0);

      try {
        let loadedWords: WordWithStats[] = [];
        if (props.mode === "difficult") {
          loadedWords = await fetchDifficultWords();
        } else if (props.mode === "tag") {
          if (!tagId || !Number.isFinite(tagId)) {
            throw new Error("Tag invalide");
          }
          loadedWords = await fetchSeriesWords(tagId);
        } else {
          loadedWords = (await fetchWords(true)) as WordWithStats[];
        }

        const shuffledWords = shuffleWords(loadedWords);
        if (!isCancelled) {
          setWords(shuffledWords);
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
  }, [props.mode, tagId]);

  const currentWord = useMemo(() => {
    if (!words || words.length === 0) return null;
    return words[currentIndex] ?? null;
  }, [words, currentIndex]);

  async function handleReview(reviewResult: ReviewResult) {
    if (!currentWord) return;
    setIsSubmitting(true);
    try {
      await submitReview(currentWord.id, reviewResult);
      const scoreDelta = computeSessionScoreDelta(reviewResult);
      setSessionReviewedCount((previousValue) => previousValue + 1);
      setSessionScoreDelta((previousValue) => previousValue + scoreDelta);
      if (reviewResult === "success") {
        setSessionSuccessCount((previousValue) => previousValue + 1);
      } else if (reviewResult === "partial") {
        setSessionPartialCount((previousValue) => previousValue + 1);
      } else {
        setSessionFailCount((previousValue) => previousValue + 1);
      }

      advanceToNextWord(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  function advanceToNextWord(isReviewed: boolean) {
    if (!words || words.length === 0) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= words.length) {
      if (isReviewed) {
        setIsSessionFinished(true);
      }
      return;
    }
    setCurrentIndex(nextIndex);
    setIsRevealed(false);
  }

  function restartSession() {
    if (!words) return;
    setWords(shuffleWords(words));
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsSessionFinished(false);
    setSessionReviewedCount(0);
    setSessionSuccessCount(0);
    setSessionPartialCount(0);
    setSessionFailCount(0);
    setSessionScoreDelta(0);
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{modeLabel}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Révèle, puis choisis ✅ / ⚠️ / ❌ — l’app enregistre ton jugement.
          </div>
        </div>
        <div className="row">
          <Link className="button" to="/">
            Séries
          </Link>
          <Link className="button" to="/train">
            Tous
          </Link>
          <Link className="button" to="/train/difficult">
            Difficiles
          </Link>
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

      {!isLoading && words && words.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Aucun mot à entraîner. Ajoute des mots dans l’onglet “Mots”.</div>
        </div>
      ) : null}

      {currentWord ? (
        <div style={{ marginTop: 20 }}>
          <div className="wordCard">
            <div className="wordCard__prompt">À écrire sur papier (ou dans ta tête)</div>
            <div className="wordCard__main">{currentWord.french}</div>

            {isRevealed ? (
              <div className="wordCard__answer">
                {currentWord.kanji ? (
                  <div>
                    <strong>Kanji:</strong> {currentWord.kanji}
                  </div>
                ) : null}
                {currentWord.kana ? (
                  <div>
                    <strong>Kana:</strong> {currentWord.kana}
                  </div>
                ) : null}
                {currentWord.romaji ? (
                  <div>
                    <strong>Rōmaji:</strong> {currentWord.romaji}
                  </div>
                ) : null}
                {currentWord.note ? (
                  <div style={{ marginTop: 8 }} className="muted">
                    {currentWord.note}
                  </div>
                ) : null}
                {!currentWord.kanji && !currentWord.kana && !currentWord.romaji ? (
                  <div className="muted">
                    Pas de réponse enregistrée (ajoute kana/kanji/romaji).
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setIsRevealed(true)}
                >
                  Révéler
                </button>
              </div>
            )}

            {isRevealed ? (
              <div style={{ marginTop: 16 }} className="row">
                <button
                  className="button button--success"
                  type="button"
                  onClick={() => handleReview("success")}
                  disabled={isSubmitting}
                >
                  ✅ Réussi
                </button>
                <button
                  className="button button--warning"
                  type="button"
                  onClick={() => handleReview("partial")}
                  disabled={isSubmitting}
                >
                  ⚠️ Partiellement
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => handleReview("fail")}
                  disabled={isSubmitting}
                >
                  ❌ Raté
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => advanceToNextWord(false)}
                  disabled={isSubmitting}
                >
                  Passer
                </button>
              </div>
            ) : null}
          </div>

          <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Mot {words ? currentIndex + 1 : 0} / {words?.length ?? 0} (le score est utilisé en
            interne pour filtrer, pas affiché ici).
          </div>
        </div>
      ) : null}

      {isSessionFinished ? (
        <div style={{ marginTop: 16 }}>
          <div className="wordCard">
            <div style={{ fontWeight: 800, fontSize: 18 }}>Fin de série</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Mots notés: {sessionReviewedCount} — ✅ {sessionSuccessCount} / ⚠️{" "}
              {sessionPartialCount} / ❌ {sessionFailCount}
            </div>
            <div style={{ marginTop: 10, fontSize: 28, fontWeight: 800 }}>
              Score session: {sessionScoreDelta >= 0 ? `+${sessionScoreDelta}` : sessionScoreDelta}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="button button--primary"
                type="button"
                onClick={() => restartSession()}
              >
                Recommencer
              </button>
              <Link className="button" to="/">
                Retour aux séries
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function shuffleWords(words: WordWithStats[]): WordWithStats[] {
  const shuffledWords = [...words];
  for (let index = shuffledWords.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const tempWord = shuffledWords[index];
    shuffledWords[index] = shuffledWords[swapIndex];
    shuffledWords[swapIndex] = tempWord;
  }
  return shuffledWords;
}

function computeSessionScoreDelta(reviewResult: ReviewResult): number {
  if (reviewResult === "success") return 2;
  if (reviewResult === "partial") return 1;
  return -2;
}
