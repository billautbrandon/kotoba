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
  "てーぷれこーだー べんきょうします くださいました べんきょうして べんきょうする まってください ゆうびんきょく らじおかせっと りゅうがくせい れんしゅうする いきましょう えれべーたー おまわりさん がいこくじん ぎゅうにゅう きろめーとる だいじょうぶ たべましょう たんじょうび のみましょう まんねんひつ あさごはん あたたかい あたらしい いきました いそがしい えいがかん おかあさん おじいさん おてあらい おとうさん おとこのこ おにいさん おねえさん おばあさん おべんとう おもしろい おんなのこ かれんだー きっさてん ぎゅうにく きょうしつ きょうだい きろぐらむ きんようび げつようび こうさてん こぴーする こんしゅう さらいねん さんぽする じてんしゃ じどうしゃ じゅうとお じゅぎょう しゅくだい しょくどう すいようび せんしゅう そうじする たいしかん だいどころ たべました つまらない としょかん なつやすみ にちようび のみました ぱーてぃー ばんごはん びょういん ひるごはん ぶんしょう べんきょう ぼーるぺん まいしゅう むずかしい もういちど もくようび ゆっくりと らいしゅう りょうしん れいぞうこ れすとらん わいしゃつ あかるい あさって あぱーと あぶない あります いきます いちにち いちばん いっしょ いました いもうと いりぐち いろいろ うまれる うるさい えんぴつ おいしい おおきい おおきな おおぜい おくさん おしえる おとうと おととい おととし おばさん おぼえる おんがく がいこく かいしゃ かいだん かいもの がくせい がっこう かようび かわいい きいろい きたない きょねん ぎんこう ください くだもの くつした けいかん けっこう けっこん げんかん こうえん こうちゃ こうばん こうひー こーひー ここのか ここのつ こたえる こんげつ こんばん さくぶん しつもん しました しゃしん しゃわー じょうず じょうぶ しょうゆ しんぶん すーぱー すかーと すくない すずしい すとーぶ すぷーん すぽーつ すりっぱ せーたー せっけん せんげつ せんせい せんたく そうして それから それでは だいがく だいすき たいせつ たいへん たくさん たくしー たてもの たのしい たべます たべもの だんだん ちいさい ちいさな ちかてつ ちゃいろ ちゃわん ちょうど ちょっと つかれる つとめる つめたい てーぶる でかける でぱーと でんしゃ どうして どうぶつ ときどき ともだち どようび とりにく ならべる にぎやか にほんご にゅーす ねくたい のみます のみもの はいざら はじまる はじめて はたらく はんかち ばんごう はんぶん ひこうき ひとつき びょうき ふぃるむ ふうとう ふぉーく ぶたにく ぽけっと ほんだな ほんとう まいあさ まいげつ まいつき まいとし まいにち まいねん まいばん ましょう まちます まっすぐ みじかい みなさん めーとる もんだい やさしい ゆうがた ゆうはん ゆうめい ようふく らいげつ らいねん りょうり りょこう れこーど わすれる わたくし あおい あかい あける あげる あした あそこ あそぶ あたま あちら あつい あっち あなた あびる あまい あまり あらう あるく いいえ いかが いくつ いくら いしゃ いたい いつか いつつ いつも いれる うしろ うすい うたう うわぎ えいが えいご おおい おかし おかね おきる おさけ おさら おそい おちゃ おとこ おとな おなか おなじ おふろ おもい およぐ おりる おわる おんな かえす かえる かかる かける かぞく かっぷ かてい かばん かびん かめら からい からだ かりる かるい かれー かんじ きいろ きえる ぎたー きって きっぷ きのう きゅう きょう きらい きれい くすり くもり くもる くらい くらす ぐらむ くるま くろい げんき こーと ごぜん こちら こっち こっぷ ことし ことば こども ごはん こまる こんな さいふ さかな ざっし さとう さむい しかし じかん しごと じしょ しずか じびき じぶん します しまる しめる じゃあ しゃつ しろい すぐに すこし ずぼん すわる せいと せびろ せまい ぜんぶ そして そちら そっち たかい たのむ たばこ たぶん たべる たまご ちかい ちがう ちかく つかう つくえ つくる つける つよい てーぷ てがみ できる でぐち てすと てれび てんき でんき でんわ といれ どうぞ どうも とおい とおか とけい ところ どちら どっち とても どなた となり とまる ないふ ながい なくす ななつ なのか なまえ ならう ならぶ にほん にもつ ぬるい のーと のぼる はいる はがき はじめ はしる ばたー はたち はつか はなし はなす はやい はれる ひがし ひくい ひだり ひとつ ひとり ひゃく ひろい ぷーる ふたつ ふたり ふつか ふとい ふるい ぺーじ べっど ぺっと べんり ぼうし ほしい ぽすと ほそい ぼたん ほてる まがる まずい まっち まって まるい みがく みせる みっか みっつ みどり みなみ みんな むいか むこう むっつ めがね もっと やおや やさい やすい やすみ やすむ やっつ ゆうべ ようか よっか よっつ よわい らじお りっぱ ろうか わかい わかる わたし わたす わたる わるい うえ えき ほん ひと まち みせ みず まえ なか そと にわ ねこ いぬ とり うみ あめ いえ いま ほか いい てんき",
);

const KANJI_READINGS = buildKanjiReadingsByFirstCharacter(
  "お兄さん=おにいさん お姉さん=おねえさん お手洗い=おてあらい お父さん=おとうさん お母さん=おかあさん もう一度=もういちど 叔母さん=おばさん 出かける=でかける 生まれる=うまれる 伯母さん=おばさん お菓子=おかし お風呂=おふろ お弁当=おべんとう さ来年=さらいねん とり肉=とりにく 易しい=やさしい 一昨日=おととい 一昨年=おととし 飲み物=のみもの 映画館=えいがかん 奥さん=おくさん 黄色い=きいろい 夏休み=なつやすみ 火曜日=かようび 皆さん=みなさん 開ける=あける 外国人=がいこくじん 覚える=おぼえる 楽しい=たのしい 危ない=あぶない 起きる=おきる 喫茶店=きっさてん 教える=おしえる 勤める=つとめる 金曜日=きんようび 月曜日=げつようび 見せる=みせる 交差点=こうさてん 向こう=むこう 降りる=おりる 始まる=はじまる 止まる=とまる 自転車=じてんしゃ 自動車=じどうしゃ 借りる=かりる 初めて=はじめて 女の子=おんなのこ 小さい=ちいさい 小さな=ちいさな 少ない=すくない 消える=きえる 上げる=あげる 食べる=たべる 食べ物=たべもの 新しい=あたらしい 図書館=としょかん 水曜日=すいようび 晴れる=はれる 大きい=おおきい 大きな=おおきな 大好き=だいすき 大使館=たいしかん 大丈夫=だいじょうぶ 誕生日=たんじょうび 暖かい=あたたかい 男の子=おとこのこ 地下鉄=ちかてつ 昼御飯=ひるごはん 朝御飯=あさごはん 締める=しめる 土曜日=どようび 答える=こたえる 難しい=むずかしい 二十歳=はたち 二十日=はつか 賑やか=にぎやか 日曜日=にちようび 入れる=いれる 買い物=かいもの 八百屋=やおや 晩御飯=ばんごはん 疲れる=つかれる 飛行機=ひこうき 分かる=わかる 並べる=ならべる 閉まる=しまる 閉める=しめる 忘れる=わすれる 忙しい=いそがしい 万年筆=まんねんひつ 無くす=なくす 木曜日=もくようび 郵便局=ゆうびんきょく 欲しい=ほしい 留学生=りゅうがくせい 涼しい=すずしい 冷たい=つめたい 冷蔵庫=れいぞうこ お金=おかね お皿=おさら お酒=おさけ お茶=おちゃ 悪い=わるい 安い=やすい 暗い=くらい 意味=いみ 違う=ちがう 医者=いしゃ 一つ=ひとつ 一月=ひとつき 一緒=いっしょ 一人=ひとり 一日=いちにち 引く=ひく 飲む=のむ 映画=えいが 泳ぐ=およぐ 英語=えいご 円い=まるい 遠い=とおい 鉛筆=えんぴつ 汚い=きたない 押す=おす 黄色=きいろ 温い=ぬるい 音楽=おんがく 下手=へた 家族=かぞく 家庭=かてい 果物=くだもの 歌う=うたう 花瓶=かびん 荷物=にもつ 会う=あう 会社=かいしゃ 灰皿=はいざら 開く=あく 階段=かいだん 外国=がいこく 学校=がっこう 学生=がくせい 寒い=さむい 漢字=かんじ 甘い=あまい 観る=みる 丸い=まるい 眼鏡=めがね 帰る=かえる 休み=やすみ 休む=やすむ 吸う=すう 牛肉=ぎゅうにく 牛乳=ぎゅうにゅう 去年=きょねん 居る=いる 強い=つよい 教室=きょうしつ 狭い=せまい 曲る=まがる 近い=ちかい 近く=ちかく 銀行=ぎんこう 九つ=ここのつ 九日=ここのか 靴下=くつした 兄弟=きょうだい 警官=けいかん 軽い=かるい 結構=けっこう 結婚=けっこん 嫌い=きらい 建物=たてもの 見る=みる 元気=げんき 玄関=げんかん 言う=いう 言葉=ことば 古い=ふるい 呼ぶ=よぶ 五つ=いつつ 五日=いつか 午後=ごご 午前=ごぜん 後ろ=うしろ 御飯=ごはん 交番=こうばん 公園=こうえん 厚い=あつい 好き=すき 広い=ひろい 紅茶=こうちゃ 行く=いく 降る=ふる 高い=たかい 黒い=くろい 今月=こんげつ 今週=こんしゅう 今朝=けさ 今日=きょう 今年=ことし 今晩=こんばん 困る=こまる 差す=さす 砂糖=さとう 座る=すわる 細い=ほそい 財布=さいふ 咲く=さく 作る=つくる 作文=さくぶん 昨日=きのう 昨夜=ゆうべ 撮る=とる 雑誌=ざっし 三つ=みっつ 三日=みっか 散歩=さんぽ 仕事=しごと 使う=つかう 四つ=よっつ 四日=よっか 始め=はじめ 子供=こども 死ぬ=しぬ 字引=じびき 持つ=もつ 時々=ときどき 時間=じかん 時計=とけい 自分=じぶん 辞書=じしょ 七つ=ななつ 七日=なのか 質問=しつもん 写真=しゃしん 若い=わかい 弱い=よわい 取る=とる 手紙=てがみ 授業=じゅぎょう 終る=おわる 習う=ならう 住む=すむ 十日=とおか 重い=おもい 叔父=おじいさん 宿題=しゅくだい 出す=だす 出る=でる 出口=でぐち 初め=はじめ 暑い=あつい 書く=かく 少し=すこし 消す=けす 上手=じょうず 上着=うわぎ 丈夫=じょうぶ 乗る=のる 食堂=しょくどう 寝る=ねる 新聞=しんぶん 辛い=からい 吹く=ふく 晴れ=はれ 生徒=せいと 青い=あおい 静か=しずか 赤い=あかい 切る=きる 切手=きって 切符=きっぷ 先月=せんげつ 先週=せんしゅう 先生=せんせい 洗う=あらう 洗濯=せんたく 全部=ぜんぶ 掃除=そうじ 早い=はやい 走る=はしる 速い=はやい 多い=おおい 太い=ふとい 待つ=まつ 貸す=かす 台所=だいどころ 大学=だいがく 大人=おとな 大勢=おおぜい 大切=たいせつ 脱ぐ=ぬぐ 短い=みじかい 弾く=ひく 知る=しる 地図=ちず 置く=おく 遅い=おそい 茶色=ちゃいろ 着く=つく 着る=きる 長い=ながい 痛い=いたい 低い=ひくい 天気=てんき 貼る=はる 電気=でんき 電車=でんしゃ 電話=でんわ 渡す=わたす 渡る=わたる 登る=のぼる 働く=はたらく 動物=どうぶつ 同じ=おなじ 読む=よむ 豚肉=ぶたにく 曇り=くもり 曇る=くもる 二つ=ふたつ 二人=ふたり 二日=ふつか 入る=はいる 入口=いりぐち 熱い=あつい 背広=せびろ 買う=かう 売る=うる 伯父=おじいさん 白い=しろい 薄い=うすい 八つ=やっつ 八日=ようか 半分=はんぶん 煩い=うるさい 番号=ばんごう 飛ぶ=とぶ 病院=びょういん 病気=びょうき 部屋=へや 封筒=ふうとう 風邪=かぜ 文章=ぶんしょう 聞く=きく 並ぶ=ならぶ 返す=かえす 便利=べんり 勉強=べんきょう 歩く=あるく 帽子=ぼうし 本棚=ほんだな 磨く=みがく 毎月=まいげつ 毎週=まいしゅう 毎朝=まいあさ 毎日=まいにち 毎年=まいねん 毎晩=まいばん 名前=なまえ 明い=あかるい 明日=あした 鳴く=なく 問題=もんだい 野菜=やさい 友達=ともだち 有名=ゆうめい 遊ぶ=あそぶ 夕飯=ゆうはん 夕方=ゆうがた 洋服=ようふく 葉書=はがき 要る=いる 来る=くる 来月=らいげつ 来週=らいしゅう 来年=らいねん 頼む=たのむ 立つ=たつ 旅行=りょこう 両親=りょうしん 料理=りょうり 練習=れんしゅう 廊下=ろうか 六つ=むっつ 六日=むいか 話す=はなす 飴=あめ 一=いち 右=みぎ 雨=あめ 駅=えき 塩=しお 横=よこ 下=した 何=なに 夏=なつ 家=いえ 暇=ひま 歌=うた 河=かわ 花=はな 海=うみ 絵=え 外=そと 角=かど 机=つくえ 魚=さかな 橋=はし 九=く 空=そら 靴=くつ 兄=あに 嫌=いや 犬=いぬ 戸=と 五=ご 後=あと 口=くち 国=くに 黒=くろ 今=いま 左=ひだり 三=さん 傘=かさ 山=やま 四=し 姉=あね 私=わたし 紙=かみ 歯=は 次=つぎ 耳=みみ 七=しち 車=くるま 手=て 秋=あき 十=じゅうとお 春=はる 所=ところ 女=おんな 上=うえ 色=いろ 人=ひと 水=みず 声=こえ 西=にし 青=あお 赤=あか 雪=ゆき 先=さき 千=せん 川=かわ 前=まえ 窓=まど 足=あし 村=むら 体=からだ 誰=だれ 男=おとこ 池=いけ 中=なか 昼=ひる 朝=あさ 町=まち 鳥=とり 庭=にわ 弟=おとうと 店=みせ 冬=ふゆ 東=ひがし 頭=あたま 道=みち 南=みなみ 二=に 肉=にく 猫=ねこ 年=とし 背=せ 白=しろ 箱=はこ 八=はち 半=はん 晩=ばん 鼻=はな 百=ひゃく 風=かぜ 服=ふく 物=もの 辺=へん 方=かた 北=きた 本=ほん 妹=いもうと 万=まん 木=き 目=め 門=もん 夜=よる 薬=くすり 卵=たまご 緑=みどり 隣=となり 零=れい 六=ろく 話=はなし",
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

function buildKanjiReadingsByFirstCharacter(source: string): Map<string, Array<[string, string]>> {
  const grouped = new Map<string, Array<[string, string]>>();
  for (const pair of source.split(/\s+/).filter(Boolean)) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) continue;
    const kanji = pair.slice(0, separatorIndex);
    const reading = pair.slice(separatorIndex + 1);
    if (!kanji || !reading) continue;
    const firstCharacter = kanji[0];
    const bucket = grouped.get(firstCharacter) ?? [];
    bucket.push([kanji, reading]);
    grouped.set(firstCharacter, bucket);
  }
  for (const bucket of grouped.values()) {
    bucket.sort(
      (left, right) => right[0].length - left[0].length || left[0].localeCompare(right[0], "ja"),
    );
  }
  return grouped;
}

function longestKanjiReading(text: string): [string, string] | null {
  const firstCharacter = text[0];
  if (!firstCharacter) return null;
  const bucket = KANJI_READINGS.get(firstCharacter);
  if (!bucket) return null;
  return bucket.find(([kanji]) => text.startsWith(kanji)) ?? null;
}

function replaceKanjiWithReadings(text: string): string {
  if (!hasKanjiCharacter(text)) return text;
  let remaining = text;
  let replaced = "";
  while (remaining.length > 0) {
    const kanjiMatch = hasKanjiCharacter(remaining[0]) ? longestKanjiReading(remaining) : null;
    if (kanjiMatch) {
      replaced += kanjiMatch[1];
      remaining = remaining.slice(kanjiMatch[0].length);
      continue;
    }
    replaced += remaining[0];
    remaining = remaining.slice(1);
  }
  return replaced;
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

      if (TRAILING_AUXILIARIES.includes(matched)) {
        tokens.push({ kana: matched });
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
    if (!consumed) return null;
    if (hasKanjiCharacter(consumed)) {
      const reading = replaceKanjiWithReadings(consumed);
      if (!reading || hasKanjiCharacter(reading)) return null;
      pushKanaToken(tokens, reading, { glueHonorific: true, fromKanji: true });
      continue;
    }
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
  const source = replaceKanjiWithReadings(kana.trim());
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
