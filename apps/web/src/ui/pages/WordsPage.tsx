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
      <div style={{ fontSize: 18, fontWeight: 700 }}>Mots</div>
      <div className="muted" style={{ marginTop: 4 }}>
        {wordsCount} mot(s). Ajoute le français, puis (optionnel) kana/kanji/romaji.
      </div>

      <div style={{ marginTop: 16 }}>
        <form onSubmit={handleSubmit}>
          <div className="row">
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label htmlFor={frenchInputId}>Français</label>
              <input
                id={frenchInputId}
                className="input"
                value={formState.french}
                onChange={(event) => setFormState({ ...formState, french: event.target.value })}
              />
            </div>
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label htmlFor={kanaInputId}>Kana</label>
              <input
                id={kanaInputId}
                className="input"
                value={formState.kana}
                onChange={(event) => setFormState({ ...formState, kana: event.target.value })}
              />
            </div>
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label htmlFor={kanjiInputId}>Kanji</label>
              <input
                id={kanjiInputId}
                className="input"
                value={formState.kanji}
                onChange={(event) => setFormState({ ...formState, kanji: event.target.value })}
              />
            </div>
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label htmlFor={romajiInputId}>Rōmaji</label>
              <input
                id={romajiInputId}
                className="input"
                value={formState.romaji}
                onChange={(event) => setFormState({ ...formState, romaji: event.target.value })}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor={noteTextareaId}>Note</label>
            <textarea
              id={noteTextareaId}
              className="textarea"
              value={formState.note}
              onChange={(event) => setFormState({ ...formState, note: event.target.value })}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Tags (un mot peut avoir plusieurs tags)
            </div>
            <div className="row" style={{ alignItems: "center" }}>
              <input
                className="input"
                style={{ maxWidth: 280 }}
                value={newTagName}
                placeholder="Nouveau tag…"
                onChange={(event) => setNewTagName(event.target.value)}
              />
              <button className="button" type="button" onClick={() => handleCreateTag()}>
                Ajouter le tag
              </button>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              {(tags ?? []).map((tag) => {
                const isSelected = formState.selectedTagIds.includes(tag.id);
                const checkboxId = `tag-${tag.id}`;
                return (
                  <label
                    key={tag.id}
                    htmlFor={checkboxId}
                    className="nav__link"
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      userSelect: "none",
                      color: isSelected ? "var(--color-text)" : "var(--color-muted)",
                      borderColor: isSelected
                        ? "rgba(122, 162, 255, 0.35)"
                        : "rgba(255, 255, 255, 0.08)",
                      background: isSelected ? "rgba(122, 162, 255, 0.12)" : "transparent",
                    }}
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTag(tag.id)}
                    />
                    {tag.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="button button--primary" type="submit">
              {isEditing ? "Mettre à jour" : "Ajouter"}
            </button>
            {isEditing ? (
              <button className="button" type="button" onClick={() => cancelEdit()}>
                Annuler
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {errorMessage ? (
        <div style={{ marginTop: 12 }} className="muted">
          Erreur: {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ marginTop: 16 }} className="muted">
          Chargement…
        </div>
      ) : null}

      {words && words.length > 0 ? (
        <div style={{ marginTop: 16 }}>
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
              {words.map((word) => (
                <tr key={word.id}>
                  <td>{word.french}</td>
                  <td className="muted">{word.kanji ?? word.kana ?? "—"}</td>
                  <td className="muted">{word.romaji ?? "—"}</td>
                  <td className="muted">
                    {word.tags.length > 0 ? word.tags.map((tag) => tag.name).join(", ") : "—"}
                  </td>
                  <td>
                    <div className="row">
                      <button className="button" type="button" onClick={() => startEdit(word)}>
                        Modifier
                      </button>
                      <button
                        className="button button--danger"
                        type="button"
                        onClick={() => handleDelete(word.id)}
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
      ) : null}

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 750 }}>Import / Export JSON</div>
        <div className="muted" style={{ marginTop: 4 }}>
          Colle un JSON (tableau de mots, ou export complet) pour ajouter en masse, et exporte pour
          backup.
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="button button--primary"
            type="button"
            onClick={() => handleExportBackup()}
          >
            Exporter backup
          </button>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor={jsonImportTextareaId}>JSON à importer</label>
          <textarea
            id={jsonImportTextareaId}
            className="textarea"
            value={jsonImportText}
            onChange={(event) => setJsonImportText(event.target.value)}
            placeholder='Ex: [{"french":"bonjour","kana":"こんにちは","tags":["salutations"]}]'
          />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="button" type="button" onClick={() => handleImportJson()}>
            Importer
          </button>
          {jsonImportStatus ? <div className="muted">{jsonImportStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}

function normalizeOptionalText(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  return trimmedValue;
}
