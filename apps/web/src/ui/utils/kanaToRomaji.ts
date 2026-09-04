const HIRAGANA_ROMAJI: Array<[string, string]> = [
  ["きゃ", "kya"],
  ["きゅ", "kyu"],
  ["きょ", "kyo"],
  ["しゃ", "sha"],
  ["しゅ", "shu"],
  ["しょ", "sho"],
  ["ちゃ", "cha"],
  ["ちゅ", "chu"],
  ["ちょ", "cho"],
  ["にゃ", "nya"],
  ["にゅ", "nyu"],
  ["にょ", "nyo"],
  ["ひゃ", "hya"],
  ["ひゅ", "hyu"],
  ["ひょ", "hyo"],
  ["みゃ", "mya"],
  ["みゅ", "myu"],
  ["みょ", "myo"],
  ["りゃ", "rya"],
  ["りゅ", "ryu"],
  ["りょ", "ryo"],
  ["ぎゃ", "gya"],
  ["ぎゅ", "gyu"],
  ["ぎょ", "gyo"],
  ["じゃ", "ja"],
  ["じゅ", "ju"],
  ["じょ", "jo"],
  ["びゃ", "bya"],
  ["びゅ", "byu"],
  ["びょ", "byo"],
  ["ぴゃ", "pya"],
  ["ぴゅ", "pyu"],
  ["ぴょ", "pyo"],
  ["あ", "a"],
  ["い", "i"],
  ["う", "u"],
  ["え", "e"],
  ["お", "o"],
  ["か", "ka"],
  ["き", "ki"],
  ["く", "ku"],
  ["け", "ke"],
  ["こ", "ko"],
  ["さ", "sa"],
  ["し", "shi"],
  ["す", "su"],
  ["せ", "se"],
  ["そ", "so"],
  ["た", "ta"],
  ["ち", "chi"],
  ["つ", "tsu"],
  ["て", "te"],
  ["と", "to"],
  ["な", "na"],
  ["に", "ni"],
  ["ぬ", "nu"],
  ["ね", "ne"],
  ["の", "no"],
  ["は", "ha"],
  ["ひ", "hi"],
  ["ふ", "fu"],
  ["へ", "he"],
  ["ほ", "ho"],
  ["ま", "ma"],
  ["み", "mi"],
  ["む", "mu"],
  ["め", "me"],
  ["も", "mo"],
  ["や", "ya"],
  ["ゆ", "yu"],
  ["よ", "yo"],
  ["ら", "ra"],
  ["り", "ri"],
  ["る", "ru"],
  ["れ", "re"],
  ["ろ", "ro"],
  ["わ", "wa"],
  ["を", "o"],
  ["ん", "n"],
  ["が", "ga"],
  ["ぎ", "gi"],
  ["ぐ", "gu"],
  ["げ", "ge"],
  ["ご", "go"],
  ["ざ", "za"],
  ["じ", "ji"],
  ["ず", "zu"],
  ["ぜ", "ze"],
  ["ぞ", "zo"],
  ["だ", "da"],
  ["ぢ", "ji"],
  ["づ", "zu"],
  ["で", "de"],
  ["ど", "do"],
  ["ば", "ba"],
  ["び", "bi"],
  ["ぶ", "bu"],
  ["べ", "be"],
  ["ぼ", "bo"],
  ["ぱ", "pa"],
  ["ぴ", "pi"],
  ["ぷ", "pu"],
  ["ぺ", "pe"],
  ["ぽ", "po"],
  ["ぁ", "a"],
  ["ぃ", "i"],
  ["ぅ", "u"],
  ["ぇ", "e"],
  ["ぉ", "o"],
  ["っ", ""],
  ["ー", ""],
];

const PARTICLE_READINGS: Array<[string, string]> = [
  ["から", "kara"],
  ["まで", "made"],
  ["より", "yori"],
  ["は", "wa"],
  ["が", "ga"],
  ["を", "o"],
  ["に", "ni"],
  ["で", "de"],
  ["と", "to"],
  ["も", "mo"],
  ["へ", "e"],
  ["の", "no"],
  ["や", "ya"],
];

const PARTICLE_PATTERN = /(から|まで|より|は|が|を|に|で|と|も|へ|の|や)/;
const COUNTER_PATTERN =
  /(じゅう|ろく|さん|よん|はち|なな|しち|きゅう|いち|ご|よ|く)(じ|ふん|ぷん|さい|ほん|ぽん|ぼん)/g;
const PUNCTUATION_ROMAJI: Record<string, string> = {
  "。": ".",
  "、": ",",
  "！": "!",
  "？": "?",
  "「": "“",
  "」": "”",
  "『": "“",
  "』": "”",
};

export function hasJapaneseScript(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
}

function toHiragana(kana: string): string {
  return kana.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function convertKanaRun(kana: string): string {
  let remaining = kana;
  let romaji = "";
  while (remaining.length > 0) {
    if (remaining[0] === "っ" && remaining.length > 1) {
      const nextChunk = HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0], 1));
      const nextSound = nextChunk?.[1] ?? "";
      romaji += nextSound.charAt(0) || "t";
      remaining = remaining.slice(1);
      continue;
    }
    const match = HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0]));
    if (match) {
      romaji += match[1];
      remaining = remaining.slice(match[0].length);
    } else {
      romaji += remaining[0];
      remaining = remaining.slice(1);
    }
  }
  return romaji;
}

function particleReading(chunk: string): string | null {
  const match = PARTICLE_READINGS.find(([kanaParticle]) => kanaParticle === chunk);
  return match ? match[1] : null;
}

function kanaLength(text: string): number {
  return [...text.replace(/[。、！？「」『』…\s]/g, "")].length;
}

function shouldGlueParticle(particle: string, nextPart: string | undefined): boolean {
  if (!nextPart) return false;
  if (nextPart.startsWith("っ") || /^[ゃゅょぁぃぅぇぉ]/.test(nextPart)) return true;
  if (particle === "で" && /^(す|した|しょう)/.test(nextPart)) return true;
  return kanaLength(nextPart) > 0 && kanaLength(nextPart) < 2;
}

function splitKanaChunks(kana: string): string[] {
  const rawParts = kana.split(PARTICLE_PATTERN).filter((part) => part.length > 0);
  const merged: string[] = [];
  for (let index = 0; index < rawParts.length; index += 1) {
    const part = rawParts[index];
    const nextPart = rawParts[index + 1];
    const previous = merged[merged.length - 1];
    if (part === "が" && nextPart && /^(く|っ|ぎ)/.test(nextPart)) {
      merged.push(`${part}${nextPart}`);
      index += 1;
      continue;
    }
    if (particleReading(part) && shouldGlueParticle(part, nextPart)) {
      const glued = `${previous ?? ""}${part}${nextPart ?? ""}`;
      if (previous) merged[merged.length - 1] = glued;
      else merged.push(glued);
      index += 1;
      continue;
    }
    merged.push(part);
  }
  return merged;
}

function mapPunctuation(text: string): string {
  return [...text].map((character) => PUNCTUATION_ROMAJI[character] ?? character).join("");
}

export function kanaToRomaji(kana: string): string {
  const withKatakanaGaps = kana.replace(/([ァ-ヶー]+)/g, " $1 ");
  const withCopula = toHiragana(withKatakanaGaps).replace(/(でした|でしょう|です)/g, " $1 ");
  const chunks = withCopula
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((piece) => splitKanaChunks(piece));
  const words: string[] = [];

  for (const chunk of chunks) {
    const punctuationMatch = chunk.match(/^(.*?)([。、！？「」『』…]+)$/u);
    const core = punctuationMatch ? punctuationMatch[1] : chunk;
    const trailingPunctuation = punctuationMatch ? mapPunctuation(punctuationMatch[2]) : "";
    const particle = core ? particleReading(core) : null;
    const spacedCore = core.replace(COUNTER_PATTERN, " $1$2").trim();
    const withInnerSpaces = particle
      ? particle
      : spacedCore
          .split(/\s+/)
          .filter(Boolean)
          .map((piece) => particleReading(piece) ?? convertKanaRun(piece))
          .join(" ");

    if (withInnerSpaces) words.push(withInnerSpaces);
    if (trailingPunctuation) {
      if (words.length > 0) {
        words[words.length - 1] += trailingPunctuation;
      } else {
        words.push(trailingPunctuation);
      }
    }
  }

  return words
    .join(" ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}
