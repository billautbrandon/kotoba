import React, { useEffect, useMemo, useState } from "react";

import type { WordWithTags } from "../../api";
import { fetchWordsWithTags } from "../../api";

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

export function DictionaryPage() {
  const [words, setWords] = useState<WordWithTags[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frontLanguage, setFrontLanguage] = useState<DictionaryLanguage>(() => loadDictionaryLanguage());
  const [flippedWordIds, setFlippedWordIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    saveDictionaryLanguage(frontLanguage);
  }, [frontLanguage]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const fetched = (await fetchWordsWithTags(false)) as WordWithTags[];
        if (!isMounted) return;
        setWords(fetched);
      } catch {
        if (!isMounted) return;
        setErrorMessage("Impossible de charger le dictionnaire.");
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const otherLanguages = useMemo(() => getOtherLanguages(frontLanguage), [frontLanguage]);

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Dictionnaire</h1>
          <p className="pageSubtitle">Toutes tes cartes, en grille. Clique pour retourner.</p>
        </div>

        <label className="field field--inline">
          <div className="field__label">Langue</div>
          <select
            className="select"
            value={frontLanguage}
            onChange={(event) => setFrontLanguage(event.target.value as DictionaryLanguage)}
          >
            {Object.entries(dictionaryLanguageLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? <div className="muted">Chargement…</div> : null}
      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      <div className="dictionaryGrid">
        {words.map((word) => {
          const isFlipped = flippedWordIds.has(word.id);
          const frontValue = getWordField(word, frontLanguage).trim();
          const safeFrontValue = frontValue || "—";
          const tagsText = word.tags.map((tag) => tag.name).join(" · ");

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
              <div className={`dictionaryCard__inner ${isFlipped ? "dictionaryCard__inner--flipped" : ""}`}>
                <div className="dictionaryCard__face dictionaryCard__face--front">
                  <div className="dictionaryCard__lang">{dictionaryLanguageLabels[frontLanguage]}</div>
                  <div className="dictionaryCard__main">{safeFrontValue}</div>
                  <div className="dictionaryCard__meta">{tagsText || "Sans tag"}</div>
                </div>

                <div className="dictionaryCard__face dictionaryCard__face--back">
                  <div className="dictionaryCard__backGrid">
                    {otherLanguages.map((language) => {
                      const value = getWordField(word, language).trim() || "—";
                      return (
                        <div key={language} className="dictionaryCard__row">
                          <div className="dictionaryCard__rowLabel">{dictionaryLanguageLabels[language]}</div>
                          <div className="dictionaryCard__rowValue">{value}</div>
                        </div>
                      );
                    })}
                  </div>
                  {word.note ? <div className="dictionaryCard__note">{word.note}</div> : null}
                  <div className="dictionaryCard__meta">{tagsText || "Sans tag"}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


