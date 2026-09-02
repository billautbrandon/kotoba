export type User = {
  id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
  display_name: string | null;
  is_admin: number;
  xp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  created_at: string;
};

export type WordExample = {
  jp: string;
  kana: string;
  fr: string;
};

export type Word = {
  id: number;
  french: string;
  romaji: string | null;
  kana: string | null;
  kanji: string | null;
  note: string | null;
  examples: WordExample[];
  created_at: string;
};

export type Tag = {
  id: number;
  name: string;
  created_at: string;
};

export type WordWithStats = Word & {
  success_count: number;
  partial_count: number;
  fail_count: number;
  score: number;
  last_reviewed_at: string | null;
  consecutive_success_count: number;
};

export type WordWithTags = Word & {
  tags: Tag[];
};

export type WordWithStatsAndTags = WordWithStats & {
  tags: Tag[];
};

export type ReviewResult = "success" | "partial" | "fail";

async function safeJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Réponse invalide du serveur (${response.status}). Réessayez.`);
  }
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    const payload = JSON.parse(text) as { error?: string; detail?: string };
    if (payload.error) return payload.error;
    if (payload.detail) return payload.detail;
  } catch {
    // response body wasn't JSON
  }
  return fallback;
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const message = await extractErrorMessage(response, `Erreur serveur (${response.status})`);
    throw new Error(message);
  }
  return safeJson<T>(response);
}

async function apiPost<T = void>(url: string, body?: unknown, errorFallback?: string): Promise<T> {
  const options: RequestInit = { method: "POST", credentials: "include" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await extractErrorMessage(
      response,
      errorFallback ?? `Erreur serveur (${response.status})`,
    );
    throw new Error(message);
  }
  return safeJson<T>(response);
}

async function apiPut<T = void>(url: string, body: unknown, errorFallback?: string): Promise<T> {
  const response = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await extractErrorMessage(
      response,
      errorFallback ?? `Erreur serveur (${response.status})`,
    );
    throw new Error(message);
  }
  return safeJson<T>(response);
}

async function apiDelete(url: string, errorFallback?: string): Promise<void> {
  const response = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!response.ok) {
    const message = await extractErrorMessage(
      response,
      errorFallback ?? `Erreur serveur (${response.status})`,
    );
    throw new Error(message);
  }
}

export async function fetchMe(): Promise<User> {
  const payload = await apiGet<{ user: User }>("/api/auth/me");
  return payload.user;
}

export async function registerUser(username: string, password: string): Promise<User> {
  const payload = await apiPost<{ user: User }>("/api/auth/register", { username, password });
  return payload.user;
}

export async function loginUser(
  username: string,
  password: string,
  rememberMe?: boolean,
): Promise<User> {
  const payload = await apiPost<{ user: User }>("/api/auth/login", {
    username,
    password,
    rememberMe: rememberMe ?? false,
  });
  return payload.user;
}

export async function logoutUser(): Promise<void> {
  await apiPost("/api/auth/logout");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiPost("/api/auth/change-password", { currentPassword, newPassword });
}

export async function updateProfile(profile: {
  email?: string | null;
  display_name?: string | null;
}): Promise<User> {
  const payload = await apiPut<{ user: User }>("/api/auth/profile", profile);
  return payload.user;
}

export async function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch("/api/auth/avatar", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    const message = await extractErrorMessage(response, "Erreur lors de l'upload de l'avatar");
    throw new Error(message);
  }
  const payload = await safeJson<{ user: User }>(response);
  return payload.user;
}

export async function fetchWords(includeStats: boolean): Promise<WordWithStats[] | Word[]> {
  const payload = await apiGet<{ words: WordWithStats[] | Word[] }>(
    `/api/words?includeStats=${includeStats ? "1" : "0"}&includeTags=0`,
  );
  return payload.words;
}

export async function fetchWordsWithTags(
  includeStats: boolean,
): Promise<WordWithTags[] | WordWithStatsAndTags[]> {
  const payload = await apiGet<{ words: WordWithTags[] | WordWithStatsAndTags[] }>(
    `/api/words?includeStats=${includeStats ? "1" : "0"}&includeTags=1`,
  );
  return payload.words;
}

export async function fetchDifficultWords(): Promise<WordWithStats[]> {
  const payload = await apiGet<{ words: WordWithStats[] }>("/api/words/difficult");
  return payload.words;
}

export type SrsWords = {
  hard: WordWithStats[];
  medium: WordWithStats[];
  easy: WordWithStats[];
  mastered: WordWithStats[];
};

export async function fetchSrsWords(): Promise<SrsWords> {
  return apiGet<SrsWords>("/api/srs/words");
}

export async function fetchDueWords(
  limit?: number | null,
): Promise<{ words: WordWithStats[]; dueCount: number }> {
  if (limit && limit > 0) {
    return apiGet<{ words: WordWithStats[]; dueCount: number }>(`/api/srs/due?limit=${limit}`);
  }
  return apiGet<{ words: WordWithStats[]; dueCount: number }>("/api/srs/due");
}

export type SrsSummary = {
  dueCount: number;
  newCount: number;
  learningCount: number;
  graduatedCount: number;
  masteredCount: number;
};

export async function fetchSrsSummary(): Promise<SrsSummary> {
  return apiGet<SrsSummary>("/api/srs/summary");
}

export type StreakInfo = {
  currentStreak: number;
  todayReviews: number;
  dailyGoal: number;
  xp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
};

export async function fetchStreak(): Promise<StreakInfo> {
  return apiGet<StreakInfo>("/api/stats/streak");
}

export async function updateDailyGoal(dailyGoal: number): Promise<void> {
  await apiPut("/api/settings/daily-goal", { dailyGoal });
}

export type StatsOverview = {
  totalWords: number;
  masteredCount: number;
  totalReviews: number;
  avgSuccessRate: number;
  activeSince: string | null;
};

export async function fetchStatsOverview(): Promise<StatsOverview> {
  return apiGet<StatsOverview>("/api/stats/overview");
}

export type ActivityDay = { activity_date: string; reviews_count: number };

export async function fetchActivityData(): Promise<{ activity: ActivityDay[] }> {
  return apiGet<{ activity: ActivityDay[] }>("/api/stats/activity");
}

export async function fetchSeries(): Promise<
  Array<{
    tagId: number;
    tagName: string;
    wordsCount: number;
    totalScore: number;
    lastReviewedAt: string | null;
  }>
> {
  const payload = await apiGet<{
    series: Array<{
      tagId: number;
      tagName: string;
      wordsCount: number;
      totalScore: number;
      lastReviewedAt: string | null;
    }>;
  }>("/api/series");
  return payload.series;
}

export async function fetchSeriesWords(tagId: number): Promise<WordWithStats[]> {
  const payload = await apiGet<{ words: WordWithStats[] }>(`/api/series/${tagId}/words`);
  return payload.words;
}

export async function fetchSeriesWordsByTagIds(tagIds: number[]): Promise<WordWithStats[]> {
  const uniqueTagIds = [...new Set(tagIds.filter((tagId) => Number.isInteger(tagId) && tagId > 0))];
  if (uniqueTagIds.length === 0) return [];
  if (uniqueTagIds.length === 1) return fetchSeriesWords(uniqueTagIds[0]);
  const params = new URLSearchParams();
  params.set("tagIds", uniqueTagIds.join(","));
  const payload = await apiGet<{ words: WordWithStats[] }>(
    `/api/series/words?${params.toString()}`,
  );
  return payload.words;
}

export async function fetchTags(): Promise<Tag[]> {
  const payload = await apiGet<{ tags: Tag[] }>("/api/tags");
  return payload.tags;
}

export async function createTag(name: string): Promise<Tag> {
  const payload = await apiPost<{ tag: Tag }>("/api/tags", { name });
  return payload.tag;
}

export async function deleteTag(tagId: number): Promise<void> {
  await apiDelete(`/api/tags/${tagId}`);
}

export async function resetTagWordScores(tagId: number): Promise<{ resetCount: number }> {
  return await apiPost<{ success: boolean; resetCount: number }>(`/api/tags/${tagId}/reset-scores`);
}

export async function createWord(word: {
  french: string;
  romaji?: string | null;
  kana?: string | null;
  kanji?: string | null;
  note?: string | null;
  examples?: WordExample[];
  tagIds?: number[];
}): Promise<Word> {
  const payload = await apiPost<{ word: Word }>("/api/words", word);
  return payload.word;
}

export async function updateWord(
  id: number,
  word: {
    french: string;
    romaji?: string | null;
    kana?: string | null;
    kanji?: string | null;
    note?: string | null;
    examples?: WordExample[];
    tagIds?: number[];
  },
): Promise<Word> {
  const payload = await apiPut<{ word: Word }>(`/api/words/${id}`, word);
  return payload.word;
}

export async function deleteWord(id: number): Promise<void> {
  await apiDelete(`/api/words/${id}`);
}

export async function resetAllWordScores(): Promise<void> {
  await apiPost("/api/words/reset-scores");
}

export async function fetchAdminUsers(): Promise<User[]> {
  const payload = await apiGet<{ users: User[] }>("/api/admin/users");
  return payload.users;
}

export async function deleteAdminUser(userId: number): Promise<void> {
  await apiDelete(`/api/admin/users/${userId}`);
}

export type BadgeDefinition = {
  id: string;
  category: string;
  title: string;
  description: string;
  icon: string;
  condition_type: string;
  condition_value: number | null;
  earned_at: string | null;
};

export type XpAward = {
  xpGained: number;
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  leveledUp: boolean;
  combo?: number;
  perfectSession?: boolean;
};

export async function submitReview(wordId: number, result: ReviewResult): Promise<void> {
  await apiPost("/api/reviews", { wordId, result });
}

export class BulkReviewsError extends Error {
  status: number;
  isAuthError: boolean;
  isRetryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BulkReviewsError";
    this.status = status;
    this.isAuthError = status === 401;
    this.isRetryable = !this.isAuthError && (status === 0 || status >= 500 || status === 408);
  }
}

async function submitBulkReviewsOnce(
  reviews: Array<{ wordId: number; result: ReviewResult }>,
  noHit?: "clear" | "broken",
): Promise<{ appliedCount: number; newBadges: BadgeDefinition[] } & XpAward> {
  let response: Response;
  try {
    response = await fetch("/api/reviews/bulk", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviews, noHit }),
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : "Erreur réseau inconnue";
    throw new BulkReviewsError(`Erreur réseau : ${message}`, 0);
  }
  if (!response.ok) {
    const errorMessage = await extractErrorMessage(
      response,
      `Le serveur a renvoyé une erreur ${response.status}.`,
    );
    throw new BulkReviewsError(errorMessage, response.status);
  }
  return safeJson<{ appliedCount: number; newBadges: BadgeDefinition[] } & XpAward>(response);
}

export async function submitBulkReviews(
  reviews: Array<{ wordId: number; result: ReviewResult }>,
  options: { maxAttempts?: number; noHit?: "clear" | "broken" } = {},
): Promise<{ appliedCount: number; newBadges: BadgeDefinition[] } & XpAward> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await submitBulkReviewsOnce(reviews, options.noHit);
    } catch (error) {
      lastError = error;
      if (!(error instanceof BulkReviewsError) || !error.isRetryable) {
        throw error;
      }
      if (attempt < maxAttempts) {
        const backoffMs = 300 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to submit bulk reviews");
}

export async function exportBackup(): Promise<unknown> {
  return apiGet<unknown>("/api/export");
}

export async function importWordsFromJson(
  words: Array<{
    french: string;
    romaji?: string | null;
    kana?: string | null;
    kanji?: string | null;
    note?: string | null;
    examples?: WordExample[];
    tags?: string[];
  }>,
): Promise<{ importedWordsCount: number; importedTagsCount: number }> {
  return apiPost<{ importedWordsCount: number; importedTagsCount: number }>("/api/import", {
    words,
  });
}

export type GenerateWordsFromListResult = {
  createdCount: number;
  skippedCount: number;
  errors: string[];
  tag: Tag;
  quota?: GeminiQuota;
};

export async function generateWordsFromList(
  tagName: string,
  words: string[],
): Promise<GenerateWordsFromListResult> {
  return apiPost<GenerateWordsFromListResult>("/api/words/generate-from-list", {
    tagName,
    words,
  });
}

// --- Phrases AI ---

export type GeminiQuota = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

export async function fetchGeminiQuota(): Promise<GeminiQuota> {
  return apiGet<GeminiQuota>("/api/phrases/quota");
}

export type PhraseConstraints = {
  tagIds: number[];
  particles: string[];
  tense: "present" | "past" | "te-form";
  polarity: "affirmative" | "negative";
  politeness: "casual" | "polite";
  count: number;
  customContext?: string;
  direction?: "fr-to-jp" | "jp-to-fr";
  contentType?: "phrases" | "paragraph";
  withKanji?: boolean;
  sentenceLength?: "short" | "medium" | "long";
  vocabSampleSize?: number;
};

export type GeneratedPhrase = {
  fr: string;
  jp_kanji: string;
  jp_kana: string;
  explanation: string;
  wordIds: number[];
};

export type PhraseEvaluation = {
  isCorrect: boolean;
  retryable?: boolean;
  hint?: string | null;
  feedback: string | null;
  errorType: "particle" | "conjugation" | "kanji" | "other" | null;
  xpAward?: XpAward | null;
};

export async function generatePhrases(constraints: PhraseConstraints): Promise<GeneratedPhrase[]> {
  const payload = await apiPost<{ phrases: GeneratedPhrase[] }>(
    "/api/phrases/generate",
    constraints,
    "Erreur lors de la génération des phrases",
  );
  return payload.phrases;
}

export async function evaluatePhrase(
  userAnswer: string,
  expectedAnswer: string,
  frenchSentence: string,
  direction: "fr-to-jp" | "jp-to-fr" = "fr-to-jp",
): Promise<PhraseEvaluation> {
  return apiPost<PhraseEvaluation>(
    "/api/phrases/evaluate",
    { userAnswer, expectedAnswer, frenchSentence, direction },
    "Erreur lors de l'évaluation",
  );
}

// --- Ask the teacher (any practice tab) ---

export type AskTeacherTurn = {
  question: string;
  answer: string;
};

export type AskTeacherParams = {
  question: string;
  prompt: string;
  expectedAnswer: string;
  userAnswer?: string;
  direction?: "fr-to-jp" | "jp-to-fr";
  mode?: "phrases" | "construction" | "jlpt" | "conjugaison" | "dialogue" | "ecoute";
  history?: AskTeacherTurn[];
};

export async function askTeacher(params: AskTeacherParams): Promise<{ answer: string }> {
  return apiPost<{ answer: string }>(
    "/api/practice/ask",
    params,
    "Erreur lors de la demande au professeur",
  );
}

// --- Construction (sentence builder) ---

export type ConstructionBlock = {
  text: string;
  furigana?: string;
};

export type ConstructionPhrase = {
  fr: string;
  jp_kanji: string;
  jp_kana: string;
  blocks_jp: ConstructionBlock[];
  blocks_fr: string[];
  explanation: string;
  wordIds: number[];
};

export type ConstructionConstraints = Omit<PhraseConstraints, "contentType" | "withKanji">;

export async function generateConstructionPhrases(
  constraints: ConstructionConstraints,
): Promise<ConstructionPhrase[]> {
  const payload = await apiPost<{ phrases: ConstructionPhrase[] }>(
    "/api/construction/generate",
    constraints,
    "Erreur lors de la génération des blocs",
  );
  return payload.phrases;
}

// --- Dialogue exercises ---

export type DialogueScenario = "restaurant" | "voyage" | "famille" | "travail" | "ecole" | "libre";
export type DialogueDifficulty = "debutant" | "intermediaire";

export type DialogueConstraints = {
  tagIds: number[];
  scenario: DialogueScenario;
  difficulty: DialogueDifficulty;
  count: number;
  customContext?: string;
};

export type DialogueTurn = {
  context: string;
  fr: string;
  expected_jp: string;
  expected_kana: string;
  wordIds: number[];
};

export async function generateDialogue(constraints: DialogueConstraints): Promise<DialogueTurn[]> {
  const payload = await apiPost<{ turns: DialogueTurn[] }>(
    "/api/dialogue/generate",
    constraints,
    "Erreur lors de la génération du dialogue",
  );
  return payload.turns;
}

export async function evaluateDialogue(
  userTranscript: string,
  expectedJp: string,
  frenchPrompt: string,
  context?: string,
): Promise<PhraseEvaluation> {
  return apiPost<PhraseEvaluation>(
    "/api/dialogue/evaluate",
    { userTranscript, expectedJp, frenchPrompt, context },
    "Erreur lors de l'évaluation",
  );
}

// --- JLPT exercises ---

export type JlptConstraints = {
  exerciseType: "words" | "phrases" | "paragraph";
  direction: "fr-to-jp" | "jp-to-fr";
  withKanji: boolean;
  count: number;
  paragraphLength?: "short" | "medium" | "long";
  customContext?: string;
  level?: "N5" | "N4" | "N3" | "N2" | "N1";
};

export type JlptExercise = {
  prompt: string;
  answer: string;
  answerAlt?: string;
  explanation: string;
};

export async function generateJlptExercises(constraints: JlptConstraints): Promise<JlptExercise[]> {
  const payload = await apiPost<{ exercises: JlptExercise[] }>(
    "/api/jlpt/generate",
    constraints,
    "Erreur lors de la génération JLPT",
  );
  return payload.exercises;
}

export async function evaluateJlptAnswer(
  userAnswer: string,
  expectedAnswer: string,
  prompt: string,
  direction: "fr-to-jp" | "jp-to-fr",
): Promise<PhraseEvaluation> {
  return apiPost<PhraseEvaluation>(
    "/api/jlpt/evaluate",
    { userAnswer, expectedAnswer, prompt, direction },
    "Erreur lors de l'évaluation JLPT",
  );
}

// --- Keyboard mode batch correction ---

export type KeyboardAnswer = {
  wordId: number;
  french: string;
  kanji: string | null;
  kana: string | null;
  userInput1: string;
  userInput2: string;
  direction: "fr" | "jpn";
  promptField: "french" | "kana" | "kanji";
};

export type KeyboardCorrection = {
  wordId: number;
  rating: 1 | 2 | 3;
  correction: string;
};

export async function correctKeyboardAnswers(
  answers: KeyboardAnswer[],
): Promise<KeyboardCorrection[]> {
  return apiPost<KeyboardCorrection[]>(
    "/api/series/keyboard/correct",
    { answers },
    "Erreur lors de la correction",
  );
}

export function computeFailRate(word: WordWithStats): number {
  const attempts = word.success_count + word.partial_count + word.fail_count;
  if (attempts === 0) return 0;
  return word.fail_count / attempts;
}

export async function downloadMissingKanjiSvgs(): Promise<{
  success: boolean;
  total: number;
  downloaded: number;
  failed: number;
  missingCount: number;
}> {
  return apiPost<{
    success: boolean;
    total: number;
    downloaded: number;
    failed: number;
    missingCount: number;
  }>("/api/kanji/download-missing");
}

export async function downloadTagAudio(tagId: number, tagName: string): Promise<void> {
  const response = await fetch(`/api/tags/${tagId}/audio`, { credentials: "include" });
  if (!response.ok) {
    const message = await extractErrorMessage(response, "Erreur lors de la génération audio");
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${tagName}.mp3`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// --- Conjugation ---

export type ConjugationExercise = {
  verb: string;
  form: string;
  prompt: string;
  answer: string;
};

export type ConjugationEvaluation = {
  isCorrect: boolean;
  correctedAnswer: string;
  explanation: string;
  xpAward?: XpAward | null;
};

export async function generateConjugationExercises(
  words: { french: string; kana?: string; kanji?: string }[],
  forms: string[],
  count: number,
): Promise<{ exercises: ConjugationExercise[]; quota: GeminiQuota }> {
  return apiPost<{ exercises: ConjugationExercise[]; quota: GeminiQuota }>(
    "/api/conjugation/generate",
    { words, forms, count },
    "Erreur lors de la génération",
  );
}

export async function evaluateConjugation(
  prompt: string,
  expected: string,
  userAnswer: string,
): Promise<{ evaluation: ConjugationEvaluation; quota: GeminiQuota }> {
  const payload = await apiPost<{
    evaluation: ConjugationEvaluation;
    quota: GeminiQuota;
    xpAward?: XpAward | null;
  }>("/api/conjugation/evaluate", { prompt, expected, userAnswer }, "Erreur lors de l'évaluation");
  return {
    ...payload,
    evaluation: { ...payload.evaluation, xpAward: payload.xpAward ?? payload.evaluation.xpAward },
  };
}

// --- Badges ---

export async function fetchBadges(): Promise<BadgeDefinition[]> {
  const payload = await apiGet<{ badges: BadgeDefinition[] }>("/api/badges");
  return payload.badges;
}

export async function fetchRecentBadges(): Promise<BadgeDefinition[]> {
  const payload = await apiGet<{ badges: BadgeDefinition[] }>("/api/badges/recent");
  return payload.badges;
}

// --- Weak points ---

export type WeakPointsData = {
  byErrorType: Array<{ error_type: string; count: number }>;
  byMode: Array<{ exercise_mode: string; count: number }>;
  thisWeek: number;
  lastWeek: number;
};

export async function fetchWeakPoints(): Promise<WeakPointsData> {
  return apiGet<WeakPointsData>("/api/stats/weak-points");
}

// --- Saved phrases ---

export type SavedPhrase = {
  id: number;
  french: string;
  japanese: string;
  japanese_kana: string | null;
  explanation: string | null;
  source: string;
  word_ids: string | null;
  srs_step: number;
  srs_interval: number;
  srs_ease_factor: number;
  srs_next_review_at: string | null;
  success_count: number;
  fail_count: number;
  last_reviewed_at: string | null;
  created_at: string;
};

export async function fetchSavedPhrases(source?: string): Promise<SavedPhrase[]> {
  const url = source
    ? `/api/saved-phrases?source=${encodeURIComponent(source)}`
    : "/api/saved-phrases";
  const payload = await apiGet<{ phrases: SavedPhrase[] }>(url);
  return payload.phrases;
}

export async function fetchDuePhrases(): Promise<{ phrases: SavedPhrase[]; dueCount: number }> {
  return apiGet<{ phrases: SavedPhrase[]; dueCount: number }>("/api/saved-phrases/due");
}

export async function savePhrase(phrase: {
  french: string;
  japanese: string;
  japanese_kana?: string;
  explanation?: string;
  source: string;
  word_ids?: number[];
}): Promise<{ id: number; newBadges: BadgeDefinition[] }> {
  return apiPost<{ id: number; newBadges: BadgeDefinition[] }>("/api/saved-phrases", phrase);
}

export async function reviewSavedPhrase(
  phraseId: number,
  result: "success" | "fail",
): Promise<void> {
  await apiPost(`/api/saved-phrases/${phraseId}/review`, { result });
}

export async function deleteSavedPhrase(phraseId: number): Promise<void> {
  await apiDelete(`/api/saved-phrases/${phraseId}`);
}

// --- Grammar notes ---

export type GrammarNote = {
  id: number;
  topic: string;
  content: string;
  error_type: string | null;
  view_count: number;
  created_at: string;
};

export async function fetchGrammarNote(topic: string): Promise<GrammarNote> {
  const payload = await apiGet<{ note: GrammarNote }>(
    `/api/grammar/note?topic=${encodeURIComponent(topic)}`,
  );
  return payload.note;
}

export async function fetchGrammarNotes(): Promise<GrammarNote[]> {
  const payload = await apiGet<{ notes: GrammarNote[] }>("/api/grammar/notes");
  return payload.notes;
}

export async function deleteGrammarNote(noteId: number): Promise<void> {
  await apiDelete(`/api/grammar/notes/${noteId}`);
}

// --- Daily challenge ---

export type DailyChallenge = {
  id: number;
  challenge_date: string;
  challenge_type: string;
  challenge_data: { prompt: string; answer: string; hint?: string; wordId?: number };
  completed: number;
  is_correct: number | null;
};

export async function fetchDailyChallenge(): Promise<DailyChallenge | null> {
  const payload = await apiGet<{ challenge: DailyChallenge | null }>("/api/daily-challenge");
  return payload.challenge;
}

export async function submitDailyChallenge(
  answer: string,
): Promise<{ isCorrect: boolean; expectedAnswer: string; newBadges: BadgeDefinition[] } & XpAward> {
  return apiPost<
    { isCorrect: boolean; expectedAnswer: string; newBadges: BadgeDefinition[] } & XpAward
  >("/api/daily-challenge/submit", { answer });
}

// --- Listening / Dictée ---

export type ListeningExercise = {
  japanese: string;
  japanese_kana: string;
  french: string;
  wordIds: number[];
};

export async function generateListeningExercises(constraints: {
  tagIds: number[];
  difficulty: "debutant" | "intermediaire";
  count: number;
}): Promise<{ exercises: ListeningExercise[]; quota: GeminiQuota }> {
  return apiPost<{ exercises: ListeningExercise[]; quota: GeminiQuota }>(
    "/api/listening/generate",
    constraints,
    "Erreur lors de la génération des exercices d'écoute",
  );
}

export async function evaluateListening(
  userTranscript: string,
  expectedJapanese: string,
  frenchTranslation: string,
): Promise<PhraseEvaluation> {
  return apiPost<PhraseEvaluation>(
    "/api/listening/evaluate",
    { userTranscript, expectedJapanese, frenchTranslation },
    "Erreur lors de l'évaluation",
  );
}

// --- Reading / Lecture ---

export type ReadingParagraph = {
  japanese: string;
  french: string;
  words: Array<{ text: string; reading: string; meaning: string }>;
};

export type ReadingQuestion = {
  question: string;
  answer: string;
};

export type ReadingData = {
  paragraphs: ReadingParagraph[];
  questions: ReadingQuestion[];
  quota: GeminiQuota;
};

export async function generateReading(constraints: {
  tagIds: number[];
  difficulty: "debutant" | "intermediaire";
  length: "short" | "medium" | "long";
}): Promise<ReadingData> {
  return apiPost<ReadingData>(
    "/api/reading/generate",
    constraints,
    "Erreur lors de la génération du texte",
  );
}

export async function checkReadingAnswer(
  question: string,
  expectedAnswer: string,
  userAnswer: string,
): Promise<{ isCorrect: boolean; feedback: string }> {
  return apiPost<{ isCorrect: boolean; feedback: string }>(
    "/api/reading/check-answer",
    { question, expectedAnswer, userAnswer },
    "Erreur lors de l'évaluation",
  );
}
