import { useEffect, useState } from "react";
import type { BadgeDefinition } from "../../api";

interface BadgeNotificationProps {
  badges: BadgeDefinition[];
  onDismiss: () => void;
}

export function BadgeNotification({ badges, onDismiss }: BadgeNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (badges.length === 0) return;
    const showTimer = setTimeout(() => setIsVisible(true), 100);
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 400);
    }, 5000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [badges, onDismiss]);

  if (badges.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: "var(--space-4)",
      right: "var(--space-4)",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      transform: isVisible ? "translateX(0)" : "translateX(120%)",
      opacity: isVisible ? 1 : 0,
      transition: "transform 0.4s ease, opacity 0.4s ease",
    }}>
      {badges.map((badge) => (
        <div key={badge.id} style={{
          padding: "var(--space-3) var(--space-4)",
          background: "var(--color-surface)",
          border: "2px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          minWidth: "260px",
          cursor: "pointer",
        }} onClick={onDismiss}>
          <span style={{ fontSize: "32px" }}>{badge.icon}</span>
          <div>
            <div style={{ fontSize: "12px", color: "var(--color-text-soft)", fontWeight: 500 }}>
              Nouveau badge !
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>{badge.title}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-soft)" }}>
              {badge.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
