import { useEffect, useState } from "react";
import {
  type BadgeDefinition,
  type DailyChallenge,
  fetchDailyChallenge,
  submitDailyChallenge,
} from "../../api";

interface DailyChallengeCardProps {
  onNewBadges?: (badges: BadgeDefinition[]) => void;
}

export function DailyChallengeCard({ onNewBadges }: DailyChallengeCardProps) {
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
    return () => { isCancelled = true; };
  }, []);

  if (isLoading || !challenge) return null;

  const isCompleted = challenge.completed === 1;
  const typeLabel = challenge.challenge_type === "translate_fr_jp"
    ? "Traduis en japonais"
    : "Traduis en français";

  async function handleSubmit() {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await submitDailyChallenge(answer.trim());
      setResult({ isCorrect: response.isCorrect, expectedAnswer: response.expectedAnswer });
      setChallenge((previous) => previous ? { ...previous, completed: 1, is_correct: response.isCorrect ? 1 : 0 } : previous);
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
    <div style={{
      padding: "var(--space-5)",
      border: "2px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      marginBottom: "var(--space-6)",
      background: "var(--color-surface)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Défi du jour</h3>
        <span style={{ fontSize: "13px", color: "var(--color-text-soft)" }}>
          {challenge.challenge_date}
        </span>
      </div>

      <p style={{ fontSize: "13px", color: "var(--color-text-soft)", margin: "0 0 var(--space-2)" }}>
        {typeLabel}
      </p>

      <p style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 var(--space-4)" }}>
        {challenge.challenge_data.prompt}
      </p>

      {isCompleted || result ? (
        <div>
          {(result?.isCorrect || challenge.is_correct === 1) ? (
            <p style={{ color: "var(--color-success, #22c55e)", fontWeight: 600 }}>
              Correct ! Reviens demain !
            </p>
          ) : (
            <div>
              <p style={{ color: "var(--color-danger, #ef4444)", fontWeight: 600 }}>
                Incorrect
              </p>
              <p style={{ fontSize: "14px", color: "var(--color-text-soft)" }}>
                Réponse attendue : <strong>{result?.expectedAnswer ?? challenge.challenge_data.answer}</strong>
              </p>
              <p style={{ fontSize: "13px", color: "var(--color-text-soft)", marginTop: "var(--space-2)" }}>
                Reviens demain !
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <input
            type="text"
            className="input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); }}
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
        <p style={{ fontSize: "12px", color: "var(--color-text-soft)", marginTop: "var(--space-2)" }}>
          Indice (kana) : {challenge.challenge_data.hint}
        </p>
      )}
    </div>
  );
}
