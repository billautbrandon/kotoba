import { useEffect, useRef, useState } from "react";

import { type AskTeacherTurn, askTeacher } from "../../api";

type TeacherChatProps = {
  prompt: string;
  expectedAnswer: string;
  userAnswer?: string;
  direction?: "fr-to-jp" | "jp-to-fr";
  mode?: "phrases" | "construction" | "jlpt" | "conjugaison" | "dialogue" | "ecoute";
  resetKey: string | number;
  defaultOpen?: boolean;
  variant?: "inline" | "afterReview";
  errorType?: string | null;
  feedback?: string | null;
  suggestionChips?: string[];
};

const DEFAULT_REVIEW_CHIPS = ["Pourquoi cette particule ?", "Un autre exemple", "Ce kanji ?"];

export function TeacherChat({
  prompt,
  expectedAnswer,
  userAnswer,
  direction,
  mode,
  resetKey,
  defaultOpen = false,
  variant = "inline",
  errorType,
  feedback,
  suggestionChips,
}: TeacherChatProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<AskTeacherTurn[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  const previousVariant = useRef(variant);

  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    previousVariant.current = variant;
    setQuestion("");
    setHistory([]);
    setErrorMessage(null);
    setIsAsking(false);
    setIsOpen(defaultOpen);
  }

  const userAnswerRef = useRef(userAnswer);
  useEffect(() => {
    userAnswerRef.current = userAnswer;
  }, [userAnswer]);

  useEffect(() => {
    if (variant === "afterReview" && previousVariant.current !== "afterReview") {
      setIsOpen(true);
    }
    previousVariant.current = variant;
  }, [variant]);

  const chips = suggestionChips ?? (variant === "afterReview" ? DEFAULT_REVIEW_CHIPS : []);

  function handleClose() {
    setIsOpen(false);
  }

  async function handleAsk(nextQuestion?: string) {
    const trimmedQuestion = (nextQuestion ?? question).trim();
    if (!trimmedQuestion || isAsking) return;
    setIsOpen(true);
    setIsAsking(true);
    setErrorMessage(null);
    try {
      const result = await askTeacher({
        question: trimmedQuestion,
        prompt,
        expectedAnswer,
        userAnswer: userAnswerRef.current,
        direction,
        mode,
        errorType,
        feedback,
        history,
      });
      setHistory((previous) => [...previous, { question: trimmedQuestion, answer: result.answer }]);
      setQuestion("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsAsking(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="teacherChat__toggle" onClick={() => setIsOpen(true)}>
        Une question au prof ?
      </button>
    );
  }

  return (
    <div className="teacherChat">
      <div className="teacherChat__header">
        <span className="teacherChat__title">Une question ?</span>
        <button
          type="button"
          className="teacherChat__close"
          onClick={handleClose}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {chips.length > 0 && history.length === 0 ? (
        <div className="teacherChat__chips">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="teacherChat__chip"
              disabled={isAsking}
              onClick={() => void handleAsk(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      {history.length > 0 && (
        <div className="teacherChat__history">
          {history.map((turn, index) => (
            <div className="teacherChat__turn" key={`turn-${index}-${turn.question.slice(0, 8)}`}>
              <div className="teacherChat__bubble teacherChat__bubble--user">{turn.question}</div>
              <div className="teacherChat__bubble teacherChat__bubble--teacher">{turn.answer}</div>
            </div>
          ))}
        </div>
      )}

      <div className="teacherChat__inputRow">
        <textarea
          className="teacherChat__textarea"
          placeholder="Pose une question sur la phrase, une particule, un kanji…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void handleAsk();
            }
          }}
          rows={2}
          maxLength={800}
          disabled={isAsking}
        />
        <button
          type="button"
          className="button button--primary teacherChat__send"
          onClick={() => void handleAsk()}
          disabled={isAsking || question.trim().length === 0}
        >
          {isAsking ? "…" : "Demander"}
        </button>
      </div>

      {errorMessage && <div className="formError teacherChat__error">{errorMessage}</div>}
    </div>
  );
}
