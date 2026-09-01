import { type FormEvent, useEffect, useMemo, useState } from "react";

import { type GeminiQuota, fetchGeminiQuota, generateWordsFromList } from "../../api";
import { QuotaBar } from "./QuotaBar";

const MAX_IMPORT_WORDS = 40;

export function parseWordList(rawText: string): string[] {
  const tokens = rawText
    .split(/[\n,;、，]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const seenKeys = new Set<string>();
  const uniqueWords: string[] = [];
  for (const token of tokens) {
    const normalizedKey = token.toLowerCase();
    if (seenKeys.has(normalizedKey)) continue;
    seenKeys.add(normalizedKey);
    uniqueWords.push(token);
  }
  return uniqueWords;
}

type ImportPanelProps = {
  onImported: () => Promise<void>;
  onError: (message: string | null) => void;
};

export function ImportPanel({ onImported, onError }: ImportPanelProps) {
  const [tagName, setTagName] = useState("");
  const [wordListText, setWordListText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchGeminiQuota()
      .then((loadedQuota) => {
        if (!isCancelled) setQuota(loadedQuota);
      })
      .catch(() => {
        if (!isCancelled) setQuota(null);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const parsedWords = useMemo(() => parseWordList(wordListText), [wordListText]);
  const trimmedTagName = tagName.trim();
  const isOverLimit = parsedWords.length > MAX_IMPORT_WORDS;
  const canSubmit =
    trimmedTagName.length > 0 && parsedWords.length > 0 && !isOverLimit && !isImporting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    if (!trimmedTagName) {
      onError("Indique un titre de tag / série.");
      return;
    }
    if (parsedWords.length === 0) {
      onError("Colle au moins un mot.");
      return;
    }
    if (isOverLimit) {
      onError(`Limite de ${MAX_IMPORT_WORDS} mots par import. Réduis la liste.`);
      return;
    }

    setIsImporting(true);
    setStatusMessage(null);
    setWarningMessages([]);
    onError(null);

    try {
      const result = await generateWordsFromList(trimmedTagName, parsedWords);
      await onImported();
      if (result.quota) {
        setQuota(result.quota);
      } else {
        const refreshedQuota = await fetchGeminiQuota().catch(() => null);
        if (refreshedQuota) setQuota(refreshedQuota);
      }

      const tagLabel = result.tag?.name ?? trimmedTagName;
      setStatusMessage(`${result.createdCount} mot(s) créé(s) dans « ${tagLabel} ».`);
      setWarningMessages(result.errors ?? []);
      setWordListText("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erreur pendant l'import IA");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <form className="importPanel" onSubmit={(event) => void handleSubmit(event)}>
      <div className="importPanel__header">
        <h2 className="importPanel__title">Importer une liste avec l’IA</h2>
        <p className="importPanel__lead">
          Colle des mots (français ou japonais), donne un nom de série, et l’IA complète les fiches
          (français, rōmaji, kana, kanji).
        </p>
      </div>

      {quota ? <QuotaBar quota={quota} /> : null}

      <label className="field">
        <span className="field__label">Titre du tag / de la série</span>
        <input
          className="input"
          type="text"
          value={tagName}
          onChange={(event) => setTagName(event.target.value)}
          placeholder="Ex. Salutations, JLPT N5, Voyage…"
          maxLength={80}
          required
          disabled={isImporting}
        />
      </label>

      <label className="field">
        <span className="field__label">Liste de mots</span>
        <textarea
          className="textarea importPanel__textarea"
          value={wordListText}
          onChange={(event) => setWordListText(event.target.value)}
          placeholder={"bonjour\nmerci\n水\n食べる"}
          disabled={isImporting}
        />
        <span className={`importPanel__count${isOverLimit ? " importPanel__count--error" : ""}`}>
          {parsedWords.length === 0
            ? "Un mot par ligne, ou séparés par des virgules."
            : isOverLimit
              ? `${parsedWords.length} mots — maximum ${MAX_IMPORT_WORDS} par import.`
              : `${parsedWords.length} mot${parsedWords.length > 1 ? "s" : ""} prêt${parsedWords.length > 1 ? "s" : ""} à importer.`}
        </span>
      </label>

      <div className="importPanel__actions">
        <button className="button button--primary" type="submit" disabled={!canSubmit}>
          {isImporting
            ? "Génération…"
            : parsedWords.length > 0
              ? `Créer ${Math.min(parsedWords.length, MAX_IMPORT_WORDS)} mot(s)`
              : "Créer les mots"}
        </button>
      </div>

      {statusMessage ? <div className="importPanel__status">{statusMessage}</div> : null}
      {warningMessages.length > 0 ? (
        <ul className="importPanel__warnings">
          {warningMessages.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
