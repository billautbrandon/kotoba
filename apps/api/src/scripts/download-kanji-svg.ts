#!/usr/bin/env node

/**
 * Script pour télécharger automatiquement les SVG de kanji depuis KanjiVG
 * Usage: npm run download-kanji-svg
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers la base de données (depuis le dossier du projet)
const projectRoot = path.resolve(__dirname, "../../../../");
const dbPath = path.join(projectRoot, "data/kotoba.sqlite");
const kanjiDir = path.join(projectRoot, "apps/web/public/kanji");

// Créer le dossier kanji s'il n'existe pas
if (!fs.existsSync(kanjiDir)) {
  fs.mkdirSync(kanjiDir, { recursive: true });
}

/**
 * Convertit un kanji en code Unicode hexadécimal
 */
function kanjiToUnicodeHex(kanji: string): string {
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
  // KanjiVG utilise un format avec zéros de remplissage sur 5 caractères
  return unicodeHex.padStart(5, "0");
}

/**
 * Télécharge un fichier depuis une URL
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        } else if (response.statusCode === 404) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`File not found: ${url}`));
        } else {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        }
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });
  });
}

/**
 * Extrait tous les kanji uniques de la base de données
 */
function extractAllKanjiFromDatabase(database: Database.Database): Set<string> {
  const kanjiSet = new Set<string>();

  // Récupérer tous les mots avec kanji
  const words = database.prepare("SELECT kanji FROM words WHERE kanji IS NOT NULL AND kanji != ''").all() as Array<{ kanji: string }>;

  for (const word of words) {
    // Regex pour détecter les caractères kanji (Unicode range: 4E00-9FAF)
    const kanjiRegex = /[\u4E00-\u9FAF]/g;
    const matches = word.kanji.match(kanjiRegex);
    if (matches) {
      for (const kanji of matches) {
        kanjiSet.add(kanji);
      }
    }
  }

  return kanjiSet;
}

/**
 * Télécharge un SVG pour un kanji donné
 */
async function downloadKanjiSvg(kanji: string): Promise<boolean> {
  try {
    const unicodeHex = kanjiToUnicodeHex(kanji);
    const kanjiVGFormat = unicodeToKanjiVGFormat(unicodeHex);
    const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${kanjiVGFormat}.svg`;
    const destPath = path.join(kanjiDir, `u${unicodeHex}.svg`);

    // Vérifier si le fichier existe déjà
    if (fs.existsSync(destPath)) {
      console.log(`✓ ${kanji} (u${unicodeHex}.svg) déjà présent`);
      return true;
    }

    console.log(`Téléchargement de ${kanji}...`);
    await downloadFile(url, destPath);
    console.log(`✓ ${kanji} → u${unicodeHex}.svg`);
    return true;
  } catch (error) {
    console.error(`✗ ${kanji}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log("📥 Téléchargement automatique des SVG de kanji depuis KanjiVG\n");

  // Ouvrir la base de données
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Base de données non trouvée: ${dbPath}`);
    process.exit(1);
  }

  const database = Database(dbPath);

  try {
    // Extraire tous les kanji uniques
    console.log("🔍 Extraction des kanji depuis la base de données...");
    const kanjiSet = extractAllKanjiFromDatabase(database);
    const kanjiArray = Array.from(kanjiSet).sort();

    if (kanjiArray.length === 0) {
      console.log("ℹ️  Aucun kanji trouvé dans la base de données.");
      return;
    }

    console.log(`📊 ${kanjiArray.length} kanji unique(s) trouvé(s)\n`);

    // Télécharger chaque kanji
    let successCount = 0;
    let failCount = 0;

    for (const kanji of kanjiArray) {
      const success = await downloadKanjiSvg(kanji);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Petite pause pour ne pas surcharger le serveur
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`\n✅ Terminé: ${successCount} téléchargé(s), ${failCount} échec(s)`);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    database.close();
  }
}

// Exécuter le script
main().catch((error) => {
  console.error("❌ Erreur fatale:", error);
  process.exit(1);
});

