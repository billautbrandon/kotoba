type XpBarProps = {
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  variant?: "hero" | "panel";
};

export function XpBar({ level, xpInLevel, xpForNextLevel, variant = "panel" }: XpBarProps) {
  const safeNeeded = Math.max(1, xpForNextLevel);
  const percent = Math.min(100, Math.round((xpInLevel / safeNeeded) * 100));

  return (
    <div className={`xpBar xpBar--${variant}`}>
      <div className="xpBar__meta">
        <span className="xpBar__level">Niveau {level}</span>
        <span className="xpBar__numbers">
          {xpInLevel} / {xpForNextLevel} XP
        </span>
      </div>
      <div className="xpBar__track" aria-hidden="true">
        <div className="xpBar__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
