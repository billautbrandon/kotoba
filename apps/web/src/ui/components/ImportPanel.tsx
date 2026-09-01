import type React from "react";
import { useRef, useState } from "react";

import { importWordsFromJson } from "../../api";

const EXAMPLE_WORDS = [
  {
    french: "bonjour",
    romaji: "konnichiwa",
    kana: "こんにちは",
    kanji: "今日は",
    examples: [
      {
        jp: "今日は良い天気ですね。",
        kana: "きょうはいいてんきですね。",
        fr: "Il fait beau aujourd'hui.",
      },
    ],
    tags: ["salutations"],
  },
  {
    french: "merci",
    romaji: "arigatou",
    kana: "ありがとう",
    kanji: "有難う",
    tags: ["salutations"],
  },
];

type ImportableWord = {
  french: string;
  romaji?: string | null;
  kana?: string | null;
  kanji?: string | null;
  note?: string | null;
  examples?: Array<{ jp: string; kana: string; fr: string }>;
  tags?: string[];
};

type ImportPreview = {
  words: ImportableWord[];
  tagNames: string[];
  sourceLabel: string;
};

function extractWords(parsed: unknown): ImportableWord[] {
  const wordsToImport = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "words" in parsed
      ? (parsed as { words: unknown }).words
      : null;
  if (!Array.isArray(wordsToImport)) {
    throw new Error(
      "Format invalide : un tableau de mots ou un objet { words: [...] } est attendu.",
    );
  }
  return wordsToImport as ImportableWord[];
}

function collectTagNames(words: ImportableWord[]): string[] {
  const tagNames = new Set<string>();
  for (const word of words) {
    for (const tagName of word.tags ?? []) {
      if (tagName.trim()) tagNames.add(tagName.trim());
    }
  }
  return [...tagNames].sort((first, second) => first.localeCompare(second));
}

type ImportPanelProps = {
  onImported: () => Promise<void>;
  onError: (message: string | null) => void;
};

export function ImportPanel({ onImported, onError }: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  function resetPreview() {
    setPreview(null);
    setPasteText("");
  }

  function loadFromParsed(parsed: unknown, sourceLabel: string) {
    const words = extractWords(parsed);
    if (words.length === 0) {
      throw new Error("Aucun mot trouvé dans ce JSON.");
    }
    setPreview({
      words,
      tagNames: collectTagNames(words),
      sourceLabel,
    });
    setStatusMessage(null);
    onError(null);
  }

  async function loadFromText(text: string, sourceLabel: string) {
    try {
      const parsed: unknown = JSON.parse(text);
      loadFromParsed(parsed, sourceLabel);
    } catch (error) {
      resetPreview();
      onError(error instanceof Error ? error.message : "JSON invalide");
    }
  }

  async function loadFromFile(file: File) {
    const fileText = await file.text();
    await loadFromText(fileText, file.name);
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await loadFromFile(file);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await loadFromFile(file);
  }

  async function handleImport() {
    if (!preview || isImporting) return;
    setIsImporting(true);
    onError(null);
    try {
      const result = await importWordsFromJson(preview.words);
      await onImported();
      setStatusMessage(
        `${result.importedWordsCount} mot(s) importé(s), ${result.importedTagsCount} nouveau(x) tag(s).`,
      );
      resetPreview();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erreur pendant l'import");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="importPanel">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={(event) => void handleFileChange(event)}
        hidden
      />

      <button
        type="button"
        className={`importDropzone${isDragging ? " importDropzone--active" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <div className="importDropzone__title">Glisse un fichier JSON ici</div>
        <div className="importDropzone__hint">
          ou clique pour choisir un fichier de backup / mots
        </div>
      </button>

      {preview ? (
        <div className="importPreview">
          <div>
            <div className="importPreview__title">{preview.sourceLabel}</div>
            <div className="importPreview__meta">
              {preview.words.length} mot{preview.words.length > 1 ? "s" : ""}
              {preview.tagNames.length > 0 ? ` · ${preview.tagNames.join(", ")}` : ""}
            </div>
          </div>
          <div className="importPreview__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting}
            >
              {isImporting ? "Import…" : `Importer ${preview.words.length} mot(s)`}
            </button>
            <button className="button" type="button" onClick={resetPreview} disabled={isImporting}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {statusMessage ? <div className="importPanel__status">{statusMessage}</div> : null}

      <button
        className="importPanel__toggle"
        type="button"
        onClick={() => setShowPaste((previous) => !previous)}
      >
        {showPaste ? "Masquer le collage JSON" : "Coller du JSON à la place"}
      </button>

      {showPaste ? (
        <div className="importPanel__paste">
          <textarea
            className="textarea"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder='[{"french":"bonjour","kana":"こんにちは","tags":["salutations"]}]'
          />
          <div className="importPreview__actions">
            <button
              className="button button--primary"
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => void loadFromText(pasteText, "Texte collé")}
            >
              Prévisualiser
            </button>
            <button
              className="button"
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(EXAMPLE_WORDS, null, 2));
                setStatusMessage("Exemple copié dans le presse-papier.");
              }}
            >
              Copier un exemple
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
