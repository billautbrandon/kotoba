type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  countLabel?: string;
  className?: string;
};

export function SearchBar({
  value,
  onChange,
  placeholder,
  ariaLabel,
  countLabel,
  className,
}: SearchBarProps) {
  const rootClassName = className ? `dictionarySearch ${className}` : "dictionarySearch";

  return (
    <div className={rootClassName}>
      <svg
        className="dictionarySearch__icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.2-3.2" />
      </svg>
      <input
        className="dictionarySearch__input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      {value ? (
        <button
          className="dictionarySearch__clear"
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => onChange("")}
        >
          ×
        </button>
      ) : null}
      {countLabel ? <span className="dictionarySearch__count">{countLabel}</span> : null}
    </div>
  );
}
