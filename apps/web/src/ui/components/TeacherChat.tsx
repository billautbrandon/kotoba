import { useEffect, useRef, useState } from "react";

import { type AskTeacherTurn, askTeacher } from "../../api";

type TeacherChatProps = {
  prompt: string;
  expectedAnswer: string;
  userAnswer?: string;
  direction?: "fr-to-jp" | "jp-to-fr";
  mode?: "phrases" | "construction" | "jlpt" | "conjugaison" | "dialogue";
  resetKey: string | number;
};

export function TeacherChat({
  prompt,
  expectedAnswer,
  userAnswer,
  direction,
  mode,
  resetKey,
}: TeacherChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<AskTeacherTurn[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previousResetKey = useRef(resetKey);
  if (previousResetKey.current !== resetKey) {
    previousResetKey.current = resetKey;
    setQuestion("");
    setHistory([]);
    setErrorMessage(null);
  }

  const userAnswerRef = useRef(userAnswer);
  useEffect(() => {
    userAnswerRef.current = userAnswer;
  }, [userAnswer]);

  async function handleAsk() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isAsking) return;
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
        <span className="teacherChat__title">Question au prof</span>
        <button
          type="button"
          className="teacherChat__close"
          onClick={() => setIsOpen(false)}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

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
              handleAsk();
            }
          }}
          rows={2}
          maxLength={800}
          disabled={isAsking}
        />
        <button
          type="button"
          className="button button--primary teacherChat__send"
          onClick={handleAsk}
          disabled={isAsking || question.trim().length === 0}
        >
          {isAsking ? "…" : "Demander"}
        </button>
      </div>

      {errorMessage && <div className="formError teacherChat__error">{errorMessage}</div>}
    </div>
  );
}
