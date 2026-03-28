import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  type GeminiQuota,
  type KeyboardAnswer,
  type KeyboardCorrection,
  type WordWithStats,
  correctKeyboardAnswers,
  fetchDifficultWords,
  fetchDueWords,
  fetchGeminiQuota,
  fetchSeriesWords,
  fetchSrsWords,
  submitBulkReviews,
} from "../../api";
import { extractKanji } from "../../utils/kanji";
import { AudioButton } from "../components/AudioButton";
import { KanjiStrokeViewer } from "../components/KanjiStrokeViewer";
import { QuotaBar } from "../components/QuotaBar";

type TrainMode = "tag" | "srs" | "difficult";
type SrsCategory = "hard" | "medium" | "easy" | "due";
type SessionMode = "manual" | "keyboard";
type KeyboardDirection = "fr" | "jpn";
type SessionRating = "success" | "partial" | "fail";
type PromptMode = "french" | "romaji" | "kana" | "kanji";
type TrainPhase = "setup" | "training" | "correcting" | "finished";

type PersistedSeriesSettings = {
  sessionMode: SessionMode;
  promptMode: PromptMode;
};

const SETTINGS_KEY = "kotoba.seriesSettings.v1";

const srsCategoryLabels: Record<SrsCategory, string> = {
  hard: "Difficile",
  medium: "Moyen",
  easy: "Facile",
  due: "À réviser",
};

export function TrainPage(props: { mode: TrainMode }) {
  const routeParams = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tagId = props.mode === "tag" ? Number(routeParams.tagId) : null;
  const srsCategory = (routeParams.category as SrsCategory | undefined) ?? "hard";
  const tagName = searchParams.get("name") ?? null;

  const [phase, setPhase] = useState<TrainPhase>(props.mode === "srs" ? "setup" : "setup");

  const [configSessionMode, setConfigSessionMode] = useState<SessionMode>(
    () => loadSettings().sessionMode,
  );
  const [configPromptMode, setConfigPromptMode] = useState<PromptMode>(
    () => loadSettings().promptMode,
  );
  const [configShuffleMode, setConfigShuffleMode] = useState<boolean>(false);
  const [configKeyboardDirection, setConfigKeyboardDirection] = useState<KeyboardDirection>("fr");

  const sessionMode = useRef<SessionMode>("manual");
  const basePromptMode = useRef<PromptMode>("french");
  const shuffleMode = useRef<boolean>(false);
  const keyboardDirection = useRef<KeyboardDirection>("fr");

  const [words, setWords] = useState<WordWithStats[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showKanjiViewer, setShowKanjiViewer] = useState(false);
  const [selectedKanjiForViewer, setSelectedKanjiForViewer] = useState<string | null>(null);

  const [ratingsByWordId, setRatingsByWordId] = useState<Record<number, SessionRating | null>>({});
  const [isRatingsSubmitted, setIsRatingsSubmitted] = useState<boolean>(false);
  const [keyboardAnswers, setKeyboardAnswers] = useState<
    Record<number, { answer1: string; answer2: string }>
  >({});
  const [keyboardCorrections, setKeyboardCorrections] = useState<
    Record<number, KeyboardCorrection>
  >({});
  const [correctingError, setCorrectingError] = useState<string | null>(null);
  const [geminiQuota, setGeminiQuota] = useState<GeminiQuota | null>(null);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const [randomPromptModes, setRandomPromptModes] = useState<PromptMode[]>([]);

  useEffect(() => {
    saveSettings({
      sessionMode: configSessionMode,
      promptMode: configPromptMode,
    });
  }, [configSessionMode, configPromptMode]);

  useEffect(() => {
    if (configSessionMode === "keyboard") {
      fetchGeminiQuota()
        .then((quota) => setGeminiQuota(quota))
        .catch(() => setGeminiQuota(null));
    }
  }, [configSessionMode]);

  const modeLabel = useMemo(() => {
    if (props.mode === "difficult") return "Mots difficiles";
    if (props.mode === "srs") return `SRS — ${srsCategoryLabels[srsCategory]}`;
    if (tagName) return tagName;
    if (tagId) return `Tag ${tagId}`;
    return "Série";
  }, [props.mode, srsCategory, tagId, tagName]);

  async function startSession() {
    sessionMode.current = configSessionMode;
    basePromptMode.current = configPromptMode;
    shuffleMode.current = configShuffleMode;
    keyboardDirection.current = configKeyboardDirection;

    setPhase("training");
    setIsLoading(true);
    setErrorMessage(null);
    setIsRevealed(false);
    setCurrentIndex(0);
    setRatingsByWordId({});
    setIsRatingsSubmitted(false);
    setKeyboardAnswers({});
    setKeyboardCorrections({});
    setCorrectingError(null);
    setSessionStartedAtMs(Date.now());

    try {
      let loadedWords: WordWithStats[];

      if (props.mode === "difficult") {
        loadedWords = await fetchDifficultWords();
      } else if (props.mode === "srs" && srsCategory === "due") {
        const dueData = await fetchDueWords();
        loadedWords = dueData.words;
      } else if (props.mode === "srs") {
        const srsData = await fetchSrsWords();
        const bucketCategory = srsCategory as "hard" | "medium" | "easy";
        loadedWords = srsData[bucketCategory] ?? [];
      } else {
        if (!tagId || !Number.isFinite(tagId)) {
          throw new Error("Tag invalide");
        }
        loadedWords = await fetchSeriesWords(tagId);
      }

      const shuffledWords = shuffleWords(loadedWords);
      setWords(shuffledWords);
      setRandomPromptModes(generateRandomPromptModes(shuffledWords.length));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
      setWords([]);
    } finally {
      setIsLoading(false);
    }
  }

  const currentWord = useMemo(() => {
    if (!words || words.length === 0) return null;
    return words[currentIndex] ?? null;
  }, [words, currentIndex]);

  const currentWordId = currentWord ? currentWord.id : null;

  const currentWordKanji = useMemo(() => {
    if (!currentWord?.kanji) return [];
    return extractKanji(currentWord.kanji);
  }, [currentWord]);

  const handleShowKanjiStroke = () => {
    if (currentWordKanji.length > 0) {
      setSelectedKanjiForViewer(currentWordKanji[0]);
      setShowKanjiViewer(true);
    }
  };

  const advanceToNextWord = useCallback(() => {
    setCurrentIndex((previousIndex) => {
      if (!words || words.length === 0) return previousIndex;
      const nextIndex = previousIndex + 1;
      if (nextIndex >= words.length) {
        if (sessionMode.current === "keyboard") {
          setPhase("correcting");
          setCorrectingError(null);
          return previousIndex;
        }
        setPhase("finished");
        return previousIndex;
      }
      setIsRevealed(false);
      return nextIndex;
    });
  }, [words]);

  function restartSession() {
    if (!words) return;
    const reshuffled = shuffleWords(words);
    setWords(reshuffled);
    setRandomPromptModes(generateRandomPromptModes(reshuffled.length));
    setCurrentIndex(0);
    setIsRevealed(false);
    setPhase("training");
    setRatingsByWordId({});
    setIsRatingsSubmitted(false);
    setKeyboardAnswers({});
    setKeyboardCorrections({});
    setCorrectingError(null);
    setSessionStartedAtMs(Date.now());
  }

  const correctingTriggered = useRef(false);
  useEffect(() => {
    if (phase === "correcting" && !correctingTriggered.current) {
      correctingTriggered.current = true;
      submitKeyboardForCorrection();
    }
    if (phase !== "correcting") {
      correctingTriggered.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "training") return;
    const intervalId = window.setInterval(() => setClockNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [phase]);

  const elapsedTimeMs = useMemo(() => {
    if (!sessionStartedAtMs) return 0;
    return Math.max(0, clockNowMs - sessionStartedAtMs);
  }, [sessionStartedAtMs, clockNowMs]);

  const handleRatingKey = useCallback(
    (rating: SessionRating) => {
      if (currentWordId) {
        setRatingsByWordId((prev) => ({ ...prev, [currentWordId]: rating }));
        advanceToNextWord();
      }
    },
    [advanceToNextWord, currentWordId],
  );

  useEffect(() => {
    if (!words || words.length === 0) return;
    if (phase !== "training") return;

    function onKeyDown(event: KeyboardEvent) {
      const activeTagName = document.activeElement?.tagName.toLowerCase() ?? "";
      if (activeTagName === "input" || activeTagName === "textarea") return;

      if (isRevealed && currentWordId) {
        const is1 = event.key === "1" || event.code === "Digit1" || event.code === "Numpad1";
        const is2 = event.key === "2" || event.code === "Digit2" || event.code === "Numpad2";
        const is3 = event.key === "3" || event.code === "Digit3" || event.code === "Numpad3";
        if (is1) {
          event.preventDefault();
          handleRatingKey("success");
          return;
        }
        if (is2) {
          event.preventDefault();
          handleRatingKey("partial");
          return;
        }
        if (is3) {
          event.preventDefault();
          handleRatingKey("fail");
          return;
        }
      }

      if (sessionMode.current === "manual") {
        if (event.key === "ArrowRight" || event.key === "Enter") {
          event.preventDefault();
          if (!isRevealed) {
            setIsRevealed(true);
          } else {
            advanceToNextWord();
          }
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setCurrentIndex((prev) => Math.max(0, prev - 1));
          setIsRevealed(false);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [advanceToNextWord, currentWordId, handleRatingKey, isRevealed, phase, words]);

  const allSessionWordIds = useMemo(() => (words ?? []).map((word) => word.id), [words]);

  const recapCounts = useMemo(() => {
    let successCount = 0;
    let partialCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    for (const wordId of allSessionWordIds) {
      const rating = ratingsByWordId[wordId];
      if (rating === "success") successCount += 1;
      else if (rating === "partial") partialCount += 1;
      else if (rating === "fail") failCount += 1;
      else skippedCount += 1;
    }
    return { successCount, partialCount, failCount, skippedCount };
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

  const actualPromptMode = useMemo(() => {
    if (
      shuffleMode.current &&
      randomPromptModes.length > 0 &&
      currentIndex < randomPromptModes.length
    ) {
      return randomPromptModes[currentIndex];
    }
    return basePromptMode.current;
  }, [currentIndex, randomPromptModes]);

  const promptLabel = useMemo(() => {
    if (actualPromptMode === "french") return "FR";
    if (actualPromptMode === "romaji") return "Romaji";
    if (actualPromptMode === "kana") return "Kana";
    return "Kanji";
  }, [actualPromptMode]);

  const promptText = useMemo(() => {
    if (!currentWord) return "";
    const value =
      actualPromptMode === "french"
        ? currentWord.french
        : actualPromptMode === "romaji"
          ? currentWord.romaji
          : actualPromptMode === "kana"
            ? currentWord.kana
            : currentWord.kanji;
    return value ?? currentWord.french;
  }, [currentWord, actualPromptMode]);

  const revealFields = useMemo(() => {
    if (!currentWord) return [];
    const allFields: Array<{ key: PromptMode; label: string; value: string | null }> = [
      { key: "kanji", label: "KANJI", value: currentWord.kanji },
      { key: "kana", label: "KANA", value: currentWord.kana },
      { key: "romaji", label: "ROMAJI", value: currentWord.romaji },
    ];
    if (actualPromptMode !== "french") {
      allFields.unshift({ key: "french", label: "FR", value: currentWord.french });
    }
    return allFields.filter((field) => field.key !== actualPromptMode);
  }, [currentWord, actualPromptMode]);

  function setRating(wordId: number, rating: SessionRating) {
    setRatingsByWordId((prev) => ({ ...prev, [wordId]: rating }));
  }

  async function submitRatings() {
    if (!words) return;
    const reviews = words
      .map((word) => {
        const rating = ratingsByWordId[word.id];
        if (!rating) return null;
        return { wordId: word.id, result: rating as SessionRating };
      })
      .filter((review): review is { wordId: number; result: SessionRating } => review !== null);

    if (reviews.length === 0) return;
    setIsSubmitting(true);
    try {
      await submitBulkReviews(reviews);
      setIsRatingsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToPreviousWord() {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setIsRevealed(false);
  }

  function handleFinishSession() {
    if (sessionMode.current === "keyboard") {
      handleFinishKeyboardSession();
    } else {
      setPhase("finished");
    }
  }

  function handleCancelSession() {
    if (window.confirm("Annuler la serie ? Tes progres ne seront pas enregistres.")) {
      navigate(props.mode === "srs" ? "/srs" : props.mode === "difficult" ? "/difficult" : "/");
    }
  }

  function handleFinishKeyboardSession() {
    setPhase("correcting");
    setCorrectingError(null);
    submitKeyboardForCorrection();
  }

  async function submitKeyboardForCorrection() {
    if (!words || words.length === 0) return;

    const answers: KeyboardAnswer[] = words.map((word) => {
      const typed = keyboardAnswers[word.id] ?? { answer1: "", answer2: "" };
      let promptField: "french" | "kana" | "kanji" = "french";
      if (keyboardDirection.current === "jpn") {
        promptField = word.kanji ? "kanji" : "kana";
      }
      return {
        wordId: word.id,
        french: word.french,
        kanji: word.kanji ?? null,
        kana: word.kana ?? null,
        userInput1: typed.answer1,
        userInput2: typed.answer2,
        direction: keyboardDirection.current,
        promptField,
      };
    });

    try {
      const corrections = await correctKeyboardAnswers(answers);
      const correctionsMap: Record<number, KeyboardCorrection> = {};
      const ratingsMap: Record<number, SessionRating> = {};
      for (const correction of corrections) {
        correctionsMap[correction.wordId] = correction;
        if (correction.rating === 1) ratingsMap[correction.wordId] = "success";
        else if (correction.rating === 2) ratingsMap[correction.wordId] = "partial";
        else ratingsMap[correction.wordId] = "fail";
      }
      setKeyboardCorrections(correctionsMap);
      setRatingsByWordId(ratingsMap);
      setPhase("finished");
    } catch (error) {
      setCorrectingError(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function getKeyboardPromptField(word: WordWithStats): "french" | "kana" | "kanji" {
    if (keyboardDirection.current === "fr") return "french";
    return word.kanji ? "kanji" : "kana";
  }

  function getKeyboardPromptText(word: WordWithStats): string {
    const field = getKeyboardPromptField(word);
    if (field === "french") return word.french;
    if (field === "kanji") return word.kanji ?? word.kana ?? "";
    return word.kana ?? "";
  }

  function getKeyboardInputLabels(word: WordWithStats): [string, string] {
    if (keyboardDirection.current === "fr") return ["Kanji", "Kana"];
    const promptField = getKeyboardPromptField(word);
    if (promptField === "kanji") return ["Francais", "Kana"];
    return ["Francais", "Kanji"];
  }

  const progressPercent = words && words.length > 0 ? (currentIndex / words.length) * 100 : 0;

  // --- SETUP PHASE ---
  if (phase === "setup") {
    return (
      <div className="trainSetup">
        <div className="trainSetup__header">
          <h1 className="trainSetup__title">{modeLabel}</h1>
          <p className="trainSetup__subtitle">Configure ta session avant de commencer.</p>
        </div>

        <div className="trainSetup__section">
          <h2 className="trainSetup__sectionTitle">Mode</h2>
          <div className="trainSetup__options">
            <label
              className={`trainSetup__option ${configSessionMode === "manual" ? "trainSetup__option--active" : ""}`}
            >
              <input
                type="radio"
                checked={configSessionMode === "manual"}
                onChange={() => setConfigSessionMode("manual")}
              />
              <div>
                <div className="trainSetup__optionLabel">Manuel</div>
                <div className="trainSetup__optionHint">
                  Avance avec <strong>&rarr;</strong> / <strong>Entree</strong>, reviens avec{" "}
                  <strong>&larr;</strong>
                </div>
              </div>
            </label>
            <label
              className={`trainSetup__option ${configSessionMode === "keyboard" ? "trainSetup__option--active" : ""}`}
            >
              <input
                type="radio"
                checked={configSessionMode === "keyboard"}
                onChange={() => setConfigSessionMode("keyboard")}
              />
              <div>
                <div className="trainSetup__optionLabel">Clavier</div>
                <div className="trainSetup__optionHint">
                  Tape tes reponses au clavier, correction par IA a la fin
                </div>
              </div>
            </label>
          </div>
        </div>

        {configSessionMode === "keyboard" ? (
          <div className="trainSetup__section">
            <h2 className="trainSetup__sectionTitle">Direction</h2>
            <div className="trainSetup__promptButtons">
              <button
                className={`button ${configKeyboardDirection === "fr" ? "button--primary" : ""}`}
                type="button"
                onClick={() => setConfigKeyboardDirection("fr")}
              >
                FR &rarr; JPN
              </button>
              <button
                className={`button ${configKeyboardDirection === "jpn" ? "button--primary" : ""}`}
                type="button"
                onClick={() => setConfigKeyboardDirection("jpn")}
              >
                JPN &rarr; FR
              </button>
            </div>
            <p className="trainSetup__optionHint" style={{ marginTop: "var(--space-3)" }}>
              {configKeyboardDirection === "fr"
                ? "Le mot francais est affiche, tu tapes le kanji et le kana."
                : "Le mot japonais est affiche, tu tapes le francais et l'autre forme japonaise."}
            </p>
          </div>
        ) : (
          <div className="trainSetup__section">
            <h2 className="trainSetup__sectionTitle">Question</h2>
            <div className="trainSetup__promptButtons">
              {(
                [
                  ["french", "FR"],
                  ["romaji", "Romaji"],
                  ["kana", "Kana"],
                  ["kanji", "Kanji"],
                ] as Array<[PromptMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`button ${configPromptMode === mode && !configShuffleMode ? "button--primary" : ""}`}
                  type="button"
                  onClick={() => {
                    setConfigPromptMode(mode);
                    setConfigShuffleMode(false);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className={`button ${configShuffleMode ? "button--primary" : ""}`}
                type="button"
                onClick={() => setConfigShuffleMode(true)}
                style={configShuffleMode ? undefined : { border: "2px dashed var(--color-border)" }}
              >
                Aleatoire
              </button>
            </div>
            {configShuffleMode && (
              <p className="trainSetup__optionHint" style={{ marginTop: "var(--space-3)" }}>
                La langue sera choisie au hasard pour chaque mot.
              </p>
            )}
          </div>
        )}

        {configSessionMode === "keyboard" && geminiQuota && <QuotaBar quota={geminiQuota} />}

        <div className="trainSetup__actions">
          <button className="button button--primary" type="button" onClick={startSession}>
            Demarrer
          </button>
          <Link className="button" to={props.mode === "srs" ? "/srs" : "/"}>
            Retour
          </Link>
        </div>
      </div>
    );
  }

  // --- TRAINING PHASE (keyboard mode) ---
  if (phase === "training" && sessionMode.current === "keyboard") {
    const kbWord = currentWord;
    const kbAnswers = kbWord ? (keyboardAnswers[kbWord.id] ?? { answer1: "", answer2: "" }) : null;
    const kbLabels = kbWord ? getKeyboardInputLabels(kbWord) : ["", ""];
    const kbPrompt = kbWord ? getKeyboardPromptText(kbWord) : "";
    const kbPromptField = kbWord ? getKeyboardPromptField(kbWord) : "french";

    function updateKeyboardAnswer(field: "answer1" | "answer2", value: string) {
      if (!kbWord) return;
      setKeyboardAnswers((prev) => ({
        ...prev,
        [kbWord.id]: {
          ...prev[kbWord.id],
          answer1: prev[kbWord.id]?.answer1 ?? "",
          answer2: prev[kbWord.id]?.answer2 ?? "",
          [field]: value,
        },
      }));
    }

    function handleKeyboardNext() {
      advanceToNextWord();
    }

    return (
      <div className="trainSession">
        <div className="trainSession__progressBar">
          <div className="trainSession__progressFill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="trainSession__topBar">
          <div className="trainSession__topLeft">
            <span className="trainSession__counter">
              Mot {words ? currentIndex + 1 : 0} / {words?.length ?? 0}
            </span>
            <span className="trainSession__timer">Temps: {formatMs(elapsedTimeMs)}</span>
          </div>
          <div className="trainSession__topRight">
            <button className="trainSession__finishBtn" type="button" onClick={handleFinishSession}>
              Terminer la serie
            </button>
            <button className="trainSession__cancelBtn" type="button" onClick={handleCancelSession}>
              Annuler
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="muted" style={{ textAlign: "center", marginTop: "var(--space-8)" }}>
            Chargement...
          </div>
        )}
        {errorMessage && (
          <div className="formError" style={{ marginTop: "var(--space-6)" }}>
            Erreur: {errorMessage}
          </div>
        )}
        {!isLoading && words && words.length === 0 && (
          <div className="muted" style={{ textAlign: "center", marginTop: "var(--space-8)" }}>
            Aucun mot a entrainer.
          </div>
        )}

        {kbWord && kbAnswers && (
          <div className="trainSession__card">
            <div className="trainSession__prompt">
              {kbPrompt}
              {(kbPromptField === "kana" || kbPromptField === "kanji") && (
                <AudioButton text={kbPrompt} size="large" />
              )}
            </div>

            <div className="trainKeyboard__inputs">
              <div className="trainKeyboard__field">
                <label className="trainKeyboard__label" htmlFor="kb-input-1">
                  {kbLabels[0]}
                </label>
                <input
                  id="kb-input-1"
                  className="trainKeyboard__input"
                  type="text"
                  value={kbAnswers.answer1}
                  onChange={(event) => updateKeyboardAnswer("answer1", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const nextInput = document.getElementById("kb-input-2");
                      if (nextInput) nextInput.focus();
                    }
                  }}
                  autoComplete="off"
                />
              </div>
              <div className="trainKeyboard__field">
                <label className="trainKeyboard__label" htmlFor="kb-input-2">
                  {kbLabels[1]}
                </label>
                <input
                  id="kb-input-2"
                  className="trainKeyboard__input"
                  type="text"
                  value={kbAnswers.answer2}
                  onChange={(event) => updateKeyboardAnswer("answer2", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleKeyboardNext();
                    }
                  }}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="trainSession__navRow">
              <button
                className="trainSession__navBtn"
                type="button"
                onClick={goToPreviousWord}
                disabled={currentIndex === 0}
              >
                &larr; Precedent
              </button>
              <button
                className="trainSession__navBtn trainSession__navBtn--primary"
                type="button"
                onClick={handleKeyboardNext}
              >
                {words && currentIndex >= words.length - 1 ? "Corriger" : "Suivant \u2192"}
              </button>
            </div>
          </div>
        )}

        <div className="trainSession__footer">
          Mode <strong>clavier</strong> &mdash; Direction:{" "}
          <strong>{keyboardDirection.current === "fr" ? "FR \u2192 JPN" : "JPN \u2192 FR"}</strong>{" "}
          &mdash; <strong>Entree</strong> pour avancer
        </div>
      </div>
    );
  }

  // --- TRAINING PHASE (manual) ---
  if (phase === "training") {
    return (
      <div className="trainSession">
        <div className="trainSession__progressBar">
          <div className="trainSession__progressFill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="trainSession__topBar">
          <div className="trainSession__topLeft">
            <span className="trainSession__counter">
              Mot {words ? currentIndex + 1 : 0} / {words?.length ?? 0}
            </span>
            <span className="trainSession__timer">Temps: {formatMs(elapsedTimeMs)}</span>
          </div>
          <div className="trainSession__topRight">
            <button
              className="trainSession__finishBtn"
              type="button"
              onClick={handleFinishSession}
              disabled={isSubmitting}
            >
              Terminer la serie
            </button>
            <button
              className="trainSession__cancelBtn"
              type="button"
              onClick={handleCancelSession}
              disabled={isSubmitting}
            >
              Annuler
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="muted" style={{ textAlign: "center", marginTop: "var(--space-8)" }}>
            Chargement...
          </div>
        )}
        {errorMessage && (
          <div className="formError" style={{ marginTop: "var(--space-6)" }}>
            Erreur: {errorMessage}
          </div>
        )}
        {!isLoading && words && words.length === 0 && (
          <div className="muted" style={{ textAlign: "center", marginTop: "var(--space-8)" }}>
            Aucun mot a entrainer.
          </div>
        )}

        {currentWord && (
          <div className="trainSession__card">
            <div className="trainSession__prompt">
              {promptText}
              {actualPromptMode === "kana" && <AudioButton text={promptText} size="large" />}
            </div>

            {!isRevealed ? (
              <button
                className="trainSession__revealBtn"
                type="button"
                onClick={() => setIsRevealed(true)}
              >
                Reveler la reponse
              </button>
            ) : (
              <div className="trainSession__answer">
                <div className="trainSession__answerGrid">
                  {revealFields.map((field) => (
                    <React.Fragment key={field.key}>
                      <div className="trainSession__answerLabel">{field.label}</div>
                      <div className="trainSession__answerValue">
                        {field.value ?? "\u2014"}
                        {field.key === "kana" && (
                          <AudioButton text={field.value ?? ""} size="medium" />
                        )}
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {currentWord.note && <div className="trainSession__note">{currentWord.note}</div>}

                <div className="trainSession__ratingRow">
                  <button
                    className={`trainSession__ratingBtn trainSession__ratingBtn--success ${ratingsByWordId[currentWordId ?? 0] === "success" ? "trainSession__ratingBtn--selected" : ""}`}
                    type="button"
                    onClick={() => handleRatingKey("success")}
                    disabled={isSubmitting}
                  >
                    <span className="trainSession__ratingIcon">&#x2713;</span> Reussi (1)
                  </button>
                  <button
                    className={`trainSession__ratingBtn trainSession__ratingBtn--warning ${ratingsByWordId[currentWordId ?? 0] === "partial" ? "trainSession__ratingBtn--selected" : ""}`}
                    type="button"
                    onClick={() => handleRatingKey("partial")}
                    disabled={isSubmitting}
                  >
                    <span className="trainSession__ratingIcon">&#x26A0;</span> Partiel (2)
                  </button>
                  <button
                    className={`trainSession__ratingBtn trainSession__ratingBtn--danger ${ratingsByWordId[currentWordId ?? 0] === "fail" ? "trainSession__ratingBtn--selected" : ""}`}
                    type="button"
                    onClick={() => handleRatingKey("fail")}
                    disabled={isSubmitting}
                  >
                    <span className="trainSession__ratingIcon">&#x2717;</span> Rate (3)
                  </button>
                </div>

                {currentWordKanji.length > 0 && (
                  <button
                    className="trainSession__kanjiBtn"
                    type="button"
                    onClick={handleShowKanjiStroke}
                  >
                    Voir le sens de trace ({currentWordKanji.length} kanji)
                  </button>
                )}
              </div>
            )}

            <div className="trainSession__navRow">
              <button
                className="trainSession__navBtn"
                type="button"
                onClick={goToPreviousWord}
                disabled={currentIndex === 0 || isSubmitting}
              >
                &larr; Precedent
              </button>
              <button
                className="trainSession__navBtn"
                type="button"
                onClick={advanceToNextWord}
                disabled={!words || currentIndex >= words.length - 1 || isSubmitting}
              >
                Suivant &rarr;
              </button>
            </div>
          </div>
        )}

        <div className="trainSession__footer">
          Mode <strong>{shuffleMode.current ? "manuel (aleatoire)" : "manuel"}</strong> &mdash;
          Question: <strong>{promptLabel}</strong> &mdash; Clique ou <strong>1</strong> &#x2713;{" "}
          <strong>2</strong> &#x26A0; <strong>3</strong> &#x2717; pour noter,{" "}
          <strong>&rarr;</strong>/<strong>Entree</strong> avancer, <strong>&larr;</strong> revenir
        </div>

        {showKanjiViewer && selectedKanjiForViewer && (
          <KanjiViewerModal
            kanjiList={currentWordKanji}
            selectedKanji={selectedKanjiForViewer}
            onSelectKanji={setSelectedKanjiForViewer}
            onClose={() => {
              setShowKanjiViewer(false);
              setSelectedKanjiForViewer(null);
            }}
          />
        )}
      </div>
    );
  }

  // --- CORRECTING PHASE ---
  if (phase === "correcting") {
    return (
      <div className="trainCorrecting">
        <div className="trainCorrecting__card">
          {!correctingError ? (
            <>
              <div className="trainCorrecting__spinner" />
              <h2 className="trainCorrecting__title">Correction par IA en cours...</h2>
              <p className="muted">
                Gemini analyse tes {words?.length ?? 0} reponses. Cela peut prendre quelques
                secondes.
              </p>
            </>
          ) : (
            <>
              <h2 className="trainCorrecting__title">Erreur de correction</h2>
              <div className="formError" style={{ marginBottom: "var(--space-5)" }}>
                {correctingError}
              </div>
              <div className="trainCorrecting__actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => {
                    setCorrectingError(null);
                    correctingTriggered.current = false;
                    setPhase("correcting");
                  }}
                >
                  Reessayer
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setPhase("finished");
                  }}
                >
                  Voir les resultats sans correction
                </button>
                <Link className="button" to={props.mode === "srs" ? "/srs" : "/"}>
                  Annuler
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- FINISHED PHASE ---
  return (
    <div className="trainRecap">
      <h2 className="trainRecap__title">Fin de serie</h2>
      <div className="trainRecap__summary">
        {recapCounts.successCount + recapCounts.partialCount + recapCounts.failCount} mot(s) note(s)
        sur {words?.length ?? 0}.
        <span className="trainRecap__stat trainRecap__stat--success">
          &#x2713; {recapCounts.successCount}
        </span>
        <span className="trainRecap__stat trainRecap__stat--warning">
          &#x26A0; {recapCounts.partialCount}
        </span>
        <span className="trainRecap__stat trainRecap__stat--danger">
          &#x2717; {recapCounts.failCount}
        </span>
        {recapCounts.skippedCount > 0 && (
          <span className="trainRecap__stat trainRecap__stat--skipped">
            &mdash; {recapCounts.skippedCount} non note(s)
          </span>
        )}
      </div>

      <div className="trainRecap__score">
        Score: {sessionScoreDelta >= 0 ? `+${sessionScoreDelta}` : sessionScoreDelta}
      </div>

      {words && words.length > 0 && (
        <div className="trainRecap__tableWrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Francais</th>
                <th>JP</th>
                {sessionMode.current === "keyboard" && <th>Tes reponses</th>}
                {sessionMode.current === "keyboard" && <th>Correction</th>}
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {words.map((word) => {
                const wordRating = ratingsByWordId[word.id] ?? null;
                const isUnrated = wordRating === null;
                const typedAnswers = keyboardAnswers[word.id];
                const correction = keyboardCorrections[word.id];
                return (
                  <tr key={word.id} className={isUnrated ? "trainRecap__row--skipped" : ""}>
                    <td>{word.french}</td>
                    <td className="muted">{word.kanji ?? word.kana ?? word.romaji ?? "\u2014"}</td>
                    {sessionMode.current === "keyboard" && (
                      <td className="trainRecap__typed">
                        {typedAnswers ? (
                          <>
                            <span>{typedAnswers.answer1 || "\u2014"}</span>
                            <span className="muted"> / </span>
                            <span>{typedAnswers.answer2 || "\u2014"}</span>
                          </>
                        ) : (
                          "\u2014"
                        )}
                      </td>
                    )}
                    {sessionMode.current === "keyboard" && (
                      <td className="trainRecap__correction">
                        {correction?.correction ?? "\u2014"}
                      </td>
                    )}
                    <td>
                      <div className="trainRecap__ratingGroup">
                        <button
                          className={`trainSession__ratingBtn trainSession__ratingBtn--success ${wordRating === "success" ? "trainSession__ratingBtn--selected" : ""}`}
                          type="button"
                          onClick={() => setRating(word.id, "success")}
                        >
                          &#x2713;
                        </button>
                        <button
                          className={`trainSession__ratingBtn trainSession__ratingBtn--warning ${wordRating === "partial" ? "trainSession__ratingBtn--selected" : ""}`}
                          type="button"
                          onClick={() => setRating(word.id, "partial")}
                        >
                          &#x26A0;
                        </button>
                        <button
                          className={`trainSession__ratingBtn trainSession__ratingBtn--danger ${wordRating === "fail" ? "trainSession__ratingBtn--selected" : ""}`}
                          type="button"
                          onClick={() => setRating(word.id, "fail")}
                        >
                          &#x2717;
                        </button>
                        {isUnrated && <span className="trainRecap__skippedLabel">Non note</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="trainRecap__actions">
        <button
          className="button button--primary"
          type="button"
          onClick={() => submitRatings()}
          disabled={isSubmitting || isRatingsSubmitted}
        >
          {isRatingsSubmitted ? "Serie enregistree" : "Enregistrer la serie"}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => restartSession()}
          disabled={isSubmitting}
        >
          Recommencer
        </button>
        <Link className="button" to={props.mode === "srs" ? "/srs" : "/"}>
          {props.mode === "srs" ? "Retour au SRS" : "Retour aux series"}
        </Link>
      </div>
    </div>
  );
}

// --- Utility functions ---

function generateRandomPromptModes(count: number): PromptMode[] {
  const modes: PromptMode[] = ["french", "romaji", "kana", "kanji"];
  return Array.from({ length: count }, () => modes[Math.floor(Math.random() * modes.length)]);
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
  if (rating === "success") return 3;
  if (rating === "partial") return -2;
  return -5;
}

function formatMs(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function loadSettings(): PersistedSeriesSettings {
  try {
    const rawValue = window.localStorage.getItem(SETTINGS_KEY);
    if (!rawValue) return { sessionMode: "manual", promptMode: "french" };
    const parsed = JSON.parse(rawValue) as Partial<PersistedSeriesSettings>;
    const sessionMode: SessionMode =
      parsed.sessionMode === "manual" || parsed.sessionMode === "keyboard"
        ? parsed.sessionMode
        : "manual";
    const promptMode: PromptMode = (["french", "romaji", "kana", "kanji"] as PromptMode[]).includes(
      parsed.promptMode as PromptMode,
    )
      ? (parsed.promptMode as PromptMode)
      : "french";
    return { sessionMode, promptMode };
  } catch {
    return { sessionMode: "manual", promptMode: "french" };
  }
}

function saveSettings(settings: PersistedSeriesSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function KanjiViewerModal({
  kanjiList,
  selectedKanji,
  onSelectKanji,
  onClose,
}: {
  kanjiList: string[];
  selectedKanji: string;
  onSelectKanji: (kanji: string) => void;
  onClose: () => void;
}) {
  const [showNumbers, setShowNumbers] = useState(false);
  const [animate, setAnimate] = useState(false);

  return (
    <div
      className="modal__overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <div
        className="modal__content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="modal__header">
          <h2 className="modal__title">Sens de trace</h2>
          <button className="modal__close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>

        {kanjiList.length > 1 && (
          <div className="modal__section">
            <div className="field__label">Choisir un kanji</div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                flexWrap: "wrap",
                marginTop: "var(--space-3)",
              }}
            >
              {kanjiList.map((kanji) => (
                <button
                  key={kanji}
                  type="button"
                  className={`button ${selectedKanji === kanji ? "button--primary" : ""}`}
                  onClick={() => {
                    onSelectKanji(kanji);
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

        <div
          className="modal__section"
          style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}
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
            <span>Afficher les numeros</span>
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
            <span>Animer le trace</span>
          </label>
        </div>

        <div className="modal__kanjiViewer">
          <div style={{ fontSize: "18px", fontWeight: 700 }}>{selectedKanji}</div>
          <KanjiStrokeViewer
            kanji={selectedKanji}
            showNumbers={showNumbers}
            animate={animate}
            size={300}
          />
        </div>
      </div>
    </div>
  );
}
