import type { User, WordWithStats } from "../../api";
import { formatWordJp } from "../utils/wordDisplay";
import { DailyChallengeCard } from "./DailyChallengeCard";
import { PlayIcon } from "./NavIcons";

type SessionHeroCardProps = {
  currentUser: User | null;
  dueCount: number;
  todayReviews: number;
  previewWords: WordWithStats[];
  onStartSession: () => void;
};

function greetingForHour(hour: number): string {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function SessionHeroCard({
  currentUser,
  dueCount,
  todayReviews,
  previewWords,
  onStartSession,
}: SessionHeroCardProps) {
  const now = new Date();
  const displayName = currentUser?.display_name ?? currentUser?.username ?? "";
  const estimatedMinutes = Math.max(1, Math.round(dueCount * 0.5));
  const dateLabel = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="dashCard dashCard--hero">
      <div className="sessionHero">
        <div className="sessionHero__date">{dateLabel}</div>
        <div className="sessionHero__greet">
          {greetingForHour(now.getHours())}
          {displayName ? `, ${displayName}` : ""}
        </div>
        <button
          className="sessionHero__start"
          type="button"
          onClick={onStartSession}
          disabled={dueCount === 0}
        >
          <PlayIcon className="sessionHero__startIcon" />
          Commencer la session
        </button>
        <div className="sessionHero__meta">
          {dueCount > 0
            ? `${dueCount} cartes · environ ${estimatedMinutes} min · ${todayReviews} déjà faites`
            : todayReviews > 0
              ? `Rien à réviser · ${todayReviews} déjà faites aujourd'hui`
              : "Aucune carte due pour le moment"}
        </div>
        <div>
          <div className="sessionHero__firstUpLabel">À venir</div>
          {previewWords.length > 0 ? (
            <div className="sessionHero__chips">
              {previewWords.slice(0, 4).map((word) => (
                <span key={word.id} className="sessionHero__chip">
                  {formatWordJp(word)}
                </span>
              ))}
            </div>
          ) : (
            <div className="sessionHero__empty">Ajoute du vocabulaire pour lancer une session.</div>
          )}
        </div>
        <DailyChallengeCard variant="hero" />
      </div>
    </div>
  );
}
