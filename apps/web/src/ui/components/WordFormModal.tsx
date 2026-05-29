import type React from "react";
import { useEffect, useId, useState } from "react";

import { type Tag, type WordExample, type WordWithTags, createWord, updateWord } from "../../api";

const MAX_EXAMPLES = 3;

type ExampleField = WordExample & { id: string };

function createExampleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `example-${Math.random().toString(36).slice(2)}`;
}

type WordFormState = {
  french: string;
  romaji: string;
  kana: string;
  kanji: string;
  note: string;
  examples: ExampleField[];
  selectedTagIds: number[];
};

const emptyWordFormState: WordFormState = {
  french: "",
  romaji: "",
  kana: "",
  kanji: "",
  note: "",
  examples: [],
  selectedTagIds: [],
};

type WordFormModalProps = {
  editingWord: WordWithTags | null;
  tags: Tag[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onCreateTag: (name: string) => Promise<Tag>;
  onDeleteTag: (tag: Tag) => Promise<void>;
};

function buildInitialState(editingWord: WordWithTags | null): WordFormState {
  if (!editingWord) return emptyWordFormState;
  return {
    french: editingWord.french,
    romaji: editingWord.romaji ?? "",
    kana: editingWord.kana ?? "",
    kanji: editingWord.kanji ?? "",
    note: editingWord.note ?? "",
    examples: (editingWord.examples ?? []).map((example) => ({
      ...example,
      id: createExampleId(),
    })),
    selectedTagIds: editingWord.tags.map((tag) => tag.id),
  };
}

export function WordFormModal({
  editingWord,
  tags,
  onClose,
  onSaved,
  onCreateTag,
  onDeleteTag,
}: WordFormModalProps) {
  const [formState, setFormState] = useState<WordFormState>(() => buildInitialState(editingWord));
  const [newTagName, setNewTagName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const baseId = useId();
  const isEditing = editingWord !== null;

  useEffect(() => {
    setFormState(buildInitialState(editingWord));
    setErrorMessage(null);
  }, [editingWord]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleTag(tagId: number) {
    setFormState((previousState) => {
      const isSelected = previousState.selectedTagIds.includes(tagId);
      const nextSelectedTagIds = isSelected
        ? previousState.selectedTagIds.filter((selectedTagId) => selectedTagId !== tagId)
        : [...previousState.selectedTagIds, tagId];
      return { ...previousState, selectedTagIds: nextSelectedTagIds };
    });
  }

  async function handleCreateTag() {
    const trimmedTagName = newTagName.trim();
    if (!trimmedTagName) return;
    setErrorMessage(null);
    try {
      const createdTag = await onCreateTag(trimmedTagName);
      setNewTagName("");
      setFormState((previousState) => ({
        ...previousState,
        selectedTagIds: Array.from(new Set([...previousState.selectedTagIds, createdTag.id])),
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  async function handleDeleteTag(tag: Tag) {
    if (!window.confirm(`Supprimer le tag « ${tag.name} » ?`)) return;
    setErrorMessage(null);
    try {
      await onDeleteTag(tag);
      setFormState((previousState) => ({
        ...previousState,
        selectedTagIds: previousState.selectedTagIds.filter((id) => id !== tag.id),
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function updateExample(id: string, field: keyof WordExample, value: string) {
    setFormState((previousState) => {
      const nextExamples = previousState.examples.map((example) =>
        example.id === id ? { ...example, [field]: value } : example,
      );
      return { ...previousState, examples: nextExamples };
    });
  }

  function addExample() {
    setFormState((previousState) => {
      if (previousState.examples.length >= MAX_EXAMPLES) return previousState;
      return {
        ...previousState,
        examples: [...previousState.examples, { id: createExampleId(), jp: "", kana: "", fr: "" }],
      };
    });
  }

  function removeExample(id: string) {
    setFormState((previousState) => ({
      ...previousState,
      examples: previousState.examples.filter((example) => example.id !== id),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const cleanedExamples = formState.examples
      .map((example) => ({
        jp: example.jp.trim(),
        kana: example.kana.trim(),
        fr: example.fr.trim(),
      }))
      .filter((example) => example.jp || example.kana || example.fr);

    const payload = {
      french: formState.french.trim(),
      romaji: normalizeOptionalText(formState.romaji),
      kana: normalizeOptionalText(formState.kana),
      kanji: normalizeOptionalText(formState.kanji),
      note: normalizeOptionalText(formState.note),
      examples: cleanedExamples,
      tagIds: formState.selectedTagIds,
    };

    if (!payload.french) {
      setErrorMessage("Le champ « français » est requis.");
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      if (editingWord === null) {
        await createWord(payload);
      } else {
        await updateWord(editingWord.id, payload);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="modal__overlay"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="modal__content wordFormModal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title">{isEditing ? "Modifier le mot" : "Ajouter un mot"}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor={`${baseId}-french`}>
              Français <span className="wordFormModal__required">*</span>
            </label>
            <input
              id={`${baseId}-french`}
              className="input"
              value={formState.french}
              onChange={(event) => setFormState({ ...formState, french: event.target.value })}
              placeholder="Ex: Bonjour"
            />
          </div>

          <div className="row wordFormModal__japaneseRow">
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor={`${baseId}-kanji`}>Kanji</label>
              <input
                id={`${baseId}-kanji`}
                className="input"
                value={formState.kanji}
                onChange={(event) => setFormState({ ...formState, kanji: event.target.value })}
                placeholder="今日は"
              />
            </div>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor={`${baseId}-kana`}>Kana</label>
              <input
                id={`${baseId}-kana`}
                className="input"
                value={formState.kana}
                onChange={(event) => setFormState({ ...formState, kana: event.target.value })}
                placeholder="こんにちは"
              />
            </div>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor={`${baseId}-romaji`}>Rōmaji</label>
              <input
                id={`${baseId}-romaji`}
                className="input"
                value={formState.romaji}
                onChange={(event) => setFormState({ ...formState, romaji: event.target.value })}
                placeholder="konnichiwa"
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: "var(--space-4)" }}>
            <label htmlFor={`${baseId}-note`}>Note</label>
            <textarea
              id={`${baseId}-note`}
              className="textarea"
              value={formState.note}
              onChange={(event) => setFormState({ ...formState, note: event.target.value })}
              placeholder="Note optionnelle (registre, nuance, mnémotechnique...)"
            />
          </div>

          <div className="wordFormModal__examples">
            <div className="wordFormModal__sectionHead">
              <span className="field__label">
                Exemples ({formState.examples.length}/{MAX_EXAMPLES})
              </span>
              {formState.examples.length < MAX_EXAMPLES ? (
                <button type="button" className="button" onClick={addExample}>
                  + Ajouter un exemple
                </button>
              ) : null}
            </div>

            {formState.examples.length === 0 ? (
              <p className="muted wordFormModal__examplesHint">
                Ajoute jusqu'à {MAX_EXAMPLES} phrases d'exemple (phrase japonaise, lecture kana,
                traduction française).
              </p>
            ) : null}

            {formState.examples.map((example, index) => (
              <div key={example.id} className="wordFormModal__exampleCard">
                <div className="wordFormModal__exampleHead">
                  <span className="wordFormModal__exampleNumber">Exemple {index + 1}</span>
                  <button
                    type="button"
                    className="button button--danger wordFormModal__exampleRemove"
                    onClick={() => removeExample(example.id)}
                    aria-label={`Supprimer l'exemple ${index + 1}`}
                  >
                    Supprimer
                  </button>
                </div>
                <div className="field">
                  <label htmlFor={`${example.id}-jp`}>Phrase (japonais)</label>
                  <input
                    id={`${example.id}-jp`}
                    className="input"
                    value={example.jp}
                    onChange={(event) => updateExample(example.id, "jp", event.target.value)}
                    placeholder="今日は良い天気ですね。"
                  />
                </div>
                <div className="row" style={{ gap: "var(--space-3)" }}>
                  <div className="field" style={{ flex: "1 1 180px" }}>
                    <label htmlFor={`${example.id}-kana`}>Lecture (kana)</label>
                    <input
                      id={`${example.id}-kana`}
                      className="input"
                      value={example.kana}
                      onChange={(event) => updateExample(example.id, "kana", event.target.value)}
                      placeholder="きょうはいいてんきですね。"
                    />
                  </div>
                  <div className="field" style={{ flex: "1 1 180px" }}>
                    <label htmlFor={`${example.id}-fr`}>Traduction (français)</label>
                    <input
                      id={`${example.id}-fr`}
                      className="input"
                      value={example.fr}
                      onChange={(event) => updateExample(example.id, "fr", event.target.value)}
                      placeholder="Il fait beau aujourd'hui, n'est-ce pas ?"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="wordFormModal__tags">
            <div className="field__label" style={{ marginBottom: "var(--space-3)" }}>
              Tags
            </div>
            <div className="row" style={{ alignItems: "center", gap: "var(--space-3)" }}>
              <input
                className="input"
                style={{ flex: "1 1 200px" }}
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

            <div className="wordFormModal__tagList">
              {tags.length === 0 ? <span className="muted">Aucun tag pour l'instant.</span> : null}
              {tags.map((tag) => {
                const isSelected = formState.selectedTagIds.includes(tag.id);
                return (
                  <span
                    key={tag.id}
                    className={`wordTagChip ${isSelected ? "wordTagChip--selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="wordTagChip__toggle"
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </button>
                    <button
                      type="button"
                      className="wordTagChip__remove"
                      onClick={() => void handleDeleteTag(tag)}
                      aria-label={`Supprimer le tag ${tag.name}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          </div>

          {errorMessage ? (
            <div className="formError wordFormModal__error">{errorMessage}</div>
          ) : null}

          <div className="wordFormModal__actions">
            <button className="button" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="button button--primary" type="submit" disabled={isSaving}>
              {isSaving ? "Enregistrement…" : isEditing ? "Mettre à jour" : "Ajouter le mot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function normalizeOptionalText(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  return trimmedValue;
}
