import { useEffect, useState } from "react";
import {
  type GeminiQuota,
  type ReadingParagraph,
  type ReadingQuestion,
  type Tag,
  checkReadingAnswer,
  fetchGeminiQuota,
  fetchTags,
  generateReading,
} from "../../api";
import { AudioButton } from "../components/AudioButton";
import { QuotaBar } from "../components/QuotaBar";

type ReadingPhase = "setup" | "reading" | "questions" | "done";

type QuestionResult = {
  question: string;
  userAnswer: string;
  isCorrect: boolean;
  feedback: string;
};

export function ReadingPage() {
  const [phase, setPhase] = useState<ReadingPhase>("setup");
  const [tags, setTags] = useState<Tag[]>([]);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<"debutant" | "intermediaire">("debutant");
  const [textLength, setTextLength] = useState<"short" | "medium" | "long">("medium");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [paragraphs, setParagraphs] = useState<ReadingParagraph[]>([]);
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);
  const [showFurigana, setShowFurigana] = useState(false);
  const [hoveredWord, setHoveredWord] = useState<{ text: string; reading: string; meaning: string } | null>(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);

  useEffect(() => {
    Promise.all([fetchTags(), fetchGeminiQuota()])
      .then(([loadedTags, loadedQuota]) => {
        setTags(loadedTags);
        setQuota(loadedQuota);
      })
      .catch(() => {});
  }, []);

  function toggleTag(tagId: number) {
    setSelectedTagIds((previous) =>
      previous.includes(tagId)
        ? previous.filter((id) => id !== tagId)
        : [...previous, tagId],
    );
  }

  async function handleGenerate() {
    if (selectedTagIds.length === 0) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generateReading({ tagIds: selectedTagIds, difficulty, length: textLength });
      setParagraphs(result.paragraphs);
      setQuestions(result.questions);
      setQuota(result.quota);
      setPhase("reading");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAnswerQuestion() {
    const question = questions[currentQuestionIndex];
    if (!question || !questionAnswer.trim()) return;
    setIsEvaluating(true);
    try {
      const result = await checkReadingAnswer(question.question, question.answer, questionAnswer.trim());
      const newResults = [...questionResults, {
        question: question.question,
        userAnswer: questionAnswer.trim(),
        isCorrect: result.isCorrect,
        feedback: result.feedback,
      }];
      setQuestionResults(newResults);
      setQuestionAnswer("");

      if (currentQuestionIndex + 1 < questions.length) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      } else {
        setPhase("done");
      }
    } catch {
      // ignore
    } finally {
      setIsEvaluating(false);
    }
  }

  function resetSession() {
    setPhase("setup");
    setParagraphs([]);
    setQuestions([]);
    setQuestionResults([]);
    setCurrentQuestionIndex(0);
    setQuestionAnswer("");
    setHoveredWord(null);
    setErrorMessage(null);
  }

  // ========== SETUP ==========
  if (phase === "setup") {
    return (
      <div>
        <div className="pageHeader">
          <div>
            <h1 className="pageTitle">Mode lecture</h1>
            <p className="pageSubtitle">Lis un texte adapté à ton vocabulaire</p>
          </div>
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="pratique__setup">
          <div className="pratique__field">
            <label className="label">Tags (vocabulaire)</label>
            <div className="pratique__chipGroup">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`chip ${selectedTagIds.includes(tag.id) ? "chip--selected" : ""}`}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pratique__row">
            <div className="pratique__field">
              <label className="label">Difficulté</label>
              <select className="input" value={difficulty} onChange={(event) => setDifficulty(event.target.value as "debutant" | "intermediaire")}>
                <option value="debutant">Débutant</option>
                <option value="intermediaire">Intermédiaire</option>
              </select>
            </div>
            <div className="pratique__field">
              <label className="label">Longueur</label>
              <select className="input" value={textLength} onChange={(event) => setTextLength(event.target.value as "short" | "medium" | "long")}>
                <option value="short">Court (3-4 phrases)</option>
                <option value="medium">Moyen (5-6 phrases)</option>
                <option value="long">Long (7-8 phrases)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="button button--primary"
            disabled={selectedTagIds.length === 0 || isGenerating}
            onClick={handleGenerate}
            style={{ marginTop: "var(--space-4)" }}
          >
            {isGenerating ? "Génération..." : "Générer un texte"}
          </button>

          {errorMessage && (
            <div className="formError" style={{ marginTop: "var(--space-3)" }}>{errorMessage}</div>
          )}
        </div>
      </div>
    );
  }

  // ========== READING / QUESTIONS / DONE ==========
  const fullText = paragraphs.map((paragraph) => paragraph.japanese).join(" ");

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Lecture</h1>
          <p className="pageSubtitle">
            {phase === "reading" ? "Lis le texte, clique sur les mots pour voir la traduction" :
             phase === "questions" ? "Réponds aux questions de compréhension" :
             "Résultats"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <AudioButton text={fullText} size="large" />
          <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "var(--space-1)", cursor: "pointer" }}>
            <input type="checkbox" checked={showFurigana} onChange={(event) => setShowFurigana(event.target.checked)} />
            Furigana
          </label>
        </div>
      </div>

      <div style={{
        border: "2px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        marginBottom: "var(--space-5)",
        lineHeight: 2.2,
        fontSize: "18px",
        position: "relative",
      }}>
        {paragraphs.map((paragraph, paragraphIndex) => (
          <div key={paragraphIndex} style={{ marginBottom: "var(--space-4)" }}>
            <p style={{ margin: 0 }}>
              {paragraph.words.map((word, wordIndex) => (
                <span
                  key={wordIndex}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px dashed var(--color-text-soft)",
                    position: "relative",
                    display: "inline-block",
                  }}
                  onMouseEnter={() => setHoveredWord(word)}
                  onMouseLeave={() => setHoveredWord(null)}
                >
                  {showFurigana && word.reading && (
                    <span style={{
                      position: "absolute",
                      top: "-14px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "10px",
                      color: "var(--color-text-soft)",
                      whiteSpace: "nowrap",
                    }}>
                      {word.reading}
                    </span>
                  )}
                  {word.text}
                  {hoveredWord === word && (
                    <span style={{
                      position: "absolute",
                      bottom: "100%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      padding: "var(--space-1) var(--space-2)",
                      fontSize: "12px",
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                      marginBottom: "4px",
                    }}>
                      {word.reading} — {word.meaning}
                    </span>
                  )}
                </span>
              ))}
            </p>
            <p style={{ fontSize: "14px", color: "var(--color-text-soft)", margin: "var(--space-1) 0 0" }}>
              {paragraph.french}
            </p>
          </div>
        ))}
      </div>

      {phase === "reading" && questions.length > 0 && (
        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            className="button button--primary"
            onClick={() => { setPhase("questions"); setCurrentQuestionIndex(0); }}
          >
            Passer aux questions
          </button>
        </div>
      )}

      {phase === "questions" && questions[currentQuestionIndex] && (
        <div style={{
          border: "2px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-5)",
          maxWidth: "600px",
          margin: "0 auto",
        }}>
          <p style={{ fontSize: "13px", color: "var(--color-text-soft)" }}>
            Question {currentQuestionIndex + 1}/{questions.length}
          </p>
          <p style={{ fontSize: "16px", fontWeight: 600, marginBottom: "var(--space-4)" }}>
            {questions[currentQuestionIndex].question}
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <input
              type="text"
              className="input"
              value={questionAnswer}
              onChange={(event) => setQuestionAnswer(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") handleAnswerQuestion(); }}
              placeholder="Ta réponse..."
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="button button--primary"
              disabled={!questionAnswer.trim() || isEvaluating}
              onClick={handleAnswerQuestion}
            >
              {isEvaluating ? "..." : "Vérifier"}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div>
          <div style={{
            border: "2px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-5)",
            marginBottom: "var(--space-4)",
          }}>
            <h3 style={{ marginTop: 0 }}>Résultats de compréhension</h3>
            {questionResults.map((result, index) => (
              <div key={index} style={{
                padding: "var(--space-3)",
                borderBottom: index < questionResults.length - 1 ? "1px solid var(--color-border)" : "none",
              }}>
                <p style={{ fontWeight: 600, margin: "0 0 var(--space-1)" }}>{result.question}</p>
                <p style={{ margin: "0 0 var(--space-1)", fontSize: "14px" }}>
                  Ta réponse : {result.userAnswer}
                </p>
                <p style={{
                  margin: 0,
                  fontSize: "14px",
                  color: result.isCorrect ? "var(--color-success, #22c55e)" : "var(--color-danger, #ef4444)",
                }}>
                  {result.isCorrect ? "Correct !" : "Incorrect"} — {result.feedback}
                </p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center" }}>
            <button type="button" className="button button--primary" onClick={resetSession}>
              Nouveau texte
            </button>
          </div>
        </div>
      )}

      {phase === "reading" && questions.length === 0 && (
        <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          <button type="button" className="button" onClick={resetSession}>
            Nouveau texte
          </button>
        </div>
      )}
    </div>
  );
}
