import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  type Tag,
  type WordWithStats,
  fetchSeriesWords,
  fetchTags,
  submitBulkReviews,
} from "../../api";

type QuizType = "kanji-to-reading" | "kanji-to-meaning" | "meaning-to-kanji";
type QuizPhase = "setup" | "training" | "recap";

type QuizResult = {
  word: WordWithStats;
  userAnswer: string;
  expected: string;
  result: "success" | "partial" | "fail";
};

const quizTypeLabels: Record<QuizType, string> = {
  "kanji-to-reading": "Kanji → Lecture",
  "kanji-to-meaning": "Kanji → Sens",
  "meaning-to-kanji": "Sens → Kanji",
};

export function KanjiQuizPage() {
  const [phase, setPhase] = useState<QuizPhase>("setup");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [quizType, setQuizType] = useState<QuizType>("kanji-to-reading");
  const [wordCount, setWordCount] = useState(10);

  const [kanjiWords, setKanjiWords] = useState<WordWithStats[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  const currentWord = kanjiWords[currentIndex] ?? null;

  const recapStats = useMemo(() => {
    let correct = 0;
    let partial = 0;
    let fail = 0;
    for (const quizResult of quizResults) {
      if (quizResult.result === "success") correct++;
      else if (quizResult.result === "partial") partial++;
      else fail++;
    }
    return { correct, partial, fail };
  }, [quizResults]);

  function getPrompt(word: WordWithStats): string {
    if (quizType === "kanji-to-reading" || quizType === "kanji-to-meaning") {
      return word.kanji ?? "";
    }
    return word.french;
  }

  function getExpected(word: WordWithStats): string {
    if (quizType === "kanji-to-reading") return word.kana ?? word.romaji ?? "";
    if (quizType === "kanji-to-meaning") return word.french;
    return word.kanji ?? "";
  }

  function evaluateAnswer(userAnswer: string, expected: string): "success" | "partial" | "fail" {
    const normalizedUser = userAnswer.trim().toLowerCase();
    const normalizedExpected = expected.trim().toLowerCase();
    if (!normalizedUser) return "fail";
    if (normalizedUser === normalizedExpected) return "success";
    if (normalizedExpected.includes(normalizedUser) || normalizedUser.includes(normalizedExpected))
      return "partial";
    return "fail";
  }

  async function handleStart() {
    if (!selectedTagId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const loadedWords = await fetchSeriesWords(selectedTagId);
      const withKanji = loadedWords.filter((word) => word.kanji && word.kanji.trim() !== "");
      const shuffled = [...withKanji].sort(() => Math.random() - 0.5).slice(0, wordCount);
      if (shuffled.length === 0) {
        setErrorMessage("Aucun mot avec kanji dans cette série");
        return;
      }
      setKanjiWords(shuffled);
      setCurrentIndex(0);
      setAnswers({});
      setQuizResults([]);
      setPhase("training");
    } catch {
      setErrorMessage("Erreur lors du chargement des mots");
    } finally {
      setIsLoading(false);
    }
  }

  function handleNext() {
    if (currentIndex < kanjiWords.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      handleFinish();
    }
  }

  async function handleFinish() {
    const results: QuizResult[] = kanjiWords.map((word, index) => {
      const userAnswer = answers[index] ?? "";
      const expected = getExpected(word);
      const result = evaluateAnswer(userAnswer, expected);
      return { word, userAnswer, expected, result };
    });
    setQuizResults(results);

    try {
      const reviews = results.map((quizResult) => ({
        wordId: quizResult.word.id,
        result: quizResult.result,
      }));
      await submitBulkReviews(reviews);
    } catch {
      /* ignore review submission errors */
    }

    setPhase("recap");
  }

  // ---- SETUP ----
  if (phase === "setup") {
    return (
      <div>
        <div className="pageHeader">
          <div>
            <h1 className="pageTitle">Quiz Kanji</h1>
            <p className="pageSubtitle">Teste tes connaissances des kanji de ton vocabulaire</p>
          </div>
        </div>

        <div className="trainSetup">
          <div className="field">
            <div className="field__label">Série (source)</div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
              }}
            >
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`phrasesSetup__tagChip ${selectedTagId === tag.id ? "phrasesSetup__tagChip--active" : ""}`}
                  onClick={() => setSelectedTagId(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field__label">Type de quiz</div>
            <div className="phrasesSetup__optionRow">
              {(Object.entries(quizTypeLabels) as [QuizType, string][]).map(([type, label]) => (
                <label
                  key={type}
                  className={`phrasesSetup__radioOption ${quizType === type ? "phrasesSetup__radioOption--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="quizType"
                    checked={quizType === type}
                    onChange={() => setQuizType(type)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field__label">Nombre de mots</div>
            <div className="phrasesSetup__optionRow">
              {[5, 10, 15, 20].map((count) => (
                <label
                  key={count}
                  className={`phrasesSetup__radioOption ${wordCount === count ? "phrasesSetup__radioOption--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="wordCount"
                    checked={wordCount === count}
                    onChange={() => setWordCount(count)}
                  />
                  {count}
                </label>
              ))}
            </div>
          </div>

          {errorMessage && <div className="formError">{errorMessage}</div>}

          <button
            className="button button--primary"
            type="button"
            onClick={handleStart}
            disabled={!selectedTagId || isLoading}
            style={{ marginTop: "var(--space-4)" }}
          >
            {isLoading ? "Chargement…" : "Commencer le quiz"}
          </button>
        </div>
      </div>
    );
  }

  // ---- TRAINING ----
  if (phase === "training" && currentWord) {
    const isLast = currentIndex === kanjiWords.length - 1;
    return (
      <div>
        <div className="pageHeader">
          <h1 className="pageTitle">Quiz Kanji</h1>
          <p className="pageSubtitle">
            {currentIndex + 1} / {kanjiWords.length} — {quizTypeLabels[quizType]}
          </p>
        </div>

        <div className="trainSession__card" style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: quizType === "meaning-to-kanji" ? 20 : 64,
              fontWeight: 700,
              marginBottom: "var(--space-4)",
            }}
          >
            {getPrompt(currentWord)}
          </div>
          <div className="muted" style={{ marginTop: "var(--space-2)", fontSize: 13 }}>
            {quizType === "kanji-to-reading"
              ? "Écris la lecture en kana"
              : quizType === "kanji-to-meaning"
                ? "Écris le sens en français"
                : "Écris en kanji"}
          </div>
        </div>

        <div
          style={{
            marginTop: "var(--space-4)",
            maxWidth: 400,
            margin: "var(--space-4) auto",
          }}
        >
          <input
            ref={inputRef}
            className="input"
            value={answers[currentIndex] ?? ""}
            onChange={(event) =>
              setAnswers((previous) => ({
                ...previous,
                [currentIndex]: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") handleNext();
            }}
            placeholder="Ta réponse…"
          />
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              marginTop: "var(--space-3)",
              justifyContent: "center",
            }}
          >
            {currentIndex > 0 && (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setCurrentIndex(currentIndex - 1);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                ← Précédent
              </button>
            )}
            <button className="button button--primary" type="button" onClick={handleNext}>
              {isLast ? "Terminer" : "Suivant →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- RECAP ----
  return (
    <div className="phrasesRecap">
      <h2 className="phrasesRecap__title">Résultats du Quiz Kanji</h2>

      <div className="phrasesRecap__summary">
        <span className="phrasesRecap__stat phrasesRecap__stat--success">
          ✓ {recapStats.correct} réussi(s)
        </span>
        <span className="phrasesRecap__stat phrasesRecap__stat--error">
          ✗ {recapStats.fail} raté(s)
        </span>
        {recapStats.partial > 0 && (
          <span className="phrasesRecap__stat phrasesRecap__stat--skipped">
            ~ {recapStats.partial} partiel(s)
          </span>
        )}
      </div>

      {quizResults.length > 0 && (
        <div className="phrasesRecap__tableWrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Ta réponse</th>
                <th>Réponse attendue</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {quizResults.map((quizResult, index) => (
                <tr key={quizResult.word.id}>
                  <td className="muted">{index + 1}</td>
                  <td>{getPrompt(quizResult.word)}</td>
                  <td>{quizResult.userAnswer || <span className="muted">—</span>}</td>
                  <td className="muted">{quizResult.expected}</td>
                  <td>
                    {quizResult.result === "success" ? (
                      <span style={{ color: "var(--color-success)" }}>✓</span>
                    ) : quizResult.result === "partial" ? (
                      <span style={{ color: "#f59e0b" }}>~</span>
                    ) : (
                      <span style={{ color: "var(--color-danger)" }}>✗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorMessage && <div className="formError">{errorMessage}</div>}

      <div className="phrasesRecap__actions">
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            setPhase("setup");
            setKanjiWords([]);
            setAnswers({});
            setQuizResults([]);
            setCurrentIndex(0);
            setErrorMessage(null);
          }}
        >
          Recommencer
        </button>
        <Link className="button" to="/">
          Retour
        </Link>
      </div>
    </div>
  );
}
