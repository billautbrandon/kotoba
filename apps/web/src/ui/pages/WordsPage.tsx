import { useEffect, useMemo, useRef, useState } from "react";

import {
  type Tag,
  type WordWithTags,
  createTag,
  deleteTag,
  deleteWord,
  exportBackup,
  fetchTags,
  fetchWordsWithTags,
  resetAllWordScores,
} from "../../api";
import { AudioButton } from "../components/AudioButton";
import { ImportPanel } from "../components/ImportPanel";
import { WordFormModal } from "../components/WordFormModal";

export function WordsPage() {
  const [words, setWords] = useState<WordWithTags[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingWord, setEditingWord] = useState<WordWithTags | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTagFilterId, setActiveTagFilterId] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [jsonImportStatus, setJsonImportStatus] = useState<string | null>(null);
  const importSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [loadedWords, loadedTags] = await Promise.all([
          fetchWordsWithTags(false) as Promise<WordWithTags[]>,
          fetchTags(),
        ]);
        if (!isCancelled) {
          setWords(loadedWords);
          setTags(loadedTags);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
          setWords([]);
          setTags([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  const wordsCount = useMemo(() => words?.length ?? 0, [words]);

  async function refreshWordsAndTags() {
    const [loadedWords, loadedTags] = await Promise.all([
      fetchWordsWithTags(false) as Promise<WordWithTags[]>,
      fetchTags(),
    ]);
    setWords(loadedWords);
    setTags(loadedTags);
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    const createdTag = await createTag(name);
    setTags((previousTags) => {
      const existing = (previousTags ?? []).some((tag) => tag.id === createdTag.id);
      const updatedTags = existing
        ? [...(previousTags ?? [])]
        : [...(previousTags ?? []), createdTag];
      updatedTags.sort((firstTag, secondTag) => firstTag.name.localeCompare(secondTag.name));
      return updatedTags;
    });
    return createdTag;
  }

  async function handleDeleteTag(tag: Tag): Promise<void> {
    await deleteTag(tag.id);
    if (activeTagFilterId === tag.id) {
      setActiveTagFilterId(null);
    }
    await refreshWordsAndTags();
  }

  async function handleDelete(wordId: number) {
    if (!window.confirm("Supprimer ce mot ?")) return;
    try {
      await deleteWord(wordId);
      await refreshWordsAndTags();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function openAddModal() {
    setEditingWord(null);
    setIsModalOpen(true);
  }

  function openEditModal(word: WordWithTags) {
    setEditingWord(word);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingWord(null);
  }

  const filteredWords = useMemo(() => {
    if (!words) return [];
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return words.filter((word) => {
      if (activeTagFilterId !== null && !word.tags.some((tag) => tag.id === activeTagFilterId)) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [word.french, word.kana, word.kanji, word.romaji, word.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [words, searchQuery, activeTagFilterId]);

  async function handleExportBackup() {
    setErrorMessage(null);
    try {
      const backup = await exportBackup();
      const backupJson = JSON.stringify(backup, null, 2);
      const blob = new Blob([backupJson], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `kotoba-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  const hasWords = (words?.length ?? 0) > 0;

  useEffect(() => {
    if (!isLoading && !hasWords) {
      setShowAdvanced(true);
    }
  }, [isLoading, hasWords]);

  function openImport() {
    setShowAdvanced(true);
    window.requestAnimationFrame(() => {
      importSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="wordsPage">
      <div className="pageHeader wordsPage__header">
        <div>
          <h1 className="pageTitle">Mots</h1>
          <p className="pageSubtitle">
            {wordsCount} mot(s) dans ton vocabulaire. Ajoute, organise et illustre tes mots avec des
            exemples.
          </p>
        </div>
        <button className="button button--primary" type="button" onClick={openAddModal}>
          + Ajouter un mot
        </button>
      </div>

      {errorMessage ? (
        <div style={{ marginTop: "var(--space-5)" }} className="formError">
          {errorMessage}
        </div>
      ) : null}

      {hasWords ? (
        <div className="wordsPage__toolbar">
          <input
            className="input wordsPage__search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher un mot (français, kana, kanji, rōmaji…)"
          />
          <div className="wordsPage__tagFilters">
            <button
              type="button"
              className={`wordsPage__filterChip ${activeTagFilterId === null ? "wordsPage__filterChip--active" : ""}`}
              onClick={() => setActiveTagFilterId(null)}
            >
              Tous
            </button>
            {(tags ?? []).map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`wordsPage__filterChip ${activeTagFilterId === tag.id ? "wordsPage__filterChip--active" : ""}`}
                onClick={() => setActiveTagFilterId(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ marginTop: "var(--space-6)" }} className="muted">
          Chargement…
        </div>
      ) : null}

      {!isLoading && !hasWords ? (
        <div className="wordsPage__empty emptyState emptyState--center">
          <p className="emptyState__title">Aucun mot pour l'instant</p>
          <p className="emptyState__text">
            Ajoute tes premiers mots à la main, ou importe un fichier JSON pour démarrer plus vite.
          </p>
          <div className="emptyState__actions">
            <button className="button button--primary" type="button" onClick={openAddModal}>
              + Ajouter un mot
            </button>
            <button className="button" type="button" onClick={openImport}>
              Importer un fichier
            </button>
          </div>
        </div>
      ) : null}

      {hasWords && filteredWords.length === 0 ? (
        <div style={{ marginTop: "var(--space-8)" }} className="muted">
          Aucun mot ne correspond à ta recherche.
        </div>
      ) : null}

      {hasWords && filteredWords.length > 0 ? (
        <div style={{ marginTop: "var(--space-6)" }}>
          <WordsGroupedByTag
            words={filteredWords}
            startEdit={openEditModal}
            handleDelete={handleDelete}
          />
        </div>
      ) : null}

      <div className="wordsPage__advanced" ref={importSectionRef}>
        <button
          type="button"
          className="sectionHeader"
          onClick={() => setShowAdvanced((previous) => !previous)}
        >
          <span className="sectionHeader__chevron">{showAdvanced ? "▾" : "▸"}</span>
          <span className="sectionHeader__title">Import / Export</span>
          <span className="sectionHeader__meta muted">Backup, import en masse, scores</span>
        </button>

        {showAdvanced ? (
          <div className="wordsPage__advancedBody">
            <div className="row" style={{ gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
              <button
                className="button button--primary"
                type="button"
                onClick={() => void handleExportBackup()}
              >
                Exporter backup
              </button>
              <button
                className="button button--danger"
                type="button"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Êtes-vous sûr de vouloir réinitialiser tous les scores ? Cette action est irréversible.",
                    )
                  )
                    return;
                  setErrorMessage(null);
                  try {
                    await resetAllWordScores();
                    await refreshWordsAndTags();
                    setJsonImportStatus("Tous les scores ont été réinitialisés.");
                    setTimeout(() => setJsonImportStatus(null), 3000);
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
                  }
                }}
              >
                Réinitialiser tous les scores
              </button>
            </div>

            <ImportPanel
              onImported={refreshWordsAndTags}
              onError={(message) => setErrorMessage(message)}
            />
            {jsonImportStatus ? (
              <div className="importPanel__status" style={{ marginTop: "var(--space-3)" }}>
                {jsonImportStatus}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isModalOpen ? (
        <WordFormModal
          editingWord={editingWord}
          tags={tags ?? []}
          onClose={closeModal}
          onSaved={refreshWordsAndTags}
          onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag}
        />
      ) : null}
    </div>
  );
}

function WordsGroupedByTag(props: {
  words: WordWithTags[];
  startEdit: (word: WordWithTags) => void;
  handleDelete: (wordId: number) => Promise<void>;
}) {
  const groups = useMemo(() => {
    const wordsByGroupKey = new Map<string, WordWithTags[]>();
    for (const word of props.words) {
      const tagNames = [...word.tags.map((tag) => tag.name)].sort((a, b) => a.localeCompare(b));
      const groupKey = tagNames.length > 0 ? tagNames[0] : "Sans tag";
      const groupWords = wordsByGroupKey.get(groupKey) ?? [];
      groupWords.push(word);
      wordsByGroupKey.set(groupKey, groupWords);
    }

    const groupKeys = Array.from(wordsByGroupKey.keys()).sort((a, b) => {
      if (a === "Sans tag") return 1;
      if (b === "Sans tag") return -1;
      return a.localeCompare(b);
    });

    return groupKeys.map((groupKey) => ({
      groupKey,
      words: wordsByGroupKey.get(groupKey) ?? [],
    }));
  }, [props.words]);

  const [collapsedByGroupKey, setCollapsedByGroupKey] = useState<Record<string, boolean>>({});

  function toggleGroup(groupKey: string) {
    setCollapsedByGroupKey((previousValue) => ({
      ...previousValue,
      [groupKey]: !(previousValue[groupKey] ?? true),
    }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {groups.map((group) => {
        const isCollapsed = collapsedByGroupKey[group.groupKey] ?? true;
        return (
          <div key={group.groupKey}>
            <button
              className="sectionHeader"
              type="button"
              onClick={() => toggleGroup(group.groupKey)}
            >
              <span className="sectionHeader__chevron">{isCollapsed ? "▸" : "▾"}</span>
              <span className="sectionHeader__title">{group.groupKey}</span>
              <span className="sectionHeader__meta muted">{group.words.length} mot(s)</span>
            </button>

            {isCollapsed ? null : (
              <div className="wordGrid">
                {group.words.map((word) => (
                  <WordCard
                    key={word.id}
                    word={word}
                    startEdit={props.startEdit}
                    handleDelete={props.handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WordCard(props: {
  word: WordWithTags;
  startEdit: (word: WordWithTags) => void;
  handleDelete: (wordId: number) => Promise<void>;
}) {
  const { word } = props;
  const examplesCount = word.examples?.length ?? 0;
  const primaryJapanese = word.kanji ?? word.kana ?? null;
  const showKanaReading = Boolean(word.kanji && word.kana);

  return (
    <div className="wordCard wordCard--clickable">
      <button
        type="button"
        className="wordCard__editOverlay"
        aria-label={`Modifier ${word.french}`}
        title="Modifier"
        onClick={() => props.startEdit(word)}
      />

      <button
        type="button"
        className="wordCard__delete"
        aria-label={`Supprimer ${word.french}`}
        title="Supprimer"
        onClick={() => void props.handleDelete(word.id)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>

      <div className="wordCard__main">
        <div className="wordCard__japanese">
          {primaryJapanese ? (
            <>
              <span className="wordCard__primary">{primaryJapanese}</span>
              {word.kana ? (
                <span className="wordCard__audio">
                  <AudioButton text={word.kana} size="small" />
                </span>
              ) : null}
            </>
          ) : (
            <span className="wordCard__primary wordCard__primary--empty">—</span>
          )}
        </div>
        {showKanaReading ? <div className="wordCard__reading">{word.kana}</div> : null}
        <div className="wordCard__french">{word.french}</div>
        {word.romaji ? <div className="wordCard__romaji">{word.romaji}</div> : null}
      </div>

      {word.note ? <div className="wordCard__note">{word.note}</div> : null}

      <div className="wordCard__footer">
        <div className="wordCard__tags">
          {word.tags.map((tag) => (
            <span key={tag.id} className="wordTagBadge">
              {tag.name}
            </span>
          ))}
          {examplesCount > 0 ? (
            <span className="wordCard__examplesBadge">
              {examplesCount} exemple{examplesCount > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
