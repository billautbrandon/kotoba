/**
 * Utilitaire pour télécharger automatiquement les SVG de kanji depuis KanjiVG
 */

import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le dossier kanji
// Dans Docker, le code s'exécute depuis /app
// On utilise directement le chemin absolu pour éviter les problèmes de résolution de chemin
const kanjiDir = "/app/apps/web/public/kanji";

// S'assurer que le dossier existe
if (!fs.existsSync(kanjiDir)) {
  fs.mkdirSync(kanjiDir, { recursive: true });
  console.log(`[Kanji Downloader] Created kanji directory: ${kanjiDir}`);
}

/**
 * Convertit un kanji en code Unicode hexadécimal
 */
export function kanjiToUnicodeHex(kanji: string): string {
  const codePoint = kanji.codePointAt(0);
  if (codePoint === undefined) {
    throw new Error(`Invalid kanji: ${kanji}`);
  }
  return codePoint.toString(16).toLowerCase();
}

/**
 * Convertit un code Unicode en format KanjiVG (avec zéros de remplissage)
 */
function unicodeToKanjiVGFormat(unicodeHex: string): string {
  return unicodeHex.padStart(5, "0");
}

/**
 * Télécharge un fichier depuis une URL
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: Status Code ${response.statusCode}`));
          return;
        }
        const fileStream = fs.createWriteStream(destPath);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Extrait tous les kanji uniques d'un texte
 */
function extractKanji(text: string): Set<string> {
  const kanjiSet = new Set<string>();
  for (const char of text) {
    // Vérifier si le caractère est un kanji (plage Unicode CJK Unified Ideographs)
    // Basic CJK Unified Ideographs range: U+4E00 to U+9FFF
    if (char.match(/[\u4e00-\u9fff]/)) {
      kanjiSet.add(char);
    }
  }
  return kanjiSet;
}

/**
 * Télécharge un SVG pour un kanji donné (de manière asynchrone, sans bloquer)
 */
export async function downloadKanjiSvg(kanji: string): Promise<boolean> {
  try {
    const unicodeHex = kanjiToUnicodeHex(kanji);
    const kanjiVGFormat = unicodeToKanjiVGFormat(unicodeHex);
    const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${kanjiVGFormat}.svg`;
    const destPath = path.join(kanjiDir, `u${unicodeHex}.svg`);

    // Vérifier si le fichier existe déjà
    if (fs.existsSync(destPath)) {
      console.log(`[Kanji Downloader] SVG already exists for ${kanji} (u${unicodeHex}.svg)`);
      return true;
    }

    console.log(`[Kanji Downloader] Downloading SVG for ${kanji} from ${url}...`);
    await downloadFile(url, destPath);
    console.log(`[Kanji Downloader] ✓ Successfully downloaded ${kanji} → u${unicodeHex}.svg`);
    return true;
  } catch (error) {
    // Ne pas bloquer si le téléchargement échoue (kanji peut ne pas exister dans KanjiVG)
    console.error(`[Kanji Downloader] ✗ Failed to download SVG for kanji ${kanji}:`, error);
    return false;
  }
}

/**
 * Télécharge les SVG pour tous les kanji présents dans un texte
 * Cette fonction est asynchrone et ne bloque pas l'exécution
 */
export async function downloadKanjiSvgsFromText(text: string | null | undefined): Promise<void> {
  if (!text) {
    return;
  }

  const uniqueKanji = extractKanji(text);
  
  if (uniqueKanji.size === 0) {
    return;
  }

  console.log(`[Kanji Downloader] Found ${uniqueKanji.size} unique kanji in text: ${Array.from(uniqueKanji).join(", ")}`);

  // Télécharger tous les kanji en parallèle (sans attendre)
  Promise.all(Array.from(uniqueKanji).map((kanji) => downloadKanjiSvg(kanji))).catch((error) => {
    console.error("[Kanji Downloader] Error downloading kanji SVGs:", error);
  });
}

/**
 * Extrait tous les kanji uniques de la base de données
 */
export function getAllUniqueKanjiFromDb(database: import("better-sqlite3").Database): Set<string> {
  const rows = database
    .prepare("SELECT kanji FROM words WHERE kanji IS NOT NULL AND kanji != ''")
    .all() as Array<{ kanji: string }>;

  const kanjiSet = new Set<string>();
  for (const row of rows) {
    const kanjiInRow = extractKanji(row.kanji);
    for (const kanji of kanjiInRow) {
      kanjiSet.add(kanji);
    }
  }

  return kanjiSet;
}

/**
 * Trouve les kanji qui n'ont pas de SVG téléchargé
 */
export function findMissingKanjiSvgs(kanjiSet: Set<string>): string[] {
  const missing: string[] = [];
  for (const kanji of kanjiSet) {
    const unicodeHex = kanjiToUnicodeHex(kanji);
    const destPath = path.join(kanjiDir, `u${unicodeHex}.svg`);
    if (!fs.existsSync(destPath)) {
      missing.push(kanji);
    }
  }
  return missing;
}

/**
 * Télécharge tous les kanji manquants
 */
export async function downloadMissingKanjiSvgs(
  database: import("better-sqlite3").Database,
): Promise<{ total: number; downloaded: number; failed: number; missing: string[] }> {
  const allKanji = getAllUniqueKanjiFromDb(database);
  const missingKanji = findMissingKanjiSvgs(allKanji);

  console.log(`[Kanji Downloader] Found ${missingKanji.length} missing kanji SVGs out of ${allKanji.size} total kanji`);

  let downloaded = 0;
  let failed = 0;

  // Télécharger tous les kanji manquants
  const results = await Promise.allSettled(
    missingKanji.map((kanji) => downloadKanjiSvg(kanji)),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      downloaded++;
    } else {
      failed++;
    }
  }

  return {
    total: allKanji.size,
    downloaded,
    failed,
    missing: missingKanji,
  };
}
