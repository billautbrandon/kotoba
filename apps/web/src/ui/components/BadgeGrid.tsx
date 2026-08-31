import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type BadgeDefinition, fetchBadges } from "../../api";

type BadgeGridProps = {
  variant?: "full" | "compact";
};

export function BadgeGrid({ variant = "full" }: BadgeGridProps) {
  const [badges, setBadges] = useState<BadgeDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    fetchBadges()
      .then((data) => {
        if (!isCancelled) setBadges(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  if (isLoading) return null;

  const earned = badges.filter((badge) => badge.earned_at !== null);
  const locked = badges.filter((badge) => badge.earned_at === null);

  if (variant === "compact") {
    const preview = [...earned, ...locked].slice(0, 9);
    return (
      <div className="dashCard">
        <div className="dashCard__titleRow">
          <h2 className="dashCard__title">
            {earned.length} sur {badges.length} badges
          </h2>
          <Link className="dashCard__link" to="/stats">
            Voir tout
          </Link>
        </div>
        <div className="badgeCompact">
          {preview.map((badge) => {
            const isEarned = badge.earned_at !== null;
            return (
              <div
                key={badge.id}
                className={`badgeCompact__item${isEarned ? "" : " badgeCompact__item--locked"}`}
                title={badge.description}
              >
                <div className="badgeCompact__icon">{isEarned ? badge.icon : "🔒"}</div>
                <div className="badgeCompact__name">{badge.title}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="statsSection">
      <h2 className="statsSection__title">
        Badges ({earned.length}/{badges.length})
      </h2>
      <div className="badgeGrid">
        {earned.map((badge) => (
          <div key={badge.id} className="badgeTile">
            <div className="badgeTile__icon">{badge.icon}</div>
            <div className="badgeTile__title">{badge.title}</div>
            <div className="badgeTile__description">{badge.description}</div>
            {badge.earned_at && (
              <div className="badgeTile__date">
                {new Date(badge.earned_at).toLocaleDateString("fr-FR")}
              </div>
            )}
          </div>
        ))}
        {locked.map((badge) => (
          <div key={badge.id} className="badgeTile badgeTile--locked">
            <div className="badgeTile__icon">{badge.icon}</div>
            <div className="badgeTile__title">{badge.title}</div>
            <div className="badgeTile__description">{badge.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
