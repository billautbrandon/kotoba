import { useEffect, useState } from "react";

type LevelUpOverlayProps = {
  level: number;
  onDismiss: () => void;
};

export function LevelUpOverlay({ level, onDismiss }: LevelUpOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setIsVisible(true), 40);
    const hideTimer = window.setTimeout(() => {
      setIsVisible(false);
      window.setTimeout(onDismiss, 280);
    }, 2400);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [onDismiss]);

  return (
    <button
      className={`levelUp ${isVisible ? "levelUp--visible" : ""}`}
      type="button"
      onClick={onDismiss}
    >
      <span className="levelUp__kicker">Niveau supérieur</span>
      <span className="levelUp__value">{level}</span>
      <span className="levelUp__hint">Continue comme ça</span>
    </button>
  );
}
