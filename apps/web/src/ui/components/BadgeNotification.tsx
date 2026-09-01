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
    const showTimer = window.setTimeout(() => setIsVisible(true), 80);
    const hideTimer = window.setTimeout(() => {
      setIsVisible(false);
      window.setTimeout(onDismiss, 400);
    }, 5000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [badges, onDismiss]);

  if (badges.length === 0) return null;

  return (
    <div className={`badgeToast ${isVisible ? "badgeToast--visible" : ""}`}>
      {badges.map((badge) => (
        <button key={badge.id} className="badgeToast__card" type="button" onClick={onDismiss}>
          <span className="badgeToast__icon">{badge.icon}</span>
          <span>
            <span className="badgeToast__kicker">Nouveau badge</span>
            <span className="badgeToast__title">{badge.title}</span>
            <span className="badgeToast__text">{badge.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
