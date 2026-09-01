import { useState } from "react";

import type { BadgeDefinition, DailyChallenge, XpAward } from "../../api";
import { submitDailyChallenge } from "../../api";

type DailyChallengeCardProps = {
  challenge: DailyChallenge | null;
  onCompleted: (result: {
    isCorrect: boolean;
    newBadges: BadgeDefinition[];
    xpAward: XpAward;
  }) => void;
};

export function DailyChallengeCard({ challenge, onCompleted }: DailyChallengeCardProps) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(
    challenge?.completed ? challenge.is_correct === 1 : null,
  );

  if (!challenge) {
    return (
      <div className="dashCard dailyChallenge">
        <h2 className="dashCard__title">Défi du jour</h2>
        <p className="dailyChallenge__empty">Ajoute des mots pour débloquer un défi quotidien.</p>
      </div>
    );
  }

  const isCompleted = challenge.completed === 1 || isCorrect !== null;
  const promptLabel =
    challenge.challenge_type === "translate_fr_jp" ? "Traduis en japonais" : "Traduis en français";

  async function handleSubmit() {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await submitDailyChallenge(answer.trim());
      setIsCorrect(result.isCorrect);
      setFeedback(result.isCorrect ? "Bien joué !" : `Réponse attendue : ${result.expectedAnswer}`);
      onCompleted({
        isCorrect: result.isCorrect,
        newBadges: result.newBadges,
        xpAward: result,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Impossible d’envoyer le défi");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dashCard dailyChallenge">
      <h2 className="dashCard__title">Défi du jour</h2>
      <p className="dailyChallenge__label">{promptLabel}</p>
      <p className="dailyChallenge__prompt">{challenge.challenge_data.prompt}</p>
      {isCompleted ? (
        <p className={`dailyChallenge__result ${isCorrect ? "dailyChallenge__result--ok" : ""}`}>
          {isCorrect ? "Défi réussi · +15 XP" : (feedback ?? "Défi terminé")}
        </p>
      ) : (
        <form
          className="dailyChallenge__form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <input
            className="input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Ta réponse"
            autoComplete="off"
          />
          <button className="button button--primary" type="submit" disabled={isSubmitting}>
            Valider
          </button>
        </form>
      )}
      {feedback && !isCorrect ? <p className="dailyChallenge__feedback">{feedback}</p> : null}
    </div>
  );
}
