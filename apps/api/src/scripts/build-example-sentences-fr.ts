#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { callGeminiJson, isGeminiConfigured } from "../gemini.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const seedDirectoryPath = path.join(currentDirectoryPath, "../catalog-seed");
const vocabPath = path.join(seedDirectoryPath, "openjlpt-n5-vocab.json");
const outputPath = path.join(seedDirectoryPath, "openjlpt-n5-example-fr.json");

type OpenJlptVocab = {
  examples?: Array<{ ja: string; en: string }>;
};

const translationBatchSchema = z.array(
  z.object({
    en: z.string().min(1),
    fr: z.string().min(1),
  }),
);

function normalizeEnglishKey(english: string): string {
  return english.trim().toLowerCase().replace(/\s+/g, " ");
}

function collectUniqueEnglishSentences(vocab: OpenJlptVocab[]): string[] {
  const byKey = new Map<string, string>();
  for (const entry of vocab) {
    for (const example of entry.examples ?? []) {
      const trimmed = example.en.trim();
      if (!trimmed) continue;
      const key = normalizeEnglishKey(trimmed);
      if (!byKey.has(key)) byKey.set(key, trimmed);
    }
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function loadExistingTranslations(): Record<string, string> {
  if (!fs.existsSync(outputPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8")) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveTranslations(translations: Record<string, string>): void {
  const sortedEntries = Object.entries(translations).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const sortedObject = Object.fromEntries(sortedEntries);
  fs.writeFileSync(outputPath, `${JSON.stringify(sortedObject, null, 2)}\n`, "utf8");
}

async function translateBatch(sentences: string[]): Promise<Record<string, string>> {
  const prompt = `Tu traduis des phrases d'exemple pour une application d'apprentissage du japonais (niveau JLPT N5).

Règles :
- Français naturel, idiomatique, sans anglais résiduel.
- Registre courant (tu/vous selon le contexte).
- Conserve le sens exact de l'anglais.
- Ponctuation française correcte.

Phrases anglaises à traduire (JSON array de strings) :
${JSON.stringify(sentences)}

Réponds uniquement avec un JSON array d'objets { "en": "<phrase anglaise exacte>", "fr": "<traduction française>" }.
Chaque "en" doit correspondre mot pour mot à une entrée de la liste ci-dessus.`;

  const batch = await callGeminiJson(prompt, {
    zodSchema: translationBatchSchema,
    maxRetries: 3,
  });

  const output: Record<string, string> = {};
  for (const row of batch) {
    output[normalizeEnglishKey(row.en)] = row.fr.trim();
  }
  return output;
}

async function main(): Promise<void> {
  if (!isGeminiConfigured()) {
    console.error("GEMINI_API_KEY manquant : impossible de générer les traductions.");
    process.exit(1);
  }

  const vocab = JSON.parse(fs.readFileSync(vocabPath, "utf8")) as OpenJlptVocab[];
  const allSentences = collectUniqueEnglishSentences(vocab);
  const translations = loadExistingTranslations();

  const missingSentences = allSentences.filter(
    (sentence) => !translations[normalizeEnglishKey(sentence)],
  );

  console.log(
    `[kotoba] ${allSentences.length} phrases uniques, ${Object.keys(translations).length} déjà traduites, ${missingSentences.length} restantes.`,
  );

  const batches = chunkArray(missingSentences, 25);
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`[kotoba] Lot ${batchIndex + 1}/${batches.length} (${batch.length} phrases)...`);
    const batchTranslations = await translateBatch(batch);
    for (const [key, french] of Object.entries(batchTranslations)) {
      translations[key] = french;
    }
    saveTranslations(translations);
  }

  console.log(`[kotoba] Terminé : ${Object.keys(translations).length} traductions → ${outputPath}`);
}

main().catch((error) => {
  console.error("[kotoba] Échec de génération des traductions d'exemple :", error);
  process.exit(1);
});
