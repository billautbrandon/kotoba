/**
 * Convertit un kanji en code Unicode puis en chemin SVG
 * @param kanji - Un caractère kanji (ex: "食")
 * @returns Le chemin vers le fichier SVG (ex: "/public/kanji/u98df.svg")
 */
export function kanjiToSvgPath(kanji: string): string {
  if (!kanji || kanji.length === 0) {
    return "";
  }
  // Prendre le premier caractère (au cas où plusieurs kanji sont passés)
  const firstChar = kanji[0];
  const codePoint = firstChar.codePointAt(0);
  if (codePoint === undefined) {
    return "";
  }
  // Convertir en hexadécimal avec préfixe "u" et extension ".svg"
  const hexCode = codePoint.toString(16).toLowerCase();
  // In production, nginx serves static assets from dist/public at /public/*
  // (and we also alias /kanji/* -> /public/kanji/* for backward compatibility).
  return `/public/kanji/u${hexCode}.svg`;
}

/**
 * Extrait tous les kanji d'une chaîne
 * @param text - Texte contenant potentiellement des kanji
 * @returns Tableau de kanji uniques
 */
export function extractKanji(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  // Regex pour détecter les caractères kanji (Unicode range: 4E00-9FAF)
  const kanjiRegex = /[\u4E00-\u9FAF]/g;
  const matches = text.match(kanjiRegex);
  if (!matches) {
    return [];
  }
  // Retourner les kanji uniques
  return Array.from(new Set(matches));
}

/**
 * Vérifie si un kanji a un SVG disponible
 * @param kanji - Un caractère kanji
 * @returns Promise qui résout à true si le SVG existe
 */
export async function kanjiSvgExists(kanji: string): Promise<boolean> {
  const svgPath = kanjiToSvgPath(kanji);
  if (!svgPath) {
    return false;
  }
  try {
    const response = await fetch(svgPath, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

