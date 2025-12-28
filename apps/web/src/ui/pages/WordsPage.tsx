import type React from "react";
import { useEffect, useMemo, useState } from "react";

import {
  type Tag,
  type WordWithTags,
  createTag,
  createWord,
  deleteWord,
  exportBackup,
  fetchTags,
  fetchWordsWithTags,
  importWordsFromJson,
  updateWord,
} from "../../api";

type WordFormState = {
  french: string;
  romaji: string;
  kana: string;
  kanji: string;
  note: string;
  selectedTagIds: number[];
};

const emptyWordFormState: WordFormState = {
  french: "",
  romaji: "",
  kana: "",
  kanji: "",
  note: "",
  selectedTagIds: [],
};

export function WordsPage() {
  const [words, setWords] = useState<WordWithTags[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<WordFormState>(emptyWordFormState);
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState<string>("");
  const [jsonImportText, setJsonImportText] = useState<string>("");
  const [jsonImportStatus, setJsonImportStatus] = useState<string | null>(null);
  const frenchInputId = "word-french";
  const kanaInputId = "word-kana";
  const kanjiInputId = "word-kanji";
  const romajiInputId = "word-romaji";
  const noteTextareaId = "word-note";
  const jsonImportTextareaId = "json-import";

  const isEditing = editingWordId !== null;

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      french: formState.french.trim(),
      romaji: normalizeOptionalText(formState.romaji),
      kana: normalizeOptionalText(formState.kana),
      kanji: normalizeOptionalText(formState.kanji),
      note: normalizeOptionalText(formState.note),
      tagIds: formState.selectedTagIds,
    };

    if (!payload.french) {
      setErrorMessage("Le champ 'français' est requis.");
      return;
    }

    setErrorMessage(null);

    try {
      if (editingWordId === null) {
        await createWord(payload);
      } else {
        await updateWord(editingWordId, payload);
      }

      await refreshWordsAndTags();
      setFormState(emptyWordFormState);
      setEditingWordId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function startEdit(word: WordWithTags) {
    setEditingWordId(word.id);
    setFormState({
      french: word.french,
      romaji: word.romaji ?? "",
      kana: word.kana ?? "",
      kanji: word.kanji ?? "",
      note: word.note ?? "",
      selectedTagIds: word.tags.map((tag) => tag.id),
    });
  }

  function cancelEdit() {
    setEditingWordId(null);
    setFormState(emptyWordFormState);
  }

  async function handleDelete(wordId: number) {
    try {
      await deleteWord(wordId);
      await refreshWordsAndTags();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  async function handleCreateTag() {
    const trimmedTagName = newTagName.trim();
    if (!trimmedTagName) return;
    setErrorMessage(null);
    try {
      const createdTag = await createTag(trimmedTagName);
      setNewTagName("");
      setTags((previousTags) => {
        const updatedTags = [...(previousTags ?? []), createdTag];
        updatedTags.sort((firstTag, secondTag) => firstTag.name.localeCompare(secondTag.name));
        return updatedTags;
      });
      setFormState((previousState) => ({
        ...previousState,
        selectedTagIds: Array.from(new Set([...previousState.selectedTagIds, createdTag.id])),
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function toggleTag(tagId: number) {
    setFormState((previousState) => {
      const isSelected = previousState.selectedTagIds.includes(tagId);
      const nextSelectedTagIds = isSelected
        ? previousState.selectedTagIds.filter((selectedTagId) => selectedTagId !== tagId)
        : [...previousState.selectedTagIds, tagId];

      return {
        ...previousState,
        selectedTagIds: nextSelectedTagIds,
      };
    });
  }

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

  async function handleImportJson() {
    setErrorMessage(null);
    setJsonImportStatus(null);

    const trimmedText = jsonImportText.trim();
    if (!trimmedText) return;

    try {
      const parsed: unknown = JSON.parse(trimmedText);
      const wordsToImport = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && "words" in parsed
          ? (parsed as { words: unknown }).words
          : null;
      if (!Array.isArray(wordsToImport)) {
        throw new Error("Format invalide: attendu un tableau ou un objet { words: [...] }");
      }

      const result = await importWordsFromJson(wordsToImport);
      await refreshWordsAndTags();
      setJsonImportStatus(
        `Import OK: ${result.importedWordsCount} mots, ${result.importedTagsCount} nouveaux tags.`,
      );
      setJsonImportText("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Mots</h1>
          <p className="pageSubtitle">
            {wordsCount} mot(s). Ajoute le français, puis (optionnel) kana/kanji/romaji.
          </p>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-8)" }}>
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: "var(--space-6)",
              border: "2px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-panel-subtle)",
            }}
          >
            <div className="row" style={{ gap: "var(--space-4)" }}>
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label htmlFor={frenchInputId}>Français</label>
                <input
                  id={frenchInputId}
                  className="input"
                  value={formState.french}
                  onChange={(event) => setFormState({ ...formState, french: event.target.value })}
                  placeholder="Ex: Bonjour"
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label htmlFor={kanaInputId}>Kana</label>
                <input
                  id={kanaInputId}
                  className="input"
                  value={formState.kana}
                  onChange={(event) => setFormState({ ...formState, kana: event.target.value })}
                  placeholder="Ex: こんにちは"
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label htmlFor={kanjiInputId}>Kanji</label>
                <input
                  id={kanjiInputId}
                  className="input"
                  value={formState.kanji}
                  onChange={(event) => setFormState({ ...formState, kanji: event.target.value })}
                  placeholder="Ex: 今日は"
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label htmlFor={romajiInputId}>Rōmaji</label>
                <input
                  id={romajiInputId}
                  className="input"
                  value={formState.romaji}
                  onChange={(event) => setFormState({ ...formState, romaji: event.target.value })}
                  placeholder="Ex: konnichiwa"
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: "var(--space-5)" }}>
              <label htmlFor={noteTextareaId}>Note</label>
              <textarea
                id={noteTextareaId}
                className="textarea"
                value={formState.note}
                onChange={(event) => setFormState({ ...formState, note: event.target.value })}
                placeholder="Note optionnelle..."
              />
            </div>

            <div style={{ marginTop: "var(--space-5)" }}>
              <div className="field__label" style={{ marginBottom: "var(--space-3)" }}>
                Tags (un mot peut avoir plusieurs tags)
              </div>
              <div className="row" style={{ alignItems: "center", gap: "var(--space-3)" }}>
                <input
                  className="input"
                  style={{ flex: "0 1 300px" }}
                  value={newTagName}
                  placeholder="Nouveau tag…"
                  onChange={(event) => setNewTagName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateTag();
                    }
                  }}
                />
                <button className="button" type="button" onClick={() => void handleCreateTag()}>
                  Ajouter le tag
                </button>
              </div>

              <div
                className="row"
                style={{ marginTop: "var(--space-4)", gap: "var(--space-3)", flexWrap: "wrap" }}
              >
                {(tags ?? []).map((tag) => {
                  const isSelected = formState.selectedTagIds.includes(tag.id);
                  const checkboxId = `tag-${tag.id}`;
                  return (
                    <label
                      key={tag.id}
                      htmlFor={checkboxId}
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        userSelect: "none",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${isSelected ? "var(--color-primary)" : "var(--color-border)"}`,
                        background: isSelected ? "rgba(199, 62, 29, 0.1)" : "transparent",
                        color: isSelected ? "var(--color-primary)" : "var(--color-text-soft)",
                        fontWeight: isSelected ? 700 : 600,
                        fontSize: "15px",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTag(tag.id)}
                        style={{ cursor: "pointer" }}
                      />
                      {tag.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="row" style={{ marginTop: "var(--space-6)", gap: "var(--space-3)" }}>
              <button className="button button--primary" type="submit">
                {isEditing ? "Mettre à jour" : "Ajouter le mot"}
              </button>
              {isEditing ? (
                <button className="button" type="button" onClick={() => cancelEdit()}>
                  Annuler
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>

      {errorMessage ? (
        <div style={{ marginTop: "var(--space-5)" }} className="formError">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ marginTop: "var(--space-6)" }} className="muted">
          Chargement…
        </div>
      ) : null}

      {words && words.length > 0 ? (
        <div style={{ marginTop: "var(--space-10)" }}>
          <WordsGroupedByTag words={words} startEdit={startEdit} handleDelete={handleDelete} />
        </div>
      ) : null}

      <div
        style={{
          marginTop: "var(--space-10)",
          paddingTop: "var(--space-8)",
          borderTop: "2px solid var(--color-border)",
        }}
      >
        <h2 className="pageTitle" style={{ fontSize: "28px", marginBottom: "var(--space-3)" }}>
          Import / Export JSON
        </h2>
        <p className="pageSubtitle" style={{ marginBottom: "var(--space-5)" }}>
          Colle un JSON (tableau de mots, ou export complet) pour ajouter en masse, et exporte pour
          backup.
        </p>

        <div className="row" style={{ gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void handleExportBackup()}
          >
            Exporter backup
          </button>
        </div>

        <div className="field">
          <label htmlFor={jsonImportTextareaId}>JSON à importer</label>
          <textarea
            id={jsonImportTextareaId}
            className="textarea"
            value={jsonImportText}
            onChange={(event) => setJsonImportText(event.target.value)}
            placeholder='Ex: [{"french":"bonjour","kana":"こんにちは","tags":["salutations"]}]'
            style={{ minHeight: "120px" }}
          />
        </div>
        <div
          className="row"
          style={{ marginTop: "var(--space-4)", gap: "var(--space-3)", alignItems: "center" }}
        >
          <button className="button" type="button" onClick={() => void handleImportJson()}>
            Importer
          </button>
          {jsonImportStatus ? (
            <div className="muted" style={{ fontSize: "15px" }}>
              {jsonImportStatus}
            </div>
          ) : null}
        </div>
      </div>
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

  const [collapsedByGroupKey, setCollapsedByGroupKey] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    for (const group of groups) {
      initialState[group.groupKey] = true;
    }
    return initialState;
  });

  useEffect(() => {
    setCollapsedByGroupKey((previousValue) => {
      const nextValue: Record<string, boolean> = { ...previousValue };
      for (const group of groups) {
        if (nextValue[group.groupKey] === undefined) {
          nextValue[group.groupKey] = true;
        }
      }
      return nextValue;
    });
  }, [groups]);

  function toggleGroup(groupKey: string) {
    setCollapsedByGroupKey((previousValue) => ({
      ...previousValue,
      [groupKey]: !(previousValue[groupKey] ?? false),
    }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {groups.map((group) => {
        const isCollapsed = collapsedByGroupKey[group.groupKey] ?? false;
        return (
          <div key={group.groupKey} style={{ marginBottom: "var(--space-4)" }}>
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
              <div
                style={{
                  border: "2px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                }}
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th>Français</th>
                      <th>Kana / Kanji</th>
                      <th>Rōmaji</th>
                      <th>Tags</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.words.map((word) => (
                      <tr key={word.id}>
                        <td style={{ fontWeight: 600 }}>{word.french}</td>
                        <td className="muted">{word.kanji ?? word.kana ?? "—"}</td>
                        <td className="muted">{word.romaji ?? "—"}</td>
                        <td className="muted">
                          {word.tags.length > 0 ? (
                            <div
                              style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
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
                        <td>
                          <div className="row" style={{ gap: "var(--space-2)" }}>
                            <button
                              className="button"
                              type="button"
                              onClick={() => props.startEdit(word)}
                              style={{ padding: "8px 16px", fontSize: "15px" }}
                            >
                              Modifier
                            </button>
                            <button
                              className="button button--danger"
                              type="button"
                              onClick={() => void props.handleDelete(word.id)}
                              style={{ padding: "8px 16px", fontSize: "15px" }}
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function normalizeOptionalText(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  return trimmedValue;
}
