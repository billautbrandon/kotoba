import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { type WordWithStats, fetchSeriesWords, submitBulkReviews } from "../../api";

type TrainMode = "tag";
type SessionMode = "manual" | "timer";
type SessionRating = "success" | "partial" | "fail";
type PromptMode = "french" | "romaji" | "kana" | "kanji";

export function TrainPage(props: { mode: TrainMode }) {
  const routeParams = useParams();
  const [searchParams] = useSearchParams();
  const tagId = props.mode === "tag" ? Number(routeParams.tagId) : null;
  const sessionMode = (searchParams.get("mode") as SessionMode | null) ?? "manual";
  const timerSeconds = Number(searchParams.get("seconds") ?? 5);
  const promptMode = (searchParams.get("prompt") as PromptMode | null) ?? "french";

  const [words, setWords] = useState<WordWithStats[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [isSessionFinished, setIsSessionFinished] = useState<boolean>(false);
  const [ratingsByWordId, setRatingsByWordId] = useState<Record<number, SessionRating | null>>({});
  const [isRatingsSubmitted, setIsRatingsSubmitted] = useState<boolean>(false);
  const timerHandleRef = useRef<number | null>(null);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [wordStartedAtMs, setWordStartedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());

  const modeLabel = `Série (tag ${tagId ?? "?"})`;

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsRevealed(false);
      setCurrentIndex(0);
      setIsSessionFinished(false);
      setRatingsByWordId({});
      setIsRatingsSubmitted(false);
      const nowMs = Date.now();
      setSessionStartedAtMs(nowMs);
      setWordStartedAtMs(nowMs);

      try {
        if (!tagId || !Number.isFinite(tagId)) {
          throw new Error("Tag invalide");
        }
        const loadedWords = await fetchSeriesWords(tagId);

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
  }, [tagId]);

  const currentWord = useMemo(() => {
    if (!words || words.length === 0) return null;
    return words[currentIndex] ?? null;
  }, [words, currentIndex]);

  const currentWordId = currentWord ? currentWord.id : null;

  useEffect(() => {
    if (!words || words.length === 0) return;
    if (isSessionFinished) return;
    setIsRevealed(false);
    const nowMs = Date.now();
    setSessionStartedAtMs(nowMs);
    setWordStartedAtMs(nowMs);
  }, [isSessionFinished, words]);

  const advanceToNextWord = useCallback(() => {
    setCurrentIndex((previousIndex) => {
      if (!words || words.length === 0) return previousIndex;
      const nextIndex = previousIndex + 1;
      if (nextIndex >= words.length) {
        setIsSessionFinished(true);
        return previousIndex;
      }
      setWordStartedAtMs(Date.now());
      setIsRevealed(false);
      return nextIndex;
    });
  }, [words]);

  function restartSession() {
    if (!words) return;
    const nowMs = Date.now();
    setWords(shuffleWords(words));
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsSessionFinished(false);
    setRatingsByWordId({});
    setIsRatingsSubmitted(false);
    setSessionStartedAtMs(nowMs);
    setWordStartedAtMs(nowMs);
  }

  useEffect(() => {
    if (timerHandleRef.current) {
      window.clearTimeout(timerHandleRef.current);
      timerHandleRef.current = null;
    }

    if (!words || words.length === 0) return;
    if (isSessionFinished) return;
    if (sessionMode !== "timer") return;
    if (!Number.isFinite(timerSeconds) || timerSeconds <= 0) return;
    if (!wordStartedAtMs) return;
    if (!currentWordId) return;

    const elapsedInWordMs = Date.now() - wordStartedAtMs;
    const remainingMs = Math.max(0, timerSeconds * 1000 - elapsedInWordMs);
    timerHandleRef.current = window.setTimeout(() => {
      advanceToNextWord();
    }, remainingMs);

    return () => {
      if (timerHandleRef.current) {
        window.clearTimeout(timerHandleRef.current);
        timerHandleRef.current = null;
      }
    };
  }, [
    advanceToNextWord,
    currentWordId,
    isSessionFinished,
    sessionMode,
    timerSeconds,
    wordStartedAtMs,
    words,
  ]);

  useEffect(() => {
    if (sessionMode !== "timer") return;
    if (isSessionFinished) return;
    const intervalId = window.setInterval(() => setClockNowMs(Date.now()), 100);
    return () => window.clearInterval(intervalId);
  }, [isSessionFinished, sessionMode]);

  useEffect(() => {
    if (!words || words.length === 0) return;
    if (isSessionFinished) return;
    if (sessionMode !== "manual") return;

    function onKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement;
      const activeTagName = activeElement ? activeElement.tagName.toLowerCase() : "";
      const isTypingContext = activeTagName === "input" || activeTagName === "textarea";
      if (isTypingContext) return;

      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        advanceToNextWord();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentIndex((previousIndex) => Math.max(0, previousIndex - 1));
        setIsRevealed(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advanceToNextWord, isSessionFinished, sessionMode, words]);

  const allSessionWordIds = useMemo(() => {
    return (words ?? []).map((word) => word.id);
  }, [words]);

  const isAllRated = useMemo(() => {
    if (!words || words.length === 0) return false;
    return allSessionWordIds.every((wordId) => {
      const rating = ratingsByWordId[wordId];
      return rating === "success" || rating === "partial" || rating === "fail";
    });
  }, [allSessionWordIds, ratingsByWordId, words]);

  const recapCounts = useMemo(() => {
    let successCount = 0;
    let partialCount = 0;
    let failCount = 0;
    for (const wordId of allSessionWordIds) {
      const rating = ratingsByWordId[wordId];
      if (rating === "success") successCount += 1;
      else if (rating === "partial") partialCount += 1;
      else if (rating === "fail") failCount += 1;
    }
    return { successCount, partialCount, failCount };
  }, [allSessionWordIds, ratingsByWordId]);

  const sessionScoreDelta = useMemo(() => {
    let delta = 0;
    for (const wordId of allSessionWordIds) {
      const rating = ratingsByWordId[wordId];
      if (!rating) continue;
      delta += computeSessionScoreDelta(rating);
    }
    return delta;
  }, [allSessionWordIds, ratingsByWordId]);

  const timerUi = useMemo(() => {
    if (!words || words.length === 0) return null;
    if (sessionMode !== "timer") return null;
    if (!sessionStartedAtMs || !wordStartedAtMs) return null;

    const totalMs = words.length * timerSeconds * 1000;
    const elapsedSessionMs = Math.min(totalMs, Math.max(0, clockNowMs - sessionStartedAtMs));
    const elapsedWordMs = Math.min(timerSeconds * 1000, Math.max(0, clockNowMs - wordStartedAtMs));
    const remainingWordMs = Math.max(0, timerSeconds * 1000 - elapsedWordMs);
    const progressPercent = totalMs > 0 ? Math.round((elapsedSessionMs / totalMs) * 100) : 0;

    return {
      totalMs,
      elapsedSessionMs,
      remainingWordMs,
      progressPercent,
    };
  }, [clockNowMs, sessionMode, sessionStartedAtMs, timerSeconds, wordStartedAtMs, words]);

  const promptLabel = useMemo(() => {
    if (promptMode === "french") return "FR";
    if (promptMode === "romaji") return "Rōmaji";
    if (promptMode === "kana") return "Kana";
    return "Kanji";
  }, [promptMode]);

  const promptText = useMemo(() => {
    if (!currentWord) return "";
    const value =
      promptMode === "french"
        ? currentWord.french
        : promptMode === "romaji"
          ? currentWord.romaji
          : promptMode === "kana"
            ? currentWord.kana
            : currentWord.kanji;
    return value ?? currentWord.french;
  }, [currentWord, promptMode]);

  const revealFields = useMemo(() => {
    if (!currentWord) return [];
    const allFields: Array<{ key: PromptMode; label: string; value: string | null }> = [
      { key: "french", label: "FR", value: currentWord.french },
      { key: "kanji", label: "KANJI", value: currentWord.kanji },
      { key: "kana", label: "KANA", value: currentWord.kana },
      { key: "romaji", label: "RŌMAJI", value: currentWord.romaji },
    ];
    return allFields.filter((field) => field.key !== promptMode);
  }, [currentWord, promptMode]);

  const settingsLink = useMemo(() => {
    if (!tagId) return "/series/";
    const query = new URLSearchParams();
    query.set("name", `tag ${tagId}`);
    query.set("mode", sessionMode);
    if (sessionMode === "timer") {
      query.set("seconds", String(timerSeconds));
    }
    query.set("prompt", promptMode);
    return `/series/${tagId}?${query.toString()}`;
  }, [promptMode, sessionMode, tagId, timerSeconds]);

  function setRating(wordId: number, rating: SessionRating) {
    setRatingsByWordId((previousValue) => ({ ...previousValue, [wordId]: rating }));
  }

  async function submitRatings() {
    if (!words) return;
    if (!isAllRated) return;

    const reviews = words.map((word) => ({
      wordId: word.id,
      result: ratingsByWordId[word.id] as SessionRating,
    }));

    setIsSubmitting(true);
    try {
      await submitBulkReviews(reviews);
      setIsRatingsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{modeLabel}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Passe les mots, puis note toute la série à la fin.
          </div>
        </div>
        <div className="row">
          <Link className="button" to="/">
            Séries
          </Link>
          <Link className="button" to={settingsLink}>
            Réglages
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

      {currentWord && !isSessionFinished ? (
        <div style={{ marginTop: 20 }}>
          <div className="wordCard">
            {timerUi ? (
              <div style={{ marginBottom: 12 }}>
                <div className="trainTimerRow">
                  <div className="muted" style={{ fontSize: 12 }}>
                    Mot: <strong>{formatMs(timerUi.remainingWordMs)}</strong> restant
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Total: <strong>{formatMs(timerUi.elapsedSessionMs)}</strong> /{" "}
                    <strong>{formatMs(timerUi.totalMs)}</strong> ({timerUi.progressPercent}%)
                  </div>
                </div>
                <div className="trainProgress">
                  <div
                    className="trainProgress__bar"
                    style={{ width: `${timerUi.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="wordCard__prompt">À écrire sur papier (ou dans ta tête)</div>
            <div className="wordCard__main">{promptText}</div>

            {isRevealed ? (
              <div className="wordCard__answer">
                <div className="wordAnswerGrid">
                  {revealFields.map((field) => (
                    <React.Fragment key={field.key}>
                      <div className="wordAnswerGrid__label">{field.label}</div>
                      <div className="wordAnswerGrid__value">{field.value ?? "—"}</div>
                    </React.Fragment>
                  ))}
                </div>
                {currentWord.note ? (
                  <div style={{ marginTop: 8 }} className="muted">
                    {currentWord.note}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="revealContainer">
                <div className="muted" style={{ fontSize: 12 }}>
                  Clique pour afficher la réponse, puis continue.
                </div>
                <button
                  className="button button--primary revealButton"
                  type="button"
                  onClick={() => setIsRevealed(true)}
                >
                  Afficher la réponse
                </button>
              </div>
            )}

            {isRevealed && sessionMode === "manual" ? (
              <div style={{ marginTop: 16 }} className="row">
                <button
                  className="button"
                  type="button"
                  onClick={() => advanceToNextWord()}
                  disabled={isSubmitting}
                >
                  Suivant
                </button>
              </div>
            ) : null}
          </div>

          <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Mot {words ? currentIndex + 1 : 0} / {words?.length ?? 0} — mode{" "}
            <strong>{sessionMode === "manual" ? "manuel" : `timer ${timerSeconds}s`}</strong> —
            question: <strong>{promptLabel}</strong>
            {sessionMode === "manual" ? (
              <>
                {" "}
                — raccourcis: <strong>→</strong> / <strong>Entrée</strong>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {isSessionFinished && words && words.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="wordCard">
            <div style={{ fontWeight: 800, fontSize: 18 }}>Fin de série — récap & notation</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Note tous les mots ci-dessous. ✅ {recapCounts.successCount} / ⚠️{" "}
              {recapCounts.partialCount} / ❌ {recapCounts.failCount}
            </div>

            <div style={{ marginTop: 16 }}>
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Français</th>
                    <th>JP</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word) => (
                    <tr key={word.id}>
                      <td>{word.french}</td>
                      <td className="muted">{word.kanji ?? word.kana ?? word.romaji ?? "—"}</td>
                      <td className="ratingCell">
                        <div className="ratingGroup">
                          <button
                            className={`button ratingButton ${ratingsByWordId[word.id] === "success" ? "button--success" : ""}`}
                            type="button"
                            onClick={() => setRating(word.id, "success")}
                            aria-label="Réussi"
                          >
                            ✅
                          </button>
                          <button
                            className={`button ratingButton ${ratingsByWordId[word.id] === "partial" ? "button--warning" : ""}`}
                            type="button"
                            onClick={() => setRating(word.id, "partial")}
                            aria-label="Partiellement"
                          >
                            ⚠️
                          </button>
                          <button
                            className={`button ratingButton ${ratingsByWordId[word.id] === "fail" ? "button--danger" : ""}`}
                            type="button"
                            onClick={() => setRating(word.id, "fail")}
                            aria-label="Raté"
                          >
                            ❌
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800 }}>
              Score session: {sessionScoreDelta >= 0 ? `+${sessionScoreDelta}` : sessionScoreDelta}
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="button button--primary"
                type="button"
                onClick={() => submitRatings()}
                disabled={!isAllRated || isSubmitting || isRatingsSubmitted}
              >
                {isRatingsSubmitted ? "Série enregistrée" : "Enregistrer la série"}
              </button>
              <button
                className="button"
                type="button"
                onClick={() => restartSession()}
                disabled={isSubmitting}
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

function computeSessionScoreDelta(rating: SessionRating): number {
  if (rating === "success") return 2;
  if (rating === "partial") return 1;
  return -2;
}

function formatMs(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
