import type { User } from "../../api";
import { PlayIcon } from "./NavIcons";

type SessionHeroCardProps = {
  currentUser: User | null;
  dueCount: number;
  todayReviews: number;
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
  onStartSession,
}: SessionHeroCardProps) {
  const now = new Date();
  const displayName = currentUser?.display_name ?? currentUser?.username ?? "";
  const estimatedMinutes = Math.max(1, Math.round(dueCount * 0.5));
  const sessionMeta =
    dueCount > 0
      ? [
          `${dueCount} cartes`,
          estimatedMinutes <= 60 ? `environ ${estimatedMinutes} min` : null,
          `${todayReviews} déjà faites`,
        ]
          .filter(Boolean)
          .join(" · ")
      : todayReviews > 0
        ? `Rien à réviser · ${todayReviews} déjà faites aujourd'hui`
        : "Aucune carte due pour le moment";
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
        <div className="sessionHero__meta">{sessionMeta}</div>
      </div>
    </div>
  );
}
