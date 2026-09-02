import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Tag, WordWithStatsAndTags, WordWithTags } from "../../api";
import {
  createTag,
  deleteTag,
  downloadTagAudio,
  fetchTags,
  fetchWordsWithTags,
  resetTagWordScores,
} from "../../api";
import { scrollAppToTop } from "../../utils/scroll";
import { AudioButton } from "../components/AudioButton";
import { EyeIcon, LayersIcon, PlayIcon } from "../components/NavIcons";
import { WordFormModal } from "../components/WordFormModal";

type DictionaryLanguage = "fr" | "romaji" | "kana" | "kanji";
type ViewMode = "cards" | "list";
type SeriesSort = "recent" | "alpha";

type VocabSeries = {
  key: string;
  tagId: number | null;
  tagName: string;
  wordsCount: number;
  reviewedCount: number;
  masteredCount: number;
  lastReviewedAt: string | null;
  words: WordWithStatsAndTags[];
};

const MASTERY_STREAK = 10;

const dictionaryLanguageLabels: Record<DictionaryLanguage, string> = {
  fr: "FR",
  romaji: "Rōmaji",
  kana: "Kana",
  kanji: "Kanji",
};

const UNTAGGED_KEY = "sans-serie";

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

function loadViewMode(): ViewMode {
  const value = window.localStorage.getItem("kotoba.dictionary.viewMode");
  if (value === "cards" || value === "list") return value;
  return "cards";
}

function saveViewMode(mode: ViewMode) {
  window.localStorage.setItem("kotoba.dictionary.viewMode", mode);
}

function loadSeriesSort(): SeriesSort {
  const value = window.localStorage.getItem("kotoba.dictionary.seriesSort");
  if (value === "recent" || value === "alpha") return value;
  return "recent";
}

function saveSeriesSort(sort: SeriesSort) {
  window.localStorage.setItem("kotoba.dictionary.seriesSort", sort);
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

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function wordMatchesQuery(word: WordWithTags, query: string): boolean {
  const fields = [word.french, word.romaji, word.kana, word.kanji, word.note];
  return fields.some((field) => field?.toLowerCase().includes(query));
}

function isMasteredWord(word: WordWithStatsAndTags): boolean {
  return (word.consecutive_success_count ?? 0) >= MASTERY_STREAK;
}

function laterDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function emptySeries(key: string, tagId: number | null, tagName: string): VocabSeries {
  return {
    key,
    tagId,
    tagName,
    wordsCount: 0,
    reviewedCount: 0,
    masteredCount: 0,
    lastReviewedAt: null,
    words: [],
  };
}

function addWordToSeries(series: VocabSeries, word: WordWithStatsAndTags): VocabSeries {
  series.words.push(word);
  series.wordsCount = series.words.length;
  if (word.last_reviewed_at) series.reviewedCount += 1;
  if (isMasteredWord(word)) series.masteredCount += 1;
  series.lastReviewedAt = laterDate(series.lastReviewedAt, word.last_reviewed_at);
  return series;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

export function DictionaryPage() {
  const navigate = useNavigate();
  const [words, setWords] = useState<WordWithStatsAndTags[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frontLanguage, setFrontLanguage] = useState<DictionaryLanguage>(() =>
    loadDictionaryLanguage(),
  );
  const [flippedWordIds, setFlippedWordIds] = useState<Set<number>>(() => new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [seriesSort, setSeriesSort] = useState<SeriesSort>(() => loadSeriesSort());
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingTagId, setDownloadingTagId] = useState<number | null>(null);
  const [showFurigana, setShowFurigana] = useState(false);
  const [expandedWord, setExpandedWord] = useState<WordWithTags | null>(null);
  const [openSeriesKey, setOpenSeriesKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResettingScores, setIsResettingScores] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  useEffect(() => {
    saveDictionaryLanguage(frontLanguage);
  }, [frontLanguage]);

  useEffect(() => {
    saveViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    saveSeriesSort(seriesSort);
  }, [seriesSort]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset flips when navigating between series
  useEffect(() => {
    setFlippedWordIds(new Set());
    setIsResetConfirmOpen(false);
    setResetStatus(null);
    scrollAppToTop();
  }, [openSeriesKey]);

  async function reloadVocabulary() {
    const [fetchedWords, fetchedTags] = await Promise.all([
      fetchWordsWithTags(true) as Promise<WordWithStatsAndTags[]>,
      fetchTags(),
    ]);
    setWords(fetchedWords);
    setTags(fetchedTags);
  }

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [fetchedWords, fetchedTags] = await Promise.all([
          fetchWordsWithTags(true) as Promise<WordWithStatsAndTags[]>,
          fetchTags(),
        ]);
        if (isMounted) {
          setWords(fetchedWords);
          setTags(fetchedTags);
        }
      } catch {
        if (isMounted) setErrorMessage("Impossible de charger le vocabulaire.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const seriesList = useMemo(() => {
    const grouped = new Map<string, VocabSeries>();

    for (const word of words) {
      if (word.tags.length === 0) {
        const existing = grouped.get(UNTAGGED_KEY) ?? emptySeries(UNTAGGED_KEY, null, "Sans série");
        grouped.set(UNTAGGED_KEY, addWordToSeries(existing, word));
        continue;
      }
      for (const tag of word.tags) {
        const key = String(tag.id);
        const existing = grouped.get(key) ?? emptySeries(key, tag.id, tag.name);
        grouped.set(key, addWordToSeries(existing, word));
      }
    }

    return Array.from(grouped.values());
  }, [words]);

  const query = searchQuery.trim().toLowerCase();
  const lastAutoOpenedQuery = useRef("");

  useEffect(() => {
    if (!query) {
      lastAutoOpenedQuery.current = "";
      return;
    }
    if (query.length < 2) return;
    if (lastAutoOpenedQuery.current === query) return;
    const seriesNameHits = seriesList.filter((series) =>
      series.tagName.toLowerCase().includes(query),
    );
    const seriesWithWord = seriesList.filter((series) =>
      series.words.some((word) => wordMatchesQuery(word, query)),
    );
    if (seriesNameHits.length > 0 && seriesWithWord.length === 0) return;
    if (seriesWithWord.length >= 1) {
      lastAutoOpenedQuery.current = query;
      setOpenSeriesKey(seriesWithWord[0].key);
    }
  }, [query, seriesList]);
  const visibleSeries = useMemo(() => {
    const filtered = !query
      ? seriesList
      : seriesList
          .map((series) => {
            const nameMatches = series.tagName.toLowerCase().includes(query);
            const matchingWords = series.words.filter((word) => wordMatchesQuery(word, query));
            if (!nameMatches && matchingWords.length === 0) return null;
            if (nameMatches) return series;
            return {
              ...series,
              words: matchingWords,
              wordsCount: matchingWords.length,
              reviewedCount: matchingWords.filter((word) => Boolean(word.last_reviewed_at)).length,
              masteredCount: matchingWords.filter((word) => isMasteredWord(word)).length,
            };
          })
          .filter((series): series is VocabSeries => series !== null);

    return [...filtered].sort((left, right) => {
      if (left.key === UNTAGGED_KEY) return 1;
      if (right.key === UNTAGGED_KEY) return -1;
      if (seriesSort === "alpha") {
        return left.tagName.localeCompare(right.tagName, "fr");
      }
      const leftTime = left.lastReviewedAt ? new Date(left.lastReviewedAt).getTime() : 0;
      const rightTime = right.lastReviewedAt ? new Date(right.lastReviewedAt).getTime() : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.tagName.localeCompare(right.tagName, "fr");
    });
  }, [query, seriesList, seriesSort]);

  const openSeries = seriesList.find((series) => series.key === openSeriesKey) ?? null;
  const openSeriesWords = useMemo(() => {
    if (!openSeries) return [];
    if (!query) return openSeries.words;
    if (openSeries.tagName.toLowerCase().includes(query)) return openSeries.words;
    return openSeries.words.filter((word) => wordMatchesQuery(word, query));
  }, [openSeries, query]);

  const selectedSeries = visibleSeries.filter(
    (series) => selectedKeys.has(series.key) && series.tagId !== null,
  );
  const selectedWordsCount = selectedSeries.reduce((total, series) => total + series.wordsCount, 0);
  const totalWordsCount = words.length;
  const taggedSeriesCount = seriesList.filter((series) => series.tagId !== null).length;

  useEffect(() => {
    if (isModalOpen || expandedWord) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openSeries) {
        setOpenSeriesKey(null);
        return;
      }
      if (isSelecting) exitSelectMode();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openSeries, isModalOpen, expandedWord, isSelecting]);

  function toggleSelected(key: string) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exitSelectMode() {
    setIsSelecting(false);
    setSelectedKeys(new Set());
  }

  function toggleSelectMode() {
    if (isSelecting) {
      exitSelectMode();
      return;
    }
    setIsSelecting(true);
  }

  function startSeries(series: VocabSeries) {
    if (!series.tagId) return;
    navigate(`/train/tag/${series.tagId}?name=${encodeURIComponent(series.tagName)}`);
  }

  function handleSeriesCardClick(series: VocabSeries) {
    if (isSelecting) {
      if (series.tagId === null) return;
      toggleSelected(series.key);
      return;
    }
    if (series.tagId) {
      startSeries(series);
      return;
    }
    setOpenSeriesKey(series.key);
  }

  function startSelectedSeries() {
    if (selectedSeries.length === 0) return;
    const ids = selectedSeries.map((series) => series.tagId).join(",");
    const names = selectedSeries.map((series) => series.tagName).join(", ");
    navigate(`/train/tags?ids=${ids}&name=${encodeURIComponent(names)}`);
  }

  async function handleConfirmResetScores() {
    if (!openSeries?.tagId) return;
    setIsResettingScores(true);
    setErrorMessage(null);
    try {
      await resetTagWordScores(openSeries.tagId);
      await reloadVocabulary();
      setResetStatus(`Les scores de « ${openSeries.tagName} » ont été réinitialisés.`);
      setIsResetConfirmOpen(false);
      window.setTimeout(() => setResetStatus(null), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Impossible de réinitialiser les scores.",
      );
    } finally {
      setIsResettingScores(false);
    }
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

  async function handleCreateTag(name: string): Promise<Tag> {
    const createdTag = await createTag(name);
    setTags((previous) => [...previous, createdTag]);
    return createdTag;
  }

  async function handleDeleteTag(tag: Tag): Promise<void> {
    await deleteTag(tag.id);
    await reloadVocabulary();
  }

  function toggleFlipped(wordId: number) {
    setFlippedWordIds((previous) => {
      const next = new Set(previous);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  }

  const otherLanguages = getOtherLanguages(frontLanguage);

  return (
    <div
      className={`vocabPage${openSeries ? " vocabPage--detail" : ""}${
        isSelecting && !openSeries ? " vocabPage--selecting" : ""
      }`}
    >
      <div className="pageHeader">
        <div>
          {openSeries ? (
            <button
              className="vocabPage__back"
              type="button"
              onClick={() => setOpenSeriesKey(null)}
            >
              ← Toutes les séries
            </button>
          ) : null}
          <h1 className="pageTitle">{openSeries ? openSeries.tagName : "Vocabulaire"}</h1>
          <p className="pageSubtitle">
            {openSeries
              ? `${pluralize(openSeries.wordsCount, "mot", "mots")}${
                  openSeries.lastReviewedAt
                    ? ` · révisée ${formatRelativeDate(openSeries.lastReviewedAt).toLowerCase()}`
                    : " · pas encore révisée"
                }`
              : isLoading
                ? "Tes collections de mots."
                : `${pluralize(taggedSeriesCount, "série", "séries")} · ${pluralize(totalWordsCount, "mot", "mots")}`}
          </p>
        </div>
        <div className="vocabPage__headerActions">
          {openSeries?.tagId ? (
            <>
              <button
                className="button button--primary vocabPage__reviewBtn"
                type="button"
                onClick={() => startSeries(openSeries)}
              >
                <PlayIcon className="vocabPage__playIcon" />
                Réviser
              </button>
              <button
                className="button"
                type="button"
                disabled={downloadingTagId !== null}
                onClick={() => handleDownloadAudio(openSeries.tagId as number, openSeries.tagName)}
              >
                {downloadingTagId === openSeries.tagId ? "Audio…" : "Audio MP3"}
              </button>
              <button
                className="button vocabPage__resetButton"
                type="button"
                disabled={isResettingScores}
                onClick={() => setIsResetConfirmOpen(true)}
              >
                Réinitialiser les scores
              </button>
            </>
          ) : null}
          <button
            className={`button${openSeries ? "" : " button--primary"}`}
            type="button"
            onClick={() => setIsModalOpen(true)}
          >
            + Ajouter un mot
          </button>
        </div>
      </div>

      <div className="vocabToolbar">
        <div className="dictionarySearch vocabToolbar__search">
          <svg
            className="dictionarySearch__icon"
            width="18"
            height="18"
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
            type="text"
            placeholder={
              openSeries ? "Filtrer les mots de cette série…" : "Rechercher une série ou un mot…"
            }
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery ? (
            <button
              className="dictionarySearch__clear"
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setSearchQuery("")}
            >
              ×
            </button>
          ) : null}
          {query ? (
            <span className="dictionarySearch__count">
              {openSeries
                ? pluralize(openSeriesWords.length, "mot", "mots")
                : pluralize(visibleSeries.length, "série", "séries")}
            </span>
          ) : null}
        </div>
        {openSeries ? (
          <div className="vocabToolbar__side vocabPage__filters">
            <fieldset className="segmented" aria-label="Langue de face">
              {(Object.keys(dictionaryLanguageLabels) as DictionaryLanguage[]).map((language) => (
                <button
                  key={language}
                  type="button"
                  className={`segmented__button ${frontLanguage === language ? "segmented__button--active" : ""}`}
                  onClick={() => setFrontLanguage(language)}
                >
                  {dictionaryLanguageLabels[language]}
                </button>
              ))}
            </fieldset>
            <button
              className={`button ${showFurigana ? "button--primary" : ""}`}
              type="button"
              onClick={() => setShowFurigana((previous) => !previous)}
            >
              Furigana
            </button>
            <fieldset className="segmented" aria-label="Affichage">
              <button
                type="button"
                className={`segmented__button ${viewMode === "cards" ? "segmented__button--active" : ""}`}
                onClick={() => setViewMode("cards")}
              >
                Cartes
              </button>
              <button
                type="button"
                className={`segmented__button ${viewMode === "list" ? "segmented__button--active" : ""}`}
                onClick={() => setViewMode("list")}
              >
                Liste
              </button>
            </fieldset>
          </div>
        ) : (
          <div className="vocabToolbar__side">
            <fieldset className="segmented" aria-label="Tri des séries">
              <button
                type="button"
                className={`segmented__button ${seriesSort === "recent" ? "segmented__button--active" : ""}`}
                onClick={() => setSeriesSort("recent")}
              >
                Récentes
              </button>
              <button
                type="button"
                className={`segmented__button ${seriesSort === "alpha" ? "segmented__button--active" : ""}`}
                onClick={() => setSeriesSort("alpha")}
              >
                A–Z
              </button>
            </fieldset>
            <button
              className={`button vocabToolbar__multi${isSelecting ? " button--primary" : ""}`}
              type="button"
              aria-pressed={isSelecting}
              onClick={toggleSelectMode}
            >
              <LayersIcon className="vocabToolbar__multiIcon" />
              Plusieurs séries
            </button>
          </div>
        )}
      </div>

      {errorMessage ? <div className="formError">{errorMessage}</div> : null}
      {resetStatus ? <div className="formSuccess">{resetStatus}</div> : null}

      {openSeries?.tagId && isResetConfirmOpen ? (
        <div className="vocabPage__confirm" role="alertdialog" aria-labelledby="series-reset-title">
          <div>
            <p className="vocabPage__confirmTitle" id="series-reset-title">
              Réinitialiser les scores de « {openSeries.tagName} » ?
            </p>
            <p className="vocabPage__confirmText">
              Les compteurs, le score et le planning SRS de cette série seront remis à zéro. Les
              mots aussi présents dans d’autres séries seront également réinitialisés. Cette action
              est irréversible.
            </p>
          </div>
          <div className="vocabPage__confirmActions">
            <button
              className="button"
              type="button"
              disabled={isResettingScores}
              onClick={() => setIsResetConfirmOpen(false)}
            >
              Annuler
            </button>
            <button
              className="button button--danger"
              type="button"
              disabled={isResettingScores}
              onClick={() => void handleConfirmResetScores()}
            >
              {isResettingScores ? "Réinitialisation…" : "Confirmer"}
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="vocabSeriesGrid" aria-hidden="true">
          {[0, 1, 2, 3].map((skeletonIndex) => (
            <div
              key={`skeleton-${skeletonIndex}`}
              className="vocabSeriesCard vocabSeriesCard--skeleton"
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !openSeries ? (
        visibleSeries.length === 0 ? (
          <div className="emptyState emptyState--center vocabPage__empty">
            <p className="emptyState__title">
              {query
                ? `Aucun résultat pour « ${searchQuery.trim()} »`
                : "Aucune série pour l’instant"}
            </p>
            <p className="emptyState__text">
              {query
                ? "Essaie un autre mot, ou le nom d’une série."
                : "Ajoute un mot et donne-lui un tag : ça devient ta première série."}
            </p>
            <div className="emptyState__actions">
              {query ? (
                <button className="button" type="button" onClick={() => setSearchQuery("")}>
                  Effacer la recherche
                </button>
              ) : (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                >
                  + Ajouter un mot
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="vocabSeriesGrid">
            {visibleSeries.map((series) => {
              const isSelected = selectedKeys.has(series.key);
              const isUntagged = series.tagId === null;
              const reviewedPercent =
                series.wordsCount > 0
                  ? Math.round((series.reviewedCount / series.wordsCount) * 100)
                  : 0;
              const reviewedLabel = series.lastReviewedAt
                ? `révisée ${formatRelativeDate(series.lastReviewedAt).toLowerCase()}`
                : isUntagged
                  ? "sans tag"
                  : "pas encore révisée";
              return (
                <article
                  key={series.key}
                  className={`vocabSeriesCard${isSelected ? " vocabSeriesCard--selected" : ""}${
                    isUntagged ? " vocabSeriesCard--untagged" : ""
                  }${isSelecting && !isUntagged ? " vocabSeriesCard--selectable" : ""}`}
                >
                  <button
                    className="vocabSeriesCard__peek"
                    type="button"
                    aria-label={`Voir le vocabulaire de ${series.tagName}`}
                    onClick={() => setOpenSeriesKey(series.key)}
                  >
                    <EyeIcon className="vocabSeriesCard__peekIcon" />
                  </button>
                  <button
                    className="vocabSeriesCard__open"
                    type="button"
                    onClick={() => handleSeriesCardClick(series)}
                  >
                    <h2 className="vocabSeriesCard__title">{series.tagName}</h2>
                    <p className="vocabSeriesCard__meta">
                      {pluralize(series.wordsCount, "mot", "mots")}
                      <span aria-hidden="true"> · </span>
                      {reviewedLabel}
                    </p>
                    <div
                      className="vocabSeriesCard__bar"
                      aria-label={`${reviewedPercent} % des mots révisés`}
                    >
                      <span
                        className="vocabSeriesCard__barFill"
                        style={{ width: `${reviewedPercent}%` }}
                      />
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {openSeries && !isLoading ? (
        openSeriesWords.length === 0 ? (
          <div className="emptyState emptyState--center vocabPage__empty">
            <p className="emptyState__title">
              {query
                ? `Aucun mot ne correspond à « ${searchQuery.trim()} »`
                : "Cette série est vide"}
            </p>
            <p className="emptyState__text">
              {query
                ? "Efface la recherche pour revoir tous les mots."
                : "Ajoute un mot : il sera déjà tagué dans cette série."}
            </p>
            <div className="emptyState__actions">
              {query ? (
                <button className="button" type="button" onClick={() => setSearchQuery("")}>
                  Effacer la recherche
                </button>
              ) : (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                >
                  + Ajouter un mot
                </button>
              )}
            </div>
          </div>
        ) : viewMode === "cards" ? (
          <div className="dictionaryGrid">
            {openSeriesWords.map((word) => {
              const isFlipped = flippedWordIds.has(word.id);
              const frontValue = getWordField(word, frontLanguage).trim() || "—";
              return (
                <div
                  key={word.id}
                  className={`dictionaryCard ${isFlipped ? "dictionaryCard--flipped" : ""}`}
                >
                  <button
                    type="button"
                    className="dictionaryCard__flip"
                    onClick={() => toggleFlipped(word.id)}
                  >
                    <div className="dictionaryCard__inner">
                      <div className="dictionaryCard__face">
                        <div className="dictionaryCard__lang">
                          {dictionaryLanguageLabels[frontLanguage]}
                        </div>
                        <div className="dictionaryCard__main">
                          {showFurigana && frontLanguage === "kanji"
                            ? renderWithFurigana(frontValue, word.kana)
                            : frontValue}
                        </div>
                        <span className="dictionaryCard__hint">Cliquer pour retourner</span>
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
                                <div className="dictionaryCard__rowValue">
                                  {showFurigana && language === "kanji"
                                    ? renderWithFurigana(value, word.kana)
                                    : value}
                                </div>
                              </div>
                            );
                          })}
                          {word.note ? (
                            <div className="dictionaryCard__note">{word.note}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                  <div className="dictionaryCard__actions">
                    {word.kana ? <AudioButton text={word.kana} size="small" /> : null}
                    <button
                      type="button"
                      className="dictionaryCard__expand"
                      onClick={() => setExpandedWord(word)}
                    >
                      Fiche
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="vocabWordList">
            {openSeriesWords.map((word) => (
              <div key={word.id} className="vocabWordRow">
                <button
                  type="button"
                  className="vocabWordRow__main"
                  onClick={() => setExpandedWord(word)}
                >
                  <span className="vocabWordRow__jp">
                    {showFurigana && word.kanji
                      ? renderWithFurigana(word.kanji, word.kana)
                      : word.kanji || word.kana || "—"}
                  </span>
                  <span className="vocabWordRow__kana">
                    {word.kanji ? word.kana || word.romaji || "" : word.romaji || ""}
                  </span>
                  <span className="vocabWordRow__fr">{word.french}</span>
                </button>
                {word.kana ? (
                  <span className="vocabWordRow__audio">
                    <AudioButton text={word.kana} size="small" />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}

      {!openSeries && isSelecting ? (
        <div className="vocabSelectBar">
          <p className="vocabSelectBar__label">
            {selectedSeries.length === 0
              ? "Clique sur les séries à regrouper"
              : pluralize(selectedSeries.length, "série sélectionnée", "séries sélectionnées")}
            {selectedSeries.length > 0 ? (
              <span className="vocabSelectBar__meta">
                {" "}
                · {pluralize(selectedWordsCount, "mot", "mots")}
              </span>
            ) : null}
          </p>
          <div className="vocabSelectBar__actions">
            <button className="button button--ghost" type="button" onClick={exitSelectMode}>
              Annuler
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={selectedSeries.length === 0}
              onClick={startSelectedSeries}
            >
              Réviser la sélection
            </button>
          </div>
        </div>
      ) : null}

      {expandedWord ? (
        <WordDetailModal
          word={expandedWord}
          onClose={() => setExpandedWord(null)}
          renderWithFurigana={renderWithFurigana}
        />
      ) : null}

      {isModalOpen ? (
        <WordFormModal
          editingWord={null}
          tags={tags}
          defaultTagIds={openSeries?.tagId ? [openSeries.tagId] : undefined}
          onClose={() => setIsModalOpen(false)}
          onSaved={async () => {
            setIsModalOpen(false);
            await reloadVocabulary();
          }}
          onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag}
        />
      ) : null}
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
        {kanjiValue ? (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Kanji</div>
            <div className="wordDetailModal__kanji">
              {renderWithFurigana(kanjiValue, kanaValue)}
            </div>
          </div>
        ) : null}
        {kanaValue ? (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Kana</div>
            <div className="wordDetailModal__kana">
              {kanaValue}
              <AudioButton text={kanaValue} />
            </div>
          </div>
        ) : null}
        {romajiValue ? (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Rōmaji</div>
            <div className="wordDetailModal__romaji">{romajiValue}</div>
          </div>
        ) : null}
        <div className="wordDetailModal__section">
          <div className="wordDetailModal__label">Français</div>
          <div className="wordDetailModal__french">{frenchValue}</div>
        </div>
        {word.note ? (
          <div className="wordDetailModal__section">
            <div className="wordDetailModal__label">Note</div>
            <div className="wordDetailModal__note">{word.note}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
