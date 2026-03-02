export type User = {
  id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
  display_name: string | null;
  is_admin: number;
  created_at: string;
};

export type Word = {
  id: number;
  french: string;
  romaji: string | null;
  kana: string | null;
  kanji: string | null;
  note: string | null;
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
  consecutive_success_count?: number;
};

export type WordWithTags = Word & {
  tags: Tag[];
};

export type WordWithStatsAndTags = WordWithStats & {
  tags: Tag[];
};

export type ReviewResult = "success" | "partial" | "fail";

export async function fetchMe(): Promise<User> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Not authenticated");
  }
  const payload = (await response.json()) as { user: User };
  return payload.user;
}

export async function registerUser(username: string, password: string): Promise<User> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error("Failed to register");
  }
  const payload = (await response.json()) as { user: User };
  return payload.user;
}

export async function loginUser(
  username: string,
  password: string,
  rememberMe?: boolean,
): Promise<User> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, rememberMe: rememberMe ?? false }),
  });
  if (!response.ok) {
    throw new Error("Failed to login");
  }
  const payload = (await response.json()) as { user: User };
  return payload.user;
}

export async function logoutUser(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to logout");
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? "Failed to change password");
  }
}

export async function updateProfile(profile: {
  email?: string | null;
  display_name?: string | null;
}): Promise<User> {
  const response = await fetch("/api/auth/profile", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? "Failed to update profile");
  }
  const payload = (await response.json()) as { user: User };
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
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? "Failed to upload avatar");
  }
  const payload = (await response.json()) as { user: User };
  return payload.user;
}

export async function fetchWords(includeStats: boolean): Promise<WordWithStats[] | Word[]> {
  const response = await fetch(
    `/api/words?includeStats=${includeStats ? "1" : "0"}&includeTags=0`,
    {
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to fetch words");
  }
  const payload = (await response.json()) as { words: unknown };
  return payload.words as WordWithStats[] | Word[];
}

export async function fetchWordsWithTags(
  includeStats: boolean,
): Promise<WordWithTags[] | WordWithStatsAndTags[]> {
  const response = await fetch(
    `/api/words?includeStats=${includeStats ? "1" : "0"}&includeTags=1`,
    {
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new Error("Failed to fetch words");
  }
  const payload = (await response.json()) as { words: unknown };
  return payload.words as WordWithTags[] | WordWithStatsAndTags[];
}

export async function fetchDifficultWords(): Promise<WordWithStats[]> {
  const response = await fetch("/api/words/difficult", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch difficult words");
  }
  const payload = (await response.json()) as { words: WordWithStats[] };
  return payload.words;
}

export type SrsWords = {
  hard: WordWithStats[];
  medium: WordWithStats[];
  easy: WordWithStats[];
  mastered: WordWithStats[];
};

export async function fetchSrsWords(): Promise<SrsWords> {
  const response = await fetch("/api/srs/words", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch SRS words");
  }
  return (await response.json()) as SrsWords;
}

export async function fetchSeries(): Promise<
  Array<{ tagId: number; tagName: string; wordsCount: number; totalScore: number }>
> {
  const response = await fetch("/api/series", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch series");
  }
  const payload = (await response.json()) as {
    series: Array<{ tagId: number; tagName: string; wordsCount: number; totalScore: number }>;
  };
  return payload.series;
}

export async function fetchSeriesWords(tagId: number): Promise<WordWithStats[]> {
  const response = await fetch(`/api/series/${tagId}/words`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch series words");
  }
  const payload = (await response.json()) as { words: WordWithStats[] };
  return payload.words;
}

export async function fetchTags(): Promise<Tag[]> {
  const response = await fetch("/api/tags", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch tags");
  }
  const payload = (await response.json()) as { tags: Tag[] };
  return payload.tags;
}

export async function createTag(name: string): Promise<Tag> {
  const response = await fetch("/api/tags", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to create tag");
  }
  const payload = (await response.json()) as { tag: Tag };
  return payload.tag;
}

export async function deleteTag(tagId: number): Promise<void> {
  const response = await fetch(`/api/tags/${tagId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to delete tag");
  }
}

export async function createWord(word: {
  french: string;
  romaji?: string | null;
  kana?: string | null;
  kanji?: string | null;
  note?: string | null;
  tagIds?: number[];
}): Promise<Word> {
  const response = await fetch("/api/words", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(word),
  });
  if (!response.ok) {
    throw new Error("Failed to create word");
  }
  const payload = (await response.json()) as { word: Word };
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
    tagIds?: number[];
  },
): Promise<Word> {
  const response = await fetch(`/api/words/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(word),
  });
  if (!response.ok) {
    throw new Error("Failed to update word");
  }
  const payload = (await response.json()) as { word: Word };
  return payload.word;
}

export async function deleteWord(id: number): Promise<void> {
  const response = await fetch(`/api/words/${id}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to delete word");
  }
}

export async function resetAllWordScores(): Promise<void> {
  const response = await fetch("/api/words/reset-scores", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to reset word scores");
  }
}

export async function fetchAdminUsers(): Promise<User[]> {
  const response = await fetch("/api/admin/users", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }
  const payload = (await response.json()) as { users: User[] };
  return payload.users;
}

export async function deleteAdminUser(userId: number): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? "Failed to delete user");
  }
}

export async function submitReview(wordId: number, result: ReviewResult): Promise<void> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordId, result }),
  });
  if (!response.ok) {
    throw new Error("Failed to submit review");
  }
}

export async function submitBulkReviews(
  reviews: Array<{ wordId: number; result: ReviewResult }>,
): Promise<{ appliedCount: number }> {
  const response = await fetch("/api/reviews/bulk", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviews }),
  });
  if (!response.ok) {
    throw new Error("Failed to submit bulk reviews");
  }
  return (await response.json()) as { appliedCount: number };
}

export async function exportBackup(): Promise<unknown> {
  const response = await fetch("/api/export", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to export backup");
  }
  return await response.json();
}

export async function importWordsFromJson(
  words: Array<{
    french: string;
    romaji?: string | null;
    kana?: string | null;
    kanji?: string | null;
    note?: string | null;
    tags?: string[];
  }>,
): Promise<{ importedWordsCount: number; importedTagsCount: number }> {
  const response = await fetch("/api/import", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });
  if (!response.ok) {
    throw new Error("Failed to import words");
  }
  return (await response.json()) as { importedWordsCount: number; importedTagsCount: number };
}

// --- Phrases AI ---

export type GeminiQuota = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

export async function fetchGeminiQuota(): Promise<GeminiQuota> {
  const response = await fetch("/api/phrases/quota", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch quota");
  }
  return (await response.json()) as GeminiQuota;
}

export type PhraseConstraints = {
  tagIds: number[];
  particles: string[];
  tense: "present" | "past" | "te-form";
  polarity: "affirmative" | "negative";
  politeness: "casual" | "polite";
  count: number;
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
  feedback: string | null;
  errorType: "particle" | "conjugation" | "kanji" | "other" | null;
};

export async function generatePhrases(constraints: PhraseConstraints): Promise<GeneratedPhrase[]> {
  const response = await fetch("/api/phrases/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(constraints),
  });
  if (!response.ok) {
    const errorPayload = (await response.json()) as { error?: string };
    throw new Error(errorPayload.error ?? "Erreur lors de la génération des phrases");
  }
  const payload = (await response.json()) as { phrases: GeneratedPhrase[] };
  return payload.phrases;
}

export async function evaluatePhrase(
  userAnswer: string,
  expectedAnswer: string,
  frenchSentence: string,
): Promise<PhraseEvaluation> {
  const response = await fetch("/api/phrases/evaluate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAnswer, expectedAnswer, frenchSentence }),
  });
  if (!response.ok) {
    const errorPayload = (await response.json()) as { error?: string };
    throw new Error(errorPayload.error ?? "Erreur lors de l'évaluation");
  }
  return (await response.json()) as PhraseEvaluation;
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
  const response = await fetch("/api/series/keyboard/correct", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!response.ok) {
    const errorPayload = (await response.json()) as { error?: string };
    throw new Error(errorPayload.error ?? "Erreur lors de la correction");
  }
  return (await response.json()) as KeyboardCorrection[];
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
  const response = await fetch("/api/kanji/download-missing", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to download missing kanji SVGs");
  }
  return (await response.json()) as {
    success: boolean;
    total: number;
    downloaded: number;
    failed: number;
    missingCount: number;
  };
}
