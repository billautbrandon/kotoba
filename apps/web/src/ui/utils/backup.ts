import { type WordExample, exportBackup, importWordsFromJson } from "../../api";

export type BackupImportWord = {
  french: string;
  romaji?: string | null;
  kana?: string | null;
  kanji?: string | null;
  note?: string | null;
  examples?: WordExample[];
  tags?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBackupExamples(value: unknown): WordExample[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const examples = value
    .filter(isRecord)
    .map((example) => ({
      jp: typeof example.jp === "string" ? example.jp : "",
      kana: typeof example.kana === "string" ? example.kana : "",
      romaji: typeof example.romaji === "string" ? example.romaji : "",
      fr: typeof example.fr === "string" ? example.fr : "",
    }))
    .filter((example) => example.jp || example.kana || example.romaji || example.fr);
  return examples.length > 0 ? examples : undefined;
}

export function extractBackupWords(parsed: unknown): BackupImportWord[] {
  const wordsSource = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.words)
      ? parsed.words
      : null;

  if (!wordsSource) {
    throw new Error(
      "Format invalide : un tableau de mots ou un objet { words: [...] } est attendu.",
    );
  }

  const words: BackupImportWord[] = [];
  for (const item of wordsSource) {
    if (!isRecord(item) || typeof item.french !== "string" || !item.french.trim()) {
      continue;
    }

    const tags = Array.isArray(item.tags)
      ? item.tags
          .filter((tagName): tagName is string => typeof tagName === "string")
          .map((tagName) => tagName.trim())
          .filter(Boolean)
      : undefined;

    words.push({
      french: item.french.trim(),
      romaji: asOptionalString(item.romaji),
      kana: asOptionalString(item.kana),
      kanji: asOptionalString(item.kanji),
      note: asOptionalString(item.note),
      examples: parseBackupExamples(item.examples),
      tags,
    });
  }

  if (words.length === 0) {
    throw new Error("Aucun mot valide trouvé dans ce JSON.");
  }

  return words;
}

export function parseBackupJsonText(text: string): BackupImportWord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Le contenu n'est pas un JSON valide.");
  }
  return extractBackupWords(parsed);
}

export async function parseBackupFile(file: File): Promise<BackupImportWord[]> {
  const fileText = await file.text();
  return parseBackupJsonText(fileText);
}

export async function downloadCurrentBackup(): Promise<void> {
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
}

export async function importBackupWords(words: BackupImportWord[]) {
  return importWordsFromJson(words);
}
