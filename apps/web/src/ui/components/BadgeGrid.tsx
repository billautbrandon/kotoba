import { useEffect, useState } from "react";
import { type BadgeDefinition, fetchBadges } from "../../api";

export function BadgeGrid() {
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
    return () => { isCancelled = true; };
  }, []);

  if (isLoading) return null;

  const earned = badges.filter((badge) => badge.earned_at !== null);
  const locked = badges.filter((badge) => badge.earned_at === null);

  return (
    <div className="statsSection">
      <h2 className="statsSection__title">
        Badges ({earned.length}/{badges.length})
      </h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "var(--space-3)",
      }}>
        {earned.map((badge) => (
          <div key={badge.id} style={{
            padding: "var(--space-3)",
            border: "2px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            textAlign: "center",
            background: "var(--color-surface)",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "var(--space-1)" }}>{badge.icon}</div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{badge.title}</div>
            <div style={{ fontSize: "11px", color: "var(--color-text-soft)", marginTop: "2px" }}>
              {badge.description}
            </div>
            {badge.earned_at && (
              <div style={{ fontSize: "10px", color: "var(--color-text-soft)", marginTop: "var(--space-1)" }}>
                {new Date(badge.earned_at).toLocaleDateString("fr-FR")}
              </div>
            )}
          </div>
        ))}
        {locked.map((badge) => (
          <div key={badge.id} style={{
            padding: "var(--space-3)",
            border: "2px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            textAlign: "center",
            opacity: 0.4,
            filter: "grayscale(1)",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "var(--space-1)" }}>{badge.icon}</div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{badge.title}</div>
            <div style={{ fontSize: "11px", color: "var(--color-text-soft)", marginTop: "2px" }}>
              {badge.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
