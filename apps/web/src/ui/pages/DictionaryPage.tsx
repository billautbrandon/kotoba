import React, { useEffect, useMemo, useState } from "react";

import type { WordWithTags } from "../../api";
import { downloadTagAudio, fetchWordsWithTags } from "../../api";
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

function renderWithFurigana(kanji: string, kana: string | null | undefined): React.ReactNode {
  if (!kana || !kanji || kanji === kana) return kanji;
  return (
    <ruby>
      {kanji}
      <rp>(</rp>
      <rt>{kana}</rt>
      <rp>)</rp>
    </ruby>
  );
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
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingTagId, setDownloadingTagId] = useState<number | null>(null);
  const [showFurigana, setShowFurigana] = useState(false);
  const [expandedWord, setExpandedWord] = useState<WordWithTags | null>(null);

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
            initialCollapsed[tag] = true;
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

  const filteredWords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return words;
    return words.filter((word) => {
      const fields = [word.french, word.romaji, word.kana, word.kanji, word.note];
      return fields.some((field) => field?.toLowerCase().includes(query));
    });
  }, [words, searchQuery]);

  const isSearchActive = searchQuery.trim().length > 0;

  const allWordIds = useMemo(() => new Set(filteredWords.map((word) => word.id)), [filteredWords]);
  const allFlipped = useMemo(
    () => allWordIds.size > 0 && Array.from(allWordIds).every((id) => flippedWordIds.has(id)),
    [allWordIds, flippedWordIds],
  );

  const wordsByTag = useMemo(() => {
    const grouped = new Map<string, { tagId: number | null; words: WordWithTags[] }>();
    filteredWords.forEach((word) => {
      if (word.tags.length === 0) {
        const existing = grouped.get("Sans tag") ?? { tagId: null, words: [] };
        existing.words.push(word);
        grouped.set("Sans tag", existing);
      } else {
        word.tags.forEach((tag) => {
          const existing = grouped.get(tag.name) ?? { tagId: tag.id, words: [] };
          existing.words.push(word);
          grouped.set(tag.name, existing);
        });
      }
    });
    const sortedTags = Array.from(grouped.keys()).sort((a, b) => {
      if (a === "Sans tag") return 1;
      if (b === "Sans tag") return -1;
      return a.localeCompare(b);
    });
    return sortedTags.map((tagName) => {
      const group = grouped.get(tagName);
      return { tag: tagName, tagId: group?.tagId ?? null, words: group?.words ?? [] };
    });
  }, [filteredWords]);

  function toggleTag(tag: string) {
    setCollapsedTags((prev) => ({
      ...prev,
      [tag]: !(prev[tag] ?? false),
    }));
  }

  async function handleDownloadAudio(tagId: number, tagName: string) {
    setDownloadingTagId(tagId);
    try {
      await downloadTagAudio(tagId, tagName);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur lors du téléchargement audio",
      );
    } finally {
      setDownloadingTagId(null);
    }
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
                background: "var(--color-panel)",
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

          {words.length > 0 && (
            <div className="field field--inline">
              <button
                className={`button ${showFurigana ? "button--primary" : ""}`}
                type="button"
                onClick={() => setShowFurigana((previous) => !previous)}
                style={{ whiteSpace: "nowrap" }}
              >
                {showFurigana ? "Masquer furigana" : "Furigana"}
              </button>
            </div>
          )}

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

      {!isLoading && words.length > 0 && (
        <div className="dictionarySearch">
          <svg
            className="dictionarySearch__icon"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Rechercher"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="dictionarySearch__input"
            type="text"
            placeholder="Rechercher un mot (français, kana, kanji, romaji, note)…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="dictionarySearch__clear"
              onClick={() => setSearchQuery("")}
              aria-label="Effacer la recherche"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="Effacer"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          {isSearchActive && (
            <span className="dictionarySearch__count">
              {filteredWords.length} résultat{filteredWords.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {isLoading ? <div className="muted">Chargement…</div> : null}
      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      <div style={{ marginTop: "var(--space-8)" }}>
        {wordsByTag.map(({ tag, tagId, words: tagWords }) => {
          const isCollapsed = isSearchActive ? false : (collapsedTags[tag] ?? false);
          return (
            <div key={tag} style={{ marginBottom: "var(--space-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <button
                  className="sectionHeader"
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{ flex: 1 }}
                >
                  <span className="sectionHeader__chevron">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="sectionHeader__title">{tag}</span>
                  <span className="sectionHeader__meta muted">{tagWords.length} mot(s)</span>
                </button>
                {tagId !== null && (
                  <button
                    type="button"
                    title={`Télécharger MP3 — ${tag}`}
                    disabled={downloadingTagId !== null}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDownloadAudio(tagId, tag);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "transparent",
                      border: "none",
                      cursor: downloadingTagId !== null ? "wait" : "pointer",
                      opacity: downloadingTagId === tagId ? 0.5 : 0.7,
                      padding: "6px",
                      borderRadius: "var(--radius-md)",
                      transition: "opacity 0.2s ease",
                      color: "var(--color-text-soft)",
                    }}
                  >
                    {downloadingTagId === tagId ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        role="img"
                        aria-label="Chargement"
                      >
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        role="img"
                        aria-label="Télécharger MP3"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {!isCollapsed &&
                (viewMode === "cards" ? (
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
                          className={`dictionaryCard ${isFlipped ? "dictionaryCard--flipped" : ""}`}
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
                          <div className="dictionaryCard__inner">
                            <div className="dictionaryCard__face">
                              <span
                                className="dictionaryCard__expand"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedWord(word);
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                                title="Voir en grand"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  role="img"
                                  aria-label="Agrandir"
                                >
                                  <polyline points="15 3 21 3 21 9" />
                                  <polyline points="9 21 3 21 3 15" />
                                  <line x1="21" y1="3" x2="14" y2="10" />
                                  <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                              </span>
                              <div className="dictionaryCard__lang">
                                {dictionaryLanguageLabels[frontLanguage]}
                              </div>
                              <div
                                className="dictionaryCard__main"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                }}
                              >
                                {showFurigana && frontLanguage === "kanji"
                                  ? renderWithFurigana(safeFrontValue, word.kana)
                                  : safeFrontValue}
                                {word.kana && (
                                  <span
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                    <AudioButton text={word.kana} size="small" />
                                  </span>
                                )}
                              </div>
                              <div className="dictionaryCard__meta">{tagsText || "Sans tag"}</div>
                            </div>
                            <div className="dictionaryCard__face dictionaryCard__face--back">
                              <span
                                className="dictionaryCard__expand"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedWord(word);
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                                title="Voir en grand"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  role="img"
                                  aria-label="Agrandir"
                                >
                                  <polyline points="15 3 21 3 21 9" />
                                  <polyline points="9 21 3 21 3 15" />
                                  <line x1="21" y1="3" x2="14" y2="10" />
                                  <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                              </span>
                              <div className="dictionaryCard__backGrid">
                                {otherLanguages.map((language) => {
                                  const value = getWordField(word, language).trim() || "—";
                                  const displayValue =
                                    showFurigana && language === "kanji"
                                      ? renderWithFurigana(value, word.kana)
                                      : value;
                                  return (
                                    <div key={language} className="dictionaryCard__row">
                                      <div className="dictionaryCard__rowLabel">
                                        {dictionaryLanguageLabels[language]}
                                      </div>
                                      <div
                                        className="dictionaryCard__rowValue"
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "4px",
                                        }}
                                      >
                                        {displayValue}
                                        {language === "kana" && (
                                          <span
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => e.stopPropagation()}
                                          >
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
                            <tr
                              style={{ cursor: "pointer" }}
                              onClick={() => setExpandedWord(word)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") setExpandedWord(word);
                              }}
                            >
                              <td style={{ fontWeight: 600, fontSize: "18px" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  {showFurigana && frontLanguage === "kanji"
                                    ? renderWithFurigana(safeFrontValue, word.kana)
                                    : safeFrontValue}
                                  {word.kana && (
                                    <span
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      <AudioButton text={word.kana} size="small" />
                                    </span>
                                  )}
                                </span>
                              </td>
                              {otherLanguages.map((lang) => {
                                const value = getWordField(word, lang).trim() || "—";
                                const tableDisplayValue =
                                  showFurigana && lang === "kanji"
                                    ? renderWithFurigana(value, word.kana)
                                    : value;
                                return (
                                  <td key={lang} className="muted" style={{ fontSize: "16px" }}>
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      {tableDisplayValue}
                                      {lang === "kana" && (
                                        <span
                                          onClick={(e) => e.stopPropagation()}
                                          onKeyDown={(e) => e.stopPropagation()}
                                        >
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
                                          background: "var(--color-primary-soft)",
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
                ))}
            </div>
          );
        })}
      </div>

      {expandedWord && (
        <WordDetailModal
          word={expandedWord}
          onClose={() => setExpandedWord(null)}
          renderWithFurigana={renderWithFurigana}
        />
      )}
    </div>
  );
}

function WordDetailModal({
  word,
  onClose,
  renderWithFurigana,
}: {
  word: WordWithTags;
  onClose: () => void;
  renderWithFurigana: (kanji: string, kana: string | null) => React.ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const kanjiValue = word.kanji ?? "";
  const kanaValue = word.kana ?? "";
  const romajiValue = word.romaji ?? "";
  const frenchValue = word.french;
  const tagsText = word.tags.map((tag) => tag.name).join(" · ");

  return (
    <div
      className="wordDetailOverlay"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="wordDetailModal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="wordDetailModal__close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>

        {kanjiValue && (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Kanji</div>
            <div className="wordDetailModal__kanji">
              {renderWithFurigana(kanjiValue, kanaValue)}
            </div>
          </div>
        )}

        {kanaValue && (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Kana</div>
            <div className="wordDetailModal__kana">
              {kanaValue}
              <AudioButton text={kanaValue} />
            </div>
          </div>
        )}

        {romajiValue && (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Rōmaji</div>
            <div className="wordDetailModal__romaji">{romajiValue}</div>
          </div>
        )}

        <div className="wordDetailModal__section">
          <div className="wordDetailModal__label">Français</div>
          <div className="wordDetailModal__french">{frenchValue}</div>
        </div>

        {word.note && (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Note</div>
            <div className="wordDetailModal__note">{word.note}</div>
          </div>
        )}

        {tagsText && (
          <div className="wordDetailModal__tags">
            {word.tags.map((tag) => (
              <span key={tag.id} className="wordDetailModal__tag">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
