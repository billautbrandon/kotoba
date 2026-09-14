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
];

const PARTICLE_READINGS: Record<string, string> = {
  から: "kara",
  まで: "made",
  より: "yori",
  は: "wa",
  が: "ga",
  を: "o",
  に: "ni",
  で: "de",
  と: "to",
  も: "mo",
  へ: "e",
  の: "no",
  や: "ya",
};

const MULTI_CHAR_PARTICLES = ["から", "まで", "より"];
const SINGLE_CHAR_PARTICLES = ["は", "が", "を", "に", "で", "と", "も", "へ", "の", "や"];
const HONORIFIC_PREFIXES = new Set(["お", "ご"]);
const TRAILING_AUXILIARIES = ["くださいました", "ください", "でした", "でしょう", "です"];
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

const KANA_LEXICON = buildLexiconByFirstCharacter(
  "てーぷれこーだー べんきょうします くださいました べんきょうして べんきょうする まってください ゆうびんきょく らじおかせっと りゅうがくせい れんしゅうする いきましょう えれべーたー おまわりさん がいこくじん ぎゅうにゅう きろめーとる だいじょうぶ たべましょう たんじょうび のみましょう まんねんひつ あさごはん あたたかい あたらしい いきました いそがしい えいがかん おかあさん おじいさん おてあらい おとうさん おとこのこ おにいさん おねえさん おばあさん おべんとう おもしろい おんなのこ かれんだー きっさてん ぎゅうにく きょうしつ きょうだい きろぐらむ きんようび げつようび こうさてん こぴーする こんしゅう さらいねん さんぽする じてんしゃ じどうしゃ じゅうとお じゅぎょう しゅくだい しょくどう すいようび せんしゅう そうじする たいしかん だいどころ たべました つまらない としょかん なつやすみ にちようび のみました ぱーてぃー ばんごはん びょういん ひるごはん ぶんしょう べんきょう ぼーるぺん まいしゅう むずかしい もういちど もくようび ゆっくりと らいしゅう りょうしん れいぞうこ れすとらん わいしゃつ あかるい あさって あぱーと あぶない あります いきます いちにち いちばん いっしょ いました いもうと いりぐち いろいろ うまれる うるさい えんぴつ おいしい おおきい おおきな おおぜい おくさん おしえる おとうと おととい おととし おばさん おぼえる おんがく がいこく かいしゃ かいだん かいもの がくせい がっこう かようび かわいい きいろい きたない きょねん ぎんこう ください くだもの くつした けいかん けっこう けっこん げんかん こうえん こうちゃ こうばん こうひー こーひー ここのか ここのつ こたえる こんげつ こんばん さくぶん しつもん しました しゃしん しゃわー じょうず じょうぶ しょうゆ しんぶん すーぱー すかーと すくない すずしい すとーぶ すぷーん すぽーつ すりっぱ せーたー せっけん せんげつ せんせい せんたく そうして それから それでは だいがく だいすき たいせつ たいへん たくさん たくしー たてもの たのしい たべます たべもの だんだん ちいさい ちいさな ちかてつ ちゃいろ ちゃわん ちょうど ちょっと つかれる つとめる つめたい てーぶる でかける でぱーと でんしゃ どうして どうぶつ ときどき ともだち どようび とりにく ならべる にぎやか にほんご にゅーす ねくたい のみます のみもの はいざら はじまる はじめて はたらく はんかち ばんごう はんぶん ひこうき ひとつき びょうき ふぃるむ ふうとう ふぉーく ぶたにく ぽけっと ほんだな ほんとう まいあさ まいげつ まいつき まいとし まいにち まいねん まいばん ましょう まちます まっすぐ みじかい みなさん めーとる もんだい やさしい ゆうがた ゆうはん ゆうめい ようふく らいげつ らいねん りょうり りょこう れこーど わすれる わたくし あおい あかい あける あげる あした あそこ あそぶ あたま あちら あつい あっち あなた あびる あまい あまり あらう あるく いいえ いかが いくつ いくら いしゃ いたい いつか いつつ いつも いれる うしろ うすい うたう うわぎ えいが えいご おおい おかし おかね おきる おさけ おさら おそい おちゃ おとこ おとな おなか おなじ おふろ おもい およぐ おりる おわる おんな かえす かえる かかる かける かぞく かっぷ かてい かばん かびん かめら からい からだ かりる かるい かれー かんじ きいろ きえる ぎたー きって きっぷ きのう きゅう きょう きらい きれい くすり くもり くもる くらい くらす ぐらむ くるま くろい げんき こーと ごぜん こちら こっち こっぷ ことし ことば こども ごはん こまる こんな さいふ さかな ざっし さとう さむい しかし じかん しごと じしょ しずか じびき じぶん します しまる しめる じゃあ しゃつ しろい すぐに すこし ずぼん すわる せいと せびろ せまい ぜんぶ そして そちら そっち たかい たのむ たばこ たぶん たべる たまご ちかい ちがう ちかく つかう つくえ つくる つける つよい てーぷ てがみ できる でぐち てすと てれび てんき でんき でんわ といれ どうぞ どうも とおい とおか とけい ところ どちら どっち とても どなた となり とまる ないふ ながい なくす ななつ なのか なまえ ならう ならぶ にほん にもつ ぬるい のーと のぼる はいる はがき はじめ はしる ばたー はたち はつか はなし はなす はやい はれる ひがし ひくい ひだり ひとつ ひとり ひゃく ひろい ぷーる ふたつ ふたり ふつか ふとい ふるい ぺーじ べっど ぺっと べんり ぼうし ほしい ぽすと ほそい ぼたん ほてる まがる まずい まっち まって まるい みがく みせる みっか みっつ みどり みなみ みんな むいか むこう むっつ めがね もっと やおや やさい やすい やすみ やすむ やっつ ゆうべ ようか よっか よっつ よわい らじお りっぱ ろうか わかい わかる わたし わたす わたる わるい うえ えき ほん ひと まち みせ みず まえ なか そと にわ ねこ いぬ とり うみ あめ いえ いま ほか",
);

type ScriptKind = "kanji" | "hiragana" | "katakana" | "punct" | "latin" | "space" | "other";
type ScriptRun = { kind: ScriptKind; value: string };
type ReadingToken = { kana: string; punct?: string; fromKanji?: boolean };

export function hasJapaneseScript(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
}

function hasKanjiCharacter(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function toHiragana(kana: string): string {
  return kana.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function buildLexiconByFirstCharacter(source: string): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const word of source.split(/\s+/).filter(Boolean)) {
    const firstCharacter = word[0];
    const bucket = grouped.get(firstCharacter) ?? [];
    bucket.push(word);
    grouped.set(firstCharacter, bucket);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((left, right) => right.length - left.length || left.localeCompare(right, "ja"));
  }
  return grouped;
}

function classifyCharacter(character: string): ScriptKind {
  if (/\s/.test(character)) return "space";
  if (PUNCTUATION_ROMAJI[character] || /[.,!?…「」『』]/.test(character)) return "punct";
  if (/[\u4e00-\u9fff]/.test(character)) return "kanji";
  if (/[\u3040-\u309f]/.test(character)) return "hiragana";
  if (/[\u30a0-\u30ff]/.test(character)) return "katakana";
  if (/[A-Za-z0-9]/.test(character)) return "latin";
  return "other";
}

function splitScriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  for (const character of text) {
    const kind =
      character === "ー" && runs.length > 0
        ? runs[runs.length - 1].kind
        : classifyCharacter(character);
    const previous = runs[runs.length - 1];
    if (previous && previous.kind === kind) {
      previous.value += character;
    } else {
      runs.push({ kind, value: character });
    }
  }
  return runs;
}

function isExactParticle(chunk: string): boolean {
  return Object.hasOwn(PARTICLE_READINGS, chunk);
}

function longestLexiconMatch(remaining: string): string | null {
  const bucket = KANA_LEXICON.get(remaining[0]);
  if (!bucket) return null;
  return bucket.find((word) => remaining.startsWith(word)) ?? null;
}

function splitTrailingAuxiliary(kana: string): string[] {
  for (const auxiliary of TRAILING_AUXILIARIES) {
    if (kana.length > auxiliary.length && kana.endsWith(auxiliary)) {
      return [kana.slice(0, -auxiliary.length), auxiliary];
    }
  }
  return [kana];
}

function nextNonSpaceRun(runs: ScriptRun[], fromIndex: number): ScriptRun | null {
  for (let lookAhead = fromIndex + 1; lookAhead < runs.length; lookAhead += 1) {
    if (runs[lookAhead].kind !== "space") return runs[lookAhead];
  }
  return null;
}

function splitLeadingParticles(chunk: string): { particles: string[]; rest: string } {
  const particles: string[] = [];
  let remaining = chunk;
  while (remaining.length > 0) {
    const multi = MULTI_CHAR_PARTICLES.find((particle) => remaining.startsWith(particle));
    if (multi) {
      particles.push(multi);
      remaining = remaining.slice(multi.length);
      continue;
    }
    if (SINGLE_CHAR_PARTICLES.includes(remaining[0])) {
      particles.push(remaining[0]);
      remaining = remaining.slice(1);
      continue;
    }
    break;
  }
  return { particles, rest: remaining };
}

function pushKanaToken(
  tokens: ReadingToken[],
  kana: string,
  options?: { glueHonorific?: boolean; fromKanji?: boolean },
): void {
  if (!kana) return;
  const pieces = splitTrailingAuxiliary(kana);
  for (const piece of pieces) {
    const previous = tokens[tokens.length - 1];
    if (
      options?.glueHonorific &&
      previous &&
      !previous.punct &&
      HONORIFIC_PREFIXES.has(previous.kana)
    ) {
      previous.kana += piece;
      previous.fromKanji = true;
    } else {
      tokens.push({ kana: piece, fromKanji: options?.fromKanji });
    }
  }
}

function tokenizeFromAlignment(kanji: string, kana: string): ReadingToken[] | null {
  const runs = splitScriptRuns(kanji);
  const kanaNormalized = toHiragana(kana);
  let kanaIndex = 0;
  const tokens: ReadingToken[] = [];

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (run.kind === "space") continue;

    if (run.kind === "punct") {
      tokens.push({ kana: "", punct: run.value });
      const punctHiragana = toHiragana(run.value);
      if (kanaNormalized.startsWith(punctHiragana, kanaIndex)) {
        kanaIndex += punctHiragana.length;
      } else if (
        kanaNormalized[kanaIndex] &&
        classifyCharacter(kanaNormalized[kanaIndex]) === "punct"
      ) {
        kanaIndex += 1;
      }
      continue;
    }

    if (run.kind === "latin" || run.kind === "other") {
      tokens.push({ kana: run.value });
      continue;
    }

    if (run.kind === "hiragana" || run.kind === "katakana") {
      const expected = toHiragana(run.value);
      if (!kanaNormalized.startsWith(expected, kanaIndex)) return null;
      const matched = kanaNormalized.slice(kanaIndex, kanaIndex + expected.length);
      kanaIndex += expected.length;

      if (run.kind === "katakana") {
        pushKanaToken(tokens, matched);
        continue;
      }

      const nextRun = nextNonSpaceRun(runs, runIndex);
      if (HONORIFIC_PREFIXES.has(matched) && nextRun?.kind === "kanji") {
        pushKanaToken(tokens, matched);
        continue;
      }

      const { particles, rest } = splitLeadingParticles(matched);
      if (particles.length > 0 && rest.length === 0) {
        for (const particle of particles) tokens.push({ kana: particle });
        continue;
      }
      if (particles.length > 0) {
        for (const particle of particles) tokens.push({ kana: particle });
        pushKanaToken(tokens, rest);
        continue;
      }

      const previous = tokens[tokens.length - 1];
      const canGlueOkurigana = Boolean(previous && !previous.punct && previous.fromKanji);
      if (canGlueOkurigana) {
        previous.kana += matched;
        const split = splitTrailingAuxiliary(previous.kana);
        if (split.length > 1) {
          previous.kana = split[0];
          tokens.push({ kana: split[1] });
        }
      } else {
        pushKanaToken(tokens, matched);
      }
      continue;
    }

    let nextLiteral: string | null = null;
    for (let lookAhead = runIndex + 1; lookAhead < runs.length; lookAhead += 1) {
      const nextRun = runs[lookAhead];
      if (nextRun.kind === "space") continue;
      if (nextRun.kind === "kanji") break;
      nextLiteral = toHiragana(nextRun.value);
      break;
    }

    let consumed: string;
    if (nextLiteral) {
      let nextIndex = kanaNormalized.indexOf(nextLiteral, kanaIndex);
      // A kanji block must consume at least one mora. If the next kana run
      // also starts the kanji reading (庭/にわ + に, 電車/でんしゃ + で), skip
      // that first hit and take a later one.
      if (nextIndex === kanaIndex) {
        nextIndex = kanaNormalized.indexOf(nextLiteral, kanaIndex + 1);
      }
      if (nextIndex < kanaIndex) return null;
      consumed = kanaNormalized.slice(kanaIndex, nextIndex);
      kanaIndex = nextIndex;
    } else {
      consumed = kanaNormalized.slice(kanaIndex);
      kanaIndex = kanaNormalized.length;
    }
    if (!consumed || hasKanjiCharacter(consumed)) return null;
    pushKanaToken(tokens, consumed, { glueHonorific: true, fromKanji: true });
  }

  if (kanaIndex < kanaNormalized.length) {
    const leftover = kanaNormalized.slice(kanaIndex).replace(/[。、！？\s]+$/u, "");
    if (leftover.length > 0) return null;
  }
  if (tokens.some((token) => hasKanjiCharacter(token.kana))) return null;
  return tokens;
}

function tokenizeKanaOnly(kana: string): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  const withKatakanaGaps = kana.replace(/([ァ-ヶー]+)/g, " $1 ");
  const pieces = toHiragana(withKatakanaGaps).split(/\s+/).filter(Boolean);

  for (const piece of pieces) {
    let remaining = piece;
    while (remaining.length > 0) {
      const punctMatch = remaining.match(/^([。、！？「」『』…])/u);
      if (punctMatch) {
        tokens.push({ kana: "", punct: punctMatch[1] });
        remaining = remaining.slice(punctMatch[1].length);
        continue;
      }

      const copulaMatch = TRAILING_AUXILIARIES.find((auxiliary) => remaining.startsWith(auxiliary));
      if (copulaMatch) {
        tokens.push({ kana: copulaMatch });
        remaining = remaining.slice(copulaMatch.length);
        continue;
      }

      const lexiconMatch = longestLexiconMatch(remaining);
      if (lexiconMatch) {
        const previousToken = tokens[tokens.length - 1];
        const leadingParticle = lexiconMatch[0];
        const restAfterParticle = lexiconMatch.slice(1);
        const preferParticleSplit =
          Boolean(previousToken && !previousToken.punct && !isExactParticle(previousToken.kana)) &&
          SINGLE_CHAR_PARTICLES.includes(leadingParticle) &&
          restAfterParticle.length > 0 &&
          longestLexiconMatch(restAfterParticle) === restAfterParticle;
        if (preferParticleSplit) {
          tokens.push({ kana: leadingParticle });
          remaining = remaining.slice(1);
          continue;
        }
        pushKanaToken(tokens, lexiconMatch);
        remaining = remaining.slice(lexiconMatch.length);
        continue;
      }

      const multiParticle = MULTI_CHAR_PARTICLES.find((particle) => remaining.startsWith(particle));
      if (multiParticle) {
        tokens.push({ kana: multiParticle });
        remaining = remaining.slice(multiParticle.length);
        continue;
      }

      if (isExactParticle(remaining[0])) {
        const nextCharacter = remaining[1] ?? "";
        const wouldOrphanN = nextCharacter === "ん" || remaining.startsWith("っ", 1);
        const previousEndsWithSokuon = tokens[tokens.length - 1]?.kana.endsWith("っ");
        if (!wouldOrphanN && !previousEndsWithSokuon) {
          tokens.push({ kana: remaining[0] });
          remaining = remaining.slice(1);
          continue;
        }
      }

      const mora = HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0]));
      if (mora) {
        const previous = tokens[tokens.length - 1];
        if (previous && !previous.punct && !isExactParticle(previous.kana)) {
          previous.kana += mora[0];
        } else {
          tokens.push({ kana: mora[0] });
        }
        remaining = remaining.slice(mora[0].length);
      } else {
        const previous = tokens[tokens.length - 1];
        if (previous && !previous.punct) previous.kana += remaining[0];
        else tokens.push({ kana: remaining[0] });
        remaining = remaining.slice(1);
      }
    }
  }

  return tokens;
}

function convertKanaRun(kana: string): string {
  let remaining = kana;
  let romaji = "";
  while (remaining.length > 0) {
    if (remaining[0] === "ー") {
      const lastVowel = romaji.match(/[aeiou]$/i)?.[0];
      if (lastVowel) romaji += lastVowel;
      remaining = remaining.slice(1);
      continue;
    }
    if (remaining[0] === "っ" && remaining.length > 1) {
      const nextChunk = HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0], 1));
      const nextSound = nextChunk?.[1] ?? "";
      romaji += nextSound.charAt(0) || "t";
      remaining = remaining.slice(1);
      continue;
    }
    if (remaining[0] === "ん") {
      const nextSound =
        remaining.length > 1
          ? (HIRAGANA_ROMAJI.find((pair) => remaining.startsWith(pair[0], 1))?.[1] ?? "")
          : "";
      romaji += nextSound && /^[aeiouy]/i.test(nextSound) ? "n'" : "n";
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

function tokenToRomaji(token: ReadingToken): string {
  const punctuation = token.punct
    ? [...token.punct].map((character) => PUNCTUATION_ROMAJI[character] ?? character).join("")
    : "";
  if (!token.kana) return punctuation;
  const particle = PARTICLE_READINGS[token.kana];
  const core = particle ?? convertKanaRun(token.kana);
  return `${core}${punctuation}`;
}

export function kanaToRomaji(kana: string, kanjiHint?: string | null): string {
  const source = kana.trim();
  if (!source) return "";

  const hint = kanjiHint?.trim() || "";
  const aligned = hasKanjiCharacter(hint) ? tokenizeFromAlignment(hint, source) : null;
  const tokens = aligned ?? tokenizeKanaOnly(source);

  return tokens
    .map(tokenToRomaji)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
