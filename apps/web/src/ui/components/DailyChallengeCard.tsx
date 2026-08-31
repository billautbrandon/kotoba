import { useEffect, useState } from "react";
import {
  type BadgeDefinition,
  type DailyChallenge,
  fetchDailyChallenge,
  submitDailyChallenge,
} from "../../api";

interface DailyChallengeCardProps {
  onNewBadges?: (badges: BadgeDefinition[]) => void;
  variant?: "default" | "hero";
}

export function DailyChallengeCard({ onNewBadges, variant = "default" }: DailyChallengeCardProps) {
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ isCorrect: boolean; expectedAnswer: string } | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchDailyChallenge()
      .then((data) => {
        if (!isCancelled) setChallenge(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  if (isLoading || !challenge) return null;

  const isCompleted = challenge.completed === 1;
  const typeLabel =
    challenge.challenge_type === "translate_fr_jp" ? "Traduis en japonais" : "Traduis en français";

  async function handleSubmit() {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await submitDailyChallenge(answer.trim());
      setResult({ isCorrect: response.isCorrect, expectedAnswer: response.expectedAnswer });
      setChallenge((previous) =>
        previous ? { ...previous, completed: 1, is_correct: response.isCorrect ? 1 : 0 } : previous,
      );
      if (response.newBadges?.length > 0 && onNewBadges) {
        onNewBadges(response.newBadges);
      }
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`dailyChallenge${variant === "hero" ? " dailyChallenge--hero" : ""}`}>
      <div className="dailyChallenge__header">
        <h3 className="dailyChallenge__title">Défi du jour</h3>
        <span className="dailyChallenge__date">{challenge.challenge_date}</span>
      </div>

      <p className="dailyChallenge__type">{typeLabel}</p>
      <p className="dailyChallenge__prompt">{challenge.challenge_data.prompt}</p>

      {isCompleted || result ? (
        <div>
          {result?.isCorrect || challenge.is_correct === 1 ? (
            <p style={{ color: "var(--color-success)", fontWeight: 600, margin: 0 }}>
              Correct ! Reviens demain !
            </p>
          ) : (
            <div>
              <p style={{ color: "var(--color-danger)", fontWeight: 600, margin: 0 }}>Incorrect</p>
              <p style={{ fontSize: "14px", margin: "6px 0 0" }}>
                Réponse attendue :{" "}
                <strong>{result?.expectedAnswer ?? challenge.challenge_data.answer}</strong>
              </p>
              <p style={{ fontSize: "13px", margin: "8px 0 0" }}>Reviens demain !</p>
            </div>
          )}
        </div>
      ) : (
        <div className="dailyChallenge__form">
          <input
            type="text"
            className="input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
            }}
            placeholder="Ta réponse..."
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="button button--primary"
            disabled={!answer.trim() || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? "..." : "Vérifier"}
          </button>
        </div>
      )}

      {challenge.challenge_data.hint && !isCompleted && !result && (
        <p className="dailyChallenge__hint">Indice (kana) : {challenge.challenge_data.hint}</p>
      )}
    </div>
  );
}
