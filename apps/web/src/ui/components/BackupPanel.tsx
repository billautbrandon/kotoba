import type React from "react";
import { useRef, useState } from "react";

import {
  type BackupImportWord,
  downloadCurrentBackup,
  importBackupWords,
  parseBackupFile,
  parseBackupJsonText,
} from "../utils/backup";

type BackupPreview = {
  words: BackupImportWord[];
  tagNames: string[];
  sourceLabel: string;
};

function collectTagNames(words: BackupImportWord[]): string[] {
  const tagNames = new Set<string>();
  for (const word of words) {
    for (const tagName of word.tags ?? []) {
      if (tagName.trim()) tagNames.add(tagName.trim());
    }
  }
  return [...tagNames].sort((first, second) => first.localeCompare(second));
}

export function BackupPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  function resetPreview() {
    setPreview(null);
    setPasteText("");
  }

  function loadFromWords(words: BackupImportWord[], sourceLabel: string) {
    setPreview({
      words,
      tagNames: collectTagNames(words),
      sourceLabel,
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function loadFromText(text: string, sourceLabel: string) {
    try {
      loadFromWords(parseBackupJsonText(text), sourceLabel);
    } catch (error) {
      resetPreview();
      setErrorMessage(error instanceof Error ? error.message : "JSON invalide");
    }
  }

  async function loadFromFile(file: File) {
    try {
      loadFromWords(await parseBackupFile(file), file.name);
    } catch (error) {
      resetPreview();
      setErrorMessage(error instanceof Error ? error.message : "Impossible de lire ce fichier");
    }
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

  async function handleExport() {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsExporting(true);
    try {
      await downloadCurrentBackup();
      setStatusMessage("Backup téléchargé.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'export");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport() {
    if (!preview || isImporting) return;
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const result = await importBackupWords(preview.words);
      setStatusMessage(
        `${result.importedWordsCount} mot(s) importé(s), ${result.importedTagsCount} nouveau(x) tag(s).`,
      );
      resetPreview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'import");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="settingsPanel">
      <div className="settingsPanel__header">
        <div>
          <h2 className="settingsPanel__title">Sauvegarde</h2>
          <p className="settingsPanel__text">
            Exporte tout ton vocabulaire en JSON, ou réimporte un backup. L'import ajoute les mots
            au vocabulaire existant, il ne remplace pas la liste actuelle.
          </p>
        </div>
      </div>

      <div className="backupPanel__actions">
        <button
          className="button button--primary"
          type="button"
          disabled={isExporting || isImporting}
          onClick={() => void handleExport()}
        >
          {isExporting ? "Export…" : "Exporter le backup"}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={(event) => void handleFileChange(event)}
        className="srOnly"
      />

      <button
        type="button"
        className={`backupDropzone${isDragging ? " backupDropzone--active" : ""}`}
        disabled={isImporting}
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
        <div className="backupDropzone__title">Glisse un fichier JSON ici</div>
        <div className="backupDropzone__hint">
          ou clique pour choisir un backup Kotoba (kotoba-backup-….json)
        </div>
      </button>

      {preview ? (
        <div className="backupPreview">
          <div>
            <div className="backupPreview__title">{preview.sourceLabel}</div>
            <div className="backupPreview__meta">
              {preview.words.length} mot{preview.words.length > 1 ? "s" : ""}
              {preview.tagNames.length > 0 ? ` · ${preview.tagNames.join(", ")}` : ""}
            </div>
          </div>
          <div className="backupPreview__actions">
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

      {errorMessage ? <div className="formError">{errorMessage}</div> : null}
      {statusMessage ? <div className="formSuccess">{statusMessage}</div> : null}

      <button
        className="backupPanel__toggle"
        type="button"
        onClick={() => setShowPaste((previous) => !previous)}
      >
        {showPaste ? "Masquer le collage JSON" : "Coller du JSON à la place"}
      </button>

      {showPaste ? (
        <div className="backupPanel__paste">
          <textarea
            className="textarea"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder='{"version":1,"words":[{"french":"bonjour","kana":"こんにちは","tags":["salutations"]}]}'
            disabled={isImporting}
          />
          <div className="backupPreview__actions">
            <button
              className="button button--primary"
              type="button"
              disabled={!pasteText.trim() || isImporting}
              onClick={() => loadFromText(pasteText, "Texte collé")}
            >
              Prévisualiser
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
