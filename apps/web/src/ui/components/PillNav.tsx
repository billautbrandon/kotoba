import type React from "react";

export type PillNavItem<T extends string> = {
  id: T;
  label: string;
  hint: string;
};

type PillNavProps<T extends string> = {
  items: Array<PillNavItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
};

export function PillNav<T extends string>({ items, value, onChange, ariaLabel }: PillNavProps<T>) {
  return (
    <div
      className="pillNav"
      role="tablist"
      aria-label={ariaLabel}
      style={{ "--pill-count": items.length } as React.CSSProperties}
    >
      {items.map((item) => {
        const isActive = value === item.id;
        return (
          <button
            key={item.id}
            className={`pillNav__tab${isActive ? " pillNav__tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
          >
            <span className="pillNav__label">{item.label}</span>
            <span className="pillNav__hint">{item.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
