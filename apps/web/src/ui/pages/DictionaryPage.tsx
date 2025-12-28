import React, { useEffect, useMemo, useState } from "react";

import type { WordWithTags } from "../../api";
import { fetchWordsWithTags } from "../../api";
import { AudioButton } from "../components/AudioButton";

type DictionaryLanguage = "fr" | "romaji" | "kana" | "kanji";

const dictionaryLanguageLabels: Record<DictionaryLanguage, string> = {
  fr: "FR",
  romaji: "Rōmaji",
  kana: "Kana",
  kanji: "Kanji",
};

function getWordField(word: WordWithTags, language: DictionaryLanguage): string {
  if (language === "fr") return word.french;
  if (language === "romaji") return word.romaji ?? "";
  if (language === "kana") return word.kana ?? "";
  return word.kanji ?? "";
}

function getOtherLanguages(language: DictionaryLanguage): DictionaryLanguage[] {
  const all: DictionaryLanguage[] = ["fr", "romaji", "kana", "kanji"];
  return all.filter((item) => item !== language);
}

function loadDictionaryLanguage(): DictionaryLanguage {
  const value = window.localStorage.getItem("kotoba.dictionary.language");
  if (value === "fr" || value === "romaji" || value === "kana" || value === "kanji") return value;
  return "fr";
}

function saveDictionaryLanguage(language: DictionaryLanguage) {
  window.localStorage.setItem("kotoba.dictionary.language", language);
}

type ViewMode = "cards" | "list";

function loadViewMode(): ViewMode {
  const value = window.localStorage.getItem("kotoba.dictionary.viewMode");
  if (value === "cards" || value === "list") return value;
  return "cards";
}

function saveViewMode(mode: ViewMode) {
  window.localStorage.setItem("kotoba.dictionary.viewMode", mode);
}

export function DictionaryPage() {
  const [words, setWords] = useState<WordWithTags[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frontLanguage, setFrontLanguage] = useState<DictionaryLanguage>(() =>
    loadDictionaryLanguage(),
  );
  const [flippedWordIds, setFlippedWordIds] = useState<Set<number>>(() => new Set());
  const [collapsedTags, setCollapsedTags] = useState<Record<string, boolean>>(() => ({}));
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());

  useEffect(() => {
    saveDictionaryLanguage(frontLanguage);
  }, [frontLanguage]);

  useEffect(() => {
    saveViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const fetched = (await fetchWordsWithTags(false)) as WordWithTags[];
        if (isMounted) {
          setWords(fetched);
          const initialCollapsed: Record<string, boolean> = {};
          const tagSet = new Set<string>();
          fetched.forEach((word) => {
            if (word.tags.length === 0) {
              tagSet.add("Sans tag");
            } else {
              word.tags.forEach((tag) => tagSet.add(tag.name));
            }
          });
          Array.from(tagSet).forEach((tag) => {
            initialCollapsed[tag] = false;
          });
          setCollapsedTags(initialCollapsed);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Impossible de charger le dictionnaire.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const otherLanguages = useMemo(() => getOtherLanguages(frontLanguage), [frontLanguage]);

  const allWordIds = useMemo(() => new Set(words.map((word) => word.id)), [words]);
  const allFlipped = useMemo(
    () => allWordIds.size > 0 && Array.from(allWordIds).every((id) => flippedWordIds.has(id)),
    [allWordIds, flippedWordIds],
  );

  const wordsByTag = useMemo(() => {
    const grouped = new Map<string, WordWithTags[]>();
    words.forEach((word) => {
      if (word.tags.length === 0) {
        const existing = grouped.get("Sans tag") ?? [];
        existing.push(word);
        grouped.set("Sans tag", existing);
      } else {
        word.tags.forEach((tag) => {
          const existing = grouped.get(tag.name) ?? [];
          existing.push(word);
          grouped.set(tag.name, existing);
        });
      }
    });
    const sortedTags = Array.from(grouped.keys()).sort((a, b) => {
      if (a === "Sans tag") return 1;
      if (b === "Sans tag") return -1;
      return a.localeCompare(b);
    });
    return sortedTags.map((tag) => ({ tag, words: grouped.get(tag) ?? [] }));
  }, [words]);

  function toggleTag(tag: string) {
    setCollapsedTags((prev) => ({
      ...prev,
      [tag]: !(prev[tag] ?? false),
    }));
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Dictionnaire</h1>
          <p className="pageSubtitle">
            {viewMode === "cards"
              ? "Toutes tes cartes, en grille. Clique pour retourner."
              : "Tous tes mots en liste. Clique pour voir les détails."}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--space-5)",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div className="field field--inline">
            <div className="field__label">Langue</div>
            <fieldset className="segmented">
              <legend className="srOnly">Langue du dictionnaire</legend>
              {(Object.keys(dictionaryLanguageLabels) as DictionaryLanguage[]).map((language) => {
                const isSelected = language === frontLanguage;
                return (
                  <button
                    key={language}
                    type="button"
                    className={`segmented__button ${isSelected ? "segmented__button--active" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => setFrontLanguage(language)}
                  >
                    {dictionaryLanguageLabels[language]}
                  </button>
                );
              })}
            </fieldset>
          </div>

          <div className="field field--inline">
            <div className="field__label">Vue</div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                border: "2px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "4px",
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                style={{
                  padding: "8px 14px",
                  borderRadius: "calc(var(--radius-md) - 2px)",
                  border: "none",
                  background: viewMode === "cards" ? "var(--color-primary)" : "transparent",
                  color: viewMode === "cards" ? "#ffffff" : "var(--color-text-soft)",
                  cursor: "pointer",
                  fontWeight: viewMode === "cards" ? 700 : 600,
                  fontSize: "16px",
                  transition: "all 0.2s ease",
                }}
                aria-label="Vue en cartes"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: "block" }}
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M5 3m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                style={{
                  padding: "8px 14px",
                  borderRadius: "calc(var(--radius-md) - 2px)",
                  border: "none",
                  background: viewMode === "list" ? "var(--color-primary)" : "transparent",
                  color: viewMode === "list" ? "#ffffff" : "var(--color-text-soft)",
                  cursor: "pointer",
                  fontWeight: viewMode === "list" ? 700 : 600,
                  fontSize: "16px",
                  transition: "all 0.2s ease",
                }}
                aria-label="Vue en liste"
              >
                ☰
              </button>
            </div>
          </div>

          {viewMode === "cards" && words.length > 0 && (
            <div className="field field--inline">
              <button
                className="button"
                type="button"
                onClick={() => {
                  if (allFlipped) {
                    setFlippedWordIds(new Set());
                  } else {
                    setFlippedWordIds(allWordIds);
                  }
                }}
                style={{ whiteSpace: "nowrap" }}
              >
                {allFlipped ? "Masquer toutes les cartes" : "Afficher toutes les cartes"}
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? <div className="muted">Chargement…</div> : null}
      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      <div style={{ marginTop: "var(--space-8)" }}>
        {wordsByTag.map(({ tag, words: tagWords }) => {
          const isCollapsed = collapsedTags[tag] ?? false;
          return (
            <div key={tag} style={{ marginBottom: "var(--space-10)" }}>
              <button className="sectionHeader" type="button" onClick={() => toggleTag(tag)}>
                <span className="sectionHeader__chevron">{isCollapsed ? "▸" : "▾"}</span>
                <span className="sectionHeader__title">{tag}</span>
                <span className="sectionHeader__meta muted">{tagWords.length} mot(s)</span>
              </button>
              {!isCollapsed && (
                <>
                  {viewMode === "cards" ? (
                    <div className="dictionaryGrid" style={{ marginTop: "var(--space-4)" }}>
                      {tagWords.map((word) => {
                        const isFlipped = flippedWordIds.has(word.id);
                        const frontValue = getWordField(word, frontLanguage).trim();
                        const safeFrontValue = frontValue || "—";
                        const tagsText = word.tags.map((t) => t.name).join(" · ");

                        return (
                          <button
                            key={word.id}
                            type="button"
                            className="dictionaryCard"
                            onClick={() => {
                              setFlippedWordIds((previous) => {
                                const next = new Set(previous);
                                if (next.has(word.id)) {
                                  next.delete(word.id);
                                } else {
                                  next.add(word.id);
                                }
                                return next;
                              });
                            }}
                          >
                            <div
                              className={`dictionaryCard__inner ${isFlipped ? "dictionaryCard__inner--flipped" : ""}`}
                            >
                              <div className="dictionaryCard__face dictionaryCard__face--front">
                                <div className="dictionaryCard__lang">
                                  {dictionaryLanguageLabels[frontLanguage]}
                                </div>
                                <div
                                  className="dictionaryCard__main"
                                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                                >
                                  {safeFrontValue}
                                  {frontLanguage === "kana" && (
                                    <span onClick={(e) => e.stopPropagation()}>
                                      <AudioButton text={safeFrontValue} size="small" />
                                    </span>
                                  )}
                                </div>
                                <div className="dictionaryCard__meta">{tagsText || "Sans tag"}</div>
                              </div>

                              <div className="dictionaryCard__face dictionaryCard__face--back">
                                <div className="dictionaryCard__backGrid">
                                  {otherLanguages.map((language) => {
                                    const value = getWordField(word, language).trim() || "—";
                                    return (
                                      <div key={language} className="dictionaryCard__row">
                                        <div className="dictionaryCard__rowLabel">
                                          {dictionaryLanguageLabels[language]}
                                        </div>
                                        <div
                                          className="dictionaryCard__rowValue"
                                          style={{ display: "flex", alignItems: "center", gap: "4px" }}
                                        >
                                          {value}
                                          {language === "kana" && (
                                            <span onClick={(e) => e.stopPropagation()}>
                                              <AudioButton text={value} size="small" />
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {word.note ? (
                                  <div className="dictionaryCard__note">{word.note}</div>
                                ) : null}
                                <div className="dictionaryCard__meta">{tagsText || "Sans tag"}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{dictionaryLanguageLabels[frontLanguage]}</th>
                          {otherLanguages.map((lang) => (
                            <th key={lang}>{dictionaryLanguageLabels[lang]}</th>
                          ))}
                          <th>Tags</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tagWords.map((word) => {
                          const frontValue = getWordField(word, frontLanguage).trim();
                          const safeFrontValue = frontValue || "—";
                          const tagsText = word.tags.map((t) => t.name).join(", ");

                          return (
                            <React.Fragment key={word.id}>
                              <tr>
                                <td style={{ fontWeight: 600, fontSize: "18px" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    {safeFrontValue}
                                    {frontLanguage === "kana" && (
                                      <span onClick={(e) => e.stopPropagation()}>
                                        <AudioButton text={safeFrontValue} size="small" />
                                      </span>
                                    )}
                                  </span>
                                </td>
                                {otherLanguages.map((lang) => {
                                  const value = getWordField(word, lang).trim() || "—";
                                  return (
                                    <td key={lang} className="muted" style={{ fontSize: "16px" }}>
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                        {value}
                                        {lang === "kana" && (
                                          <span onClick={(e) => e.stopPropagation()}>
                                            <AudioButton text={value} size="small" />
                                          </span>
                                        )}
                                      </span>
                                    </td>
                                  );
                                })}
                                <td className="muted">
                                  {tagsText ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "var(--space-2)",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {word.tags.map((tag) => (
                                        <span
                                          key={tag.id}
                                          style={{
                                            padding: "4px 10px",
                                            borderRadius: "var(--radius-md)",
                                            background: "rgba(199, 62, 29, 0.08)",
                                            color: "var(--color-primary)",
                                            fontSize: "13px",
                                            fontWeight: 600,
                                          }}
                                        >
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="muted" style={{ fontSize: "14px" }}>
                                  {word.note || "—"}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
