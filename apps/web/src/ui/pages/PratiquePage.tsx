import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BulkReviewsError,
  type ConjugationEvaluation,
  type ConjugationExercise,
  type ConstructionBlock,
  type GeminiQuota,
  type GeneratedPhrase,
  type GrammarNote,
  type JlptConstraints,
  type JlptExercise,
  type ListeningExercise,
  type PhraseConstraints,
  type PhraseEvaluation,
  type PracticeReview,
  type Tag,
  createTag,
  createWord,
  evaluateConjugation,
  evaluateJlptAnswer,
  evaluateListening,
  evaluatePhrase,
  fetchGeminiQuota,
  fetchGrammarNote,
  fetchSeriesWords,
  fetchTags,
  flattenPracticeReview,
  generateConjugationExercises,
  generateConstructionPhrases,
  generateJlptExercises,
  generateListeningExercises,
  generatePhrases,
  practiceReviewFromEvaluation,
  savePhrase,
  submitBulkReviews,
} from "../../api";
import { AnswerDiff } from "../components/AnswerDiff";
import { AudioButton } from "../components/AudioButton";
import { PillNav } from "../components/PillNav";
import { QuotaBar } from "../components/QuotaBar";
import { SearchBar } from "../components/SearchBar";
import { SentenceBuilder, joinBlocks } from "../components/SentenceBuilder";
import { TeacherChat } from "../components/TeacherChat";
import { VoiceButton } from "../components/VoiceButton";
import { hasJapaneseScript } from "../utils/kanaToRomaji";

type PratiqueTab = "phrases" | "jlpt" | "conjugaison" | "construction" | "ecoute";
type HubMode = "phrases" | "jlpt" | "conjugaison";
type PhraseStyle = "write" | "blocks" | "story";
type PratiquePhase = "hub" | "setup" | "training" | "recap";
type SentenceLength = "short" | "medium" | "long";
type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const JLPT_LEVEL_HINTS: Record<JlptLevel, string> = {
  N5: "Bases du quotidien.",
  N4: "Élémentaire.",
  N3: "Intermédiaire.",
  N2: "Avancé.",
  N1: "Expert.",
};
const JLPT_LEVEL_KEY = "kotoba.jlptLevel";

const PRATIQUE_PILLS: Array<{ id: HubMode; label: string; hint: string }> = [
  { id: "phrases", label: "Phrases", hint: "Avec tes mots" },
  { id: "jlpt", label: "JLPT", hint: "N5 à N1" },
  { id: "conjugaison", label: "Conjugaison", hint: "Tes verbes" },
];

function loadJlptLevel(): JlptLevel {
  const stored = window.localStorage.getItem(JLPT_LEVEL_KEY);
  if (stored === "N5" || stored === "N4" || stored === "N3" || stored === "N2" || stored === "N1") {
    return stored;
  }
  return "N5";
}

function saveJlptLevel(level: JlptLevel) {
  window.localStorage.setItem(JLPT_LEVEL_KEY, level);
}

const PHRASES_SETTINGS_KEY = "kotoba.phrasesSettings.v1";

type PersistedPhrasesSettings = {
  selectedTagIds: number[];
  selectedParticles: string[];
  tense: PhraseConstraints["tense"];
  polarity: PhraseConstraints["polarity"];
  politeness: PhraseConstraints["politeness"];
  phraseCount: number;
  customContext: string;
  direction: "fr-to-jp" | "jp-to-fr";
  contentType: "phrases" | "paragraph";
  withKanji: boolean;
  sentenceLength: SentenceLength;
  vocabSampleSize: number;
  phraseStyle: PhraseStyle;
};

function isPratiqueTab(value: string | null): value is PratiqueTab {
  return (
    value === "phrases" ||
    value === "jlpt" ||
    value === "conjugaison" ||
    value === "construction" ||
    value === "ecoute"
  );
}

function isPhraseStyle(value: unknown): value is PhraseStyle {
  return value === "write" || value === "blocks" || value === "story";
}

function sessionTabForPhraseStyle(style: PhraseStyle): PratiqueTab {
  return style === "blocks" ? "construction" : "phrases";
}

function resolvePhraseStyle(
  tabFromUrl: string | null,
  persisted: Partial<PersistedPhrasesSettings> | null,
): PhraseStyle {
  if (tabFromUrl === "construction") return "blocks";
  if (tabFromUrl === "phrases") {
    if (persisted?.phraseStyle === "story" || persisted?.contentType === "paragraph") {
      return "story";
    }
    return "write";
  }
  if (isPhraseStyle(persisted?.phraseStyle)) return persisted.phraseStyle;
  if (persisted?.contentType === "paragraph") return "story";
  return "write";
}

function loadPhrasesSettings(): Partial<PersistedPhrasesSettings> | null {
  try {
    const raw = window.localStorage.getItem(PHRASES_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedPhrasesSettings>;
  } catch {
    return null;
  }
}

function savePhrasesSettings(settings: PersistedPhrasesSettings): void {
  try {
    window.localStorage.setItem(PHRASES_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors (quota, privacy mode, etc.)
  }
}

const AVAILABLE_PARTICLES = ["は", "が", "を", "に", "で", "へ", "と", "も", "から", "まで"];

const TENSE_OPTIONS: Array<{ value: PhraseConstraints["tense"]; label: string }> = [
  { value: "present", label: "Présent" },
  { value: "past", label: "Passé" },
  { value: "te-form", label: "Forme -te" },
];

const POLARITY_OPTIONS: Array<{ value: PhraseConstraints["polarity"]; label: string }> = [
  { value: "affirmative", label: "Affirmatif" },
  { value: "negative", label: "Négatif" },
];

const POLITENESS_OPTIONS: Array<{ value: PhraseConstraints["politeness"]; label: string }> = [
  { value: "casual", label: "Courant" },
  { value: "polite", label: "Poli" },
];

const CONJUGATION_FORMS = [
  "forme polie (ます)",
  "forme négative (ない)",
  "forme passée (た)",
  "forme -te (て)",
  "forme potentielle",
  "forme volitif (よう)",
  "forme conditionnelle (ば)",
  "forme impérative",
  "forme passive",
  "forme causative",
];

const CORE_CONJUGATION_FORMS = CONJUGATION_FORMS.slice(0, 4);
const EXTRA_CONJUGATION_FORMS = CONJUGATION_FORMS.slice(4);

const ERROR_TYPE_LABELS: Record<string, string> = {
  particle: "Particule",
  conjugation: "Conjugaison",
  kanji: "Kanji",
  kana: "Kana",
  vocabulary: "Vocabulaire",
  grammar: "Grammaire",
  meaning: "Sens",
  pronunciation: "Prononciation",
  other: "Autre",
};

type UnifiedExercise = {
  prompt: string;
  answer: string;
  answerAlt?: string;
  explanation?: string;
  wordIds?: number[];
  frenchPrompt?: string;
  blocks?: ConstructionBlock[];
  blockSeparator?: string;
  direction?: "fr-to-jp" | "jp-to-fr";
};

type UnifiedResult = {
  exercise: UnifiedExercise;
  userAnswer: string;
  isCorrect: boolean | null;
  feedback?: string | null;
};

export function PratiquePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const persistedPhrases = useMemo(() => loadPhrasesSettings(), []);
  const initialTab: PratiqueTab = isPratiqueTab(tabFromUrl) ? tabFromUrl : "phrases";
  const [activeTab, setActiveTab] = useState<PratiqueTab>(initialTab);
  const [phase, setPhase] = useState<PratiquePhase>("setup");
  const [phraseStyle, setPhraseStyle] = useState<PhraseStyle>(() =>
    resolvePhraseStyle(tabFromUrl, persistedPhrases),
  );

  // Shared state
  const [tags, setTags] = useState<Tag[]>([]);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);
  const [exercises, setExercises] = useState<UnifiedExercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [hasCheckedCurrent, setHasCheckedCurrent] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<string | null>(null);
  const [currentReview, setCurrentReview] = useState<PracticeReview | null>(null);
  const [currentErrorType, setCurrentErrorType] = useState<string | null>(null);
  const [currentIsCorrect, setCurrentIsCorrect] = useState<boolean | null>(null);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [isRetryingPhrase, setIsRetryingPhrase] = useState(false);
  const [phraseRetryUsed, setPhraseRetryUsed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Phrases state (restored from localStorage on first render)
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    persistedPhrases?.selectedTagIds ?? [],
  );
  const [selectedParticles, setSelectedParticles] = useState<string[]>(
    persistedPhrases?.selectedParticles ?? ["は", "が"],
  );
  const [tense, setTense] = useState<PhraseConstraints["tense"]>(
    persistedPhrases?.tense ?? "present",
  );
  const [polarity, setPolarity] = useState<PhraseConstraints["polarity"]>(
    persistedPhrases?.polarity ?? "affirmative",
  );
  const [politeness, setPoliteness] = useState<PhraseConstraints["politeness"]>(
    persistedPhrases?.politeness ?? "casual",
  );
  const [phraseCount, setPhraseCount] = useState(persistedPhrases?.phraseCount ?? 3);
  const [customContext, setCustomContext] = useState(persistedPhrases?.customContext ?? "");
  const [direction, setDirection] = useState<"fr-to-jp" | "jp-to-fr">(
    persistedPhrases?.direction ?? "fr-to-jp",
  );
  const [contentType, setContentType] = useState<"phrases" | "paragraph">(
    resolvePhraseStyle(tabFromUrl, persistedPhrases) === "story" ? "paragraph" : "phrases",
  );
  const [withKanji, setWithKanji] = useState(persistedPhrases?.withKanji ?? true);
  const [sentenceLength, setSentenceLength] = useState<SentenceLength>(
    persistedPhrases?.sentenceLength ?? "medium",
  );
  const [vocabSampleSize, setVocabSampleSize] = useState<number>(
    persistedPhrases?.vocabSampleSize ?? 80,
  );

  // JLPT state
  const [jlptType, setJlptType] = useState<JlptConstraints["exerciseType"]>("phrases");
  const [jlptDirection, setJlptDirection] = useState<"fr-to-jp" | "jp-to-fr">("fr-to-jp");
  const [jlptWithKanji, setJlptWithKanji] = useState(true);
  const [jlptCount, setJlptCount] = useState(5);
  const [jlptParagraphLength, setJlptParagraphLength] = useState<"short" | "medium" | "long">(
    "medium",
  );
  const [jlptContext, setJlptContext] = useState("");
  const [jlptLevel, setJlptLevel] = useState<JlptLevel>(() => loadJlptLevel());

  useEffect(() => {
    saveJlptLevel(jlptLevel);
  }, [jlptLevel]);

  // Conjugation state
  const [conjTagId, setConjTagId] = useState<number | null>(null);
  const [conjForms, setConjForms] = useState<Set<string>>(
    new Set(["forme polie (ます)", "forme -te (て)"]),
  );
  const [conjCount, setConjCount] = useState(10);

  // SRS state (phrases)
  const [isSubmittingReviews, setIsSubmittingReviews] = useState(false);
  const [reviewsSubmitted, setReviewsSubmitted] = useState(false);

  // Vocab state (JLPT)
  const [addedToVocab, setAddedToVocab] = useState<Set<number>>(new Set());
  const [isAddingAll, setIsAddingAll] = useState(false);

  // Conjugation evaluation cache
  const [conjEvaluationCache, setConjEvaluationCache] = useState<
    Map<number, ConjugationEvaluation>
  >(new Map());

  // Listening state
  const [listeningTagIds, setListeningTagIds] = useState<number[]>([]);
  const [listeningDifficulty, setListeningDifficulty] = useState<"debutant" | "intermediaire">(
    "debutant",
  );
  const [listeningCount, setListeningCount] = useState(5);
  const [listeningExercises, setListeningExercises] = useState<ListeningExercise[]>([]);
  const [listeningIndex, setListeningIndex] = useState(0);
  const [listeningTranscript, setListeningTranscript] = useState("");
  const [listeningRevealed, setListeningRevealed] = useState(false);
  const [listeningChecked, setListeningChecked] = useState(false);
  const [listeningIsCorrect, setListeningIsCorrect] = useState<boolean | null>(null);
  const [listeningReview, setListeningReview] = useState<PracticeReview | null>(null);
  const [listeningErrorType, setListeningErrorType] = useState<string | null>(null);
  const [listeningResults, setListeningResults] = useState<
    Array<{
      exercise: ListeningExercise;
      userTranscript: string;
      isCorrect: boolean | null;
      feedback: string | null;
      revealed: boolean;
    }>
  >([]);
  const [listeningSpeed, setListeningSpeed] = useState(1.0);
  const [listeningIsPlaying, setListeningIsPlaying] = useState(false);
  const [listeningIsPaused, setListeningIsPaused] = useState(false);
  const listeningUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Grammar drawer state
  const [grammarNote, setGrammarNote] = useState<GrammarNote | null>(null);
  const [isLoadingGrammar, setIsLoadingGrammar] = useState(false);
  const [showGrammarDrawer, setShowGrammarDrawer] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function refreshQuota() {
    fetchGeminiQuota()
      .then(setQuota)
      .catch(() => {});
  }

  useEffect(() => {
    const inSession = phase === "training";
    document.body.classList.toggle("kotoba-session", inSession);
    return () => document.body.classList.remove("kotoba-session");
  }, [phase]);

  function applyEvaluation(evaluation: PhraseEvaluation) {
    const review = practiceReviewFromEvaluation(evaluation);
    setCurrentIsCorrect(evaluation.isCorrect);
    setCurrentReview(review);
    setCurrentFeedback(evaluation.feedback ?? flattenPracticeReview(review));
    setCurrentErrorType(evaluation.errorType ?? null);
  }

  function clearQuestionState() {
    setUserAnswer("");
    setCurrentIsCorrect(null);
    setCurrentFeedback(null);
    setCurrentReview(null);
    setCurrentErrorType(null);
    setCurrentHint(null);
    setIsRetryingPhrase(false);
    setPhraseRetryUsed(false);
    setHasCheckedCurrent(false);
    setErrorMessage(null);
  }

  useEffect(() => {
    Promise.all([fetchTags(), fetchGeminiQuota()])
      .then(([loadedTags, loadedQuota]) => {
        setTags(loadedTags);
        setQuota(loadedQuota);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tags.length !== 1) return;
    const onlyTagId = tags[0].id;
    setSelectedTagIds((previous) => (previous.length === 0 ? [onlyTagId] : previous));
    setListeningTagIds((previous) => (previous.length === 0 ? [onlyTagId] : previous));
    setConjTagId((previous) => previous ?? onlyTagId);
  }, [tags]);

  // Recover and flush any pending SRS reviews from a previous failed session.
  useEffect(() => {
    let pendingRaw: string | null = null;
    try {
      pendingRaw = window.localStorage.getItem("pratique:pending-reviews");
    } catch {
      return;
    }
    if (!pendingRaw) return;
    try {
      const parsed = JSON.parse(pendingRaw) as Array<{
        wordId: number;
        result: "success" | "fail";
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        window.localStorage.removeItem("pratique:pending-reviews");
        return;
      }
      submitBulkReviews(parsed)
        .then(() => {
          try {
            window.localStorage.removeItem("pratique:pending-reviews");
          } catch {
            // ignore storage errors
          }
        })
        .catch(() => {
          // keep the pending reviews in storage for a later retry
        });
    } catch {
      try {
        window.localStorage.removeItem("pratique:pending-reviews");
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  // Persist phrases setup config to localStorage
  useEffect(() => {
    savePhrasesSettings({
      selectedTagIds,
      selectedParticles,
      tense,
      polarity,
      politeness,
      phraseCount,
      customContext,
      direction,
      contentType,
      withKanji,
      sentenceLength,
      vocabSampleSize,
      phraseStyle,
    });
  }, [
    selectedTagIds,
    selectedParticles,
    tense,
    polarity,
    politeness,
    phraseCount,
    customContext,
    direction,
    contentType,
    withKanji,
    sentenceLength,
    vocabSampleSize,
    phraseStyle,
  ]);

  function handleTabChange(tab: HubMode) {
    if (phase !== "setup" && phase !== "hub") return;
    if (tab === "phrases") {
      const sessionTab = sessionTabForPhraseStyle(phraseStyle);
      setActiveTab(sessionTab);
      setSearchParams({ tab: sessionTab });
    } else {
      setActiveTab(tab);
      setSearchParams({ tab });
    }
    setErrorMessage(null);
    setPhase("setup");
  }

  function applyPhraseStyle(style: PhraseStyle) {
    setPhraseStyle(style);
    if (style === "blocks") {
      setActiveTab("construction");
      setSearchParams({ tab: "construction" });
    } else if (style === "story") {
      setActiveTab("phrases");
      setContentType("paragraph");
      setSearchParams({ tab: "phrases" });
    } else {
      setActiveTab("phrases");
      setContentType("phrases");
      setSearchParams({ tab: "phrases" });
    }
    setErrorMessage(null);
  }

  function resetSession() {
    setPhase("setup");
    setExercises([]);
    setCurrentIndex(0);
    setUserAnswer("");
    setResults([]);
    setHasCheckedCurrent(false);
    setCurrentFeedback(null);
    setCurrentReview(null);
    setCurrentErrorType(null);
    setCurrentIsCorrect(null);
    setCurrentHint(null);
    setIsRetryingPhrase(false);
    setPhraseRetryUsed(false);
    setErrorMessage(null);
    setReviewsSubmitted(false);
    setAddedToVocab(new Set());
    setConjEvaluationCache(new Map());
    setListeningExercises([]);
    setListeningIndex(0);
    setListeningTranscript("");
    setListeningRevealed(false);
    setListeningChecked(false);
    setListeningIsCorrect(null);
    setListeningReview(null);
    setListeningErrorType(null);
    setListeningResults([]);
  }

  // ---- GENERATION ----
  async function handleGeneratePhrases() {
    if (selectedTagIds.length === 0 || selectedParticles.length === 0) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const generated = await generatePhrases({
        tagIds: selectedTagIds,
        particles: selectedParticles,
        tense,
        polarity,
        politeness,
        count: contentType === "paragraph" ? 1 : phraseCount,
        customContext: customContext.trim() || undefined,
        direction,
        contentType,
        withKanji: contentType === "paragraph" ? withKanji : undefined,
        sentenceLength,
        vocabSampleSize,
      });
      const unified: UnifiedExercise[] = generated.map((phrase) => ({
        prompt: direction === "jp-to-fr" ? phrase.jp_kanji || phrase.jp_kana : phrase.fr,
        answer: direction === "jp-to-fr" ? phrase.fr : phrase.jp_kanji || phrase.jp_kana,
        answerAlt: direction === "jp-to-fr" ? undefined : phrase.jp_kana,
        explanation: phrase.explanation,
        wordIds: phrase.wordIds,
        frenchPrompt: phrase.fr,
      }));
      setExercises(unified);
      setCurrentIndex(0);
      setUserAnswer("");
      setResults([]);
      setHasCheckedCurrent(false);
      setReviewsSubmitted(false);
      setCurrentHint(null);
      setIsRetryingPhrase(false);
      setPhraseRetryUsed(false);
      setPhase("training");
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateJlpt() {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const generated = await generateJlptExercises({
        exerciseType: jlptType,
        direction: jlptDirection,
        withKanji: jlptWithKanji,
        count: jlptType === "paragraph" ? 1 : jlptCount,
        paragraphLength: jlptType === "paragraph" ? jlptParagraphLength : undefined,
        customContext: jlptContext.trim() || undefined,
        level: jlptLevel,
      });
      const unified: UnifiedExercise[] = generated.map((exercise) => ({
        prompt: exercise.prompt,
        answer: exercise.answer,
        answerAlt: exercise.answerAlt,
        explanation: exercise.explanation,
      }));
      setExercises(unified);
      setCurrentIndex(0);
      setUserAnswer("");
      setResults([]);
      setHasCheckedCurrent(false);
      setAddedToVocab(new Set());
      setCurrentHint(null);
      setIsRetryingPhrase(false);
      setPhraseRetryUsed(false);
      setPhase("training");
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateConjugation() {
    if (!conjTagId || conjForms.size === 0) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const words = await fetchSeriesWords(conjTagId);
      const verbWords = words.map((word) => ({
        french: word.french,
        kana: word.kana ?? undefined,
        kanji: word.kanji ?? undefined,
      }));
      if (verbWords.length === 0) {
        setErrorMessage("Aucun mot dans cette série");
        return;
      }
      const result = await generateConjugationExercises(
        verbWords.slice(0, 20),
        Array.from(conjForms),
        conjCount,
      );
      const unified: UnifiedExercise[] = result.exercises.map((exercise) => ({
        prompt: exercise.prompt,
        answer: exercise.answer,
      }));
      setExercises(unified);
      setQuota(result.quota);
      setCurrentIndex(0);
      setUserAnswer("");
      setResults([]);
      setHasCheckedCurrent(false);
      setConjEvaluationCache(new Map());
      setCurrentHint(null);
      setIsRetryingPhrase(false);
      setPhraseRetryUsed(false);
      setPhase("training");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateConstruction() {
    if (selectedTagIds.length === 0 || selectedParticles.length === 0) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const generated = await generateConstructionPhrases({
        tagIds: selectedTagIds,
        particles: selectedParticles,
        tense,
        polarity,
        politeness,
        count: phraseCount,
        customContext: customContext.trim() || undefined,
        direction,
        sentenceLength,
        vocabSampleSize,
      });
      const isJpToFr = direction === "jp-to-fr";
      const unified: UnifiedExercise[] = generated.map((phrase) => {
        const blocks: ConstructionBlock[] = isJpToFr
          ? phrase.blocks_fr.map((token) => ({ text: token }))
          : phrase.blocks_jp;
        return {
          prompt: isJpToFr ? phrase.jp_kanji || phrase.jp_kana : phrase.fr,
          answer: isJpToFr ? phrase.fr : phrase.jp_kanji || phrase.jp_kana,
          answerAlt: isJpToFr ? undefined : phrase.jp_kana,
          explanation: phrase.explanation,
          wordIds: phrase.wordIds,
          frenchPrompt: phrase.fr,
          blocks,
          blockSeparator: isJpToFr ? " " : "",
          direction,
        };
      });
      if (unified.length === 0) {
        setErrorMessage("Aucune phrase exploitable n'a été générée.");
        return;
      }
      setExercises(unified);
      setCurrentIndex(0);
      setUserAnswer("");
      setResults([]);
      setHasCheckedCurrent(false);
      setReviewsSubmitted(false);
      setCurrentHint(null);
      setIsRetryingPhrase(false);
      setPhraseRetryUsed(false);
      setPhase("training");
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateListening() {
    if (listeningTagIds.length === 0) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generateListeningExercises({
        tagIds: listeningTagIds,
        difficulty: listeningDifficulty,
        count: listeningCount,
      });
      setListeningExercises(result.exercises);
      setQuota(result.quota);
      setListeningIndex(0);
      setListeningTranscript("");
      setListeningRevealed(false);
      setListeningChecked(false);
      setListeningIsCorrect(null);
      setListeningReview(null);
      setListeningErrorType(null);
      setListeningResults([]);
      setPhase("training");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsGenerating(false);
    }
  }

  function playListeningAudio(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = listeningSpeed;
    utterance.onstart = () => {
      setListeningIsPlaying(true);
      setListeningIsPaused(false);
    };
    utterance.onend = () => {
      setListeningIsPlaying(false);
      setListeningIsPaused(false);
      listeningUtteranceRef.current = null;
    };
    utterance.onerror = () => {
      setListeningIsPlaying(false);
      setListeningIsPaused(false);
      listeningUtteranceRef.current = null;
    };
    listeningUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function pauseListeningAudio() {
    if (listeningIsPlaying && !listeningIsPaused) {
      window.speechSynthesis.pause();
      setListeningIsPaused(true);
    } else if (listeningIsPaused) {
      window.speechSynthesis.resume();
      setListeningIsPaused(false);
    }
  }

  async function handleListeningCheck() {
    const currentListeningExercise = listeningExercises[listeningIndex];
    if (!currentListeningExercise || !listeningTranscript.trim()) return;
    setIsEvaluating(true);
    try {
      const evaluation = await evaluateListening(
        listeningTranscript.trim(),
        currentListeningExercise.japanese,
        currentListeningExercise.french,
      );
      refreshQuota();
      setListeningIsCorrect(evaluation.isCorrect ?? false);
      setListeningReview(practiceReviewFromEvaluation(evaluation));
      setListeningErrorType(evaluation.errorType ?? null);
      setListeningChecked(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur de vérification");
    } finally {
      setIsEvaluating(false);
    }
  }

  function handleListeningNext() {
    const currentListeningExercise = listeningExercises[listeningIndex];
    if (!currentListeningExercise) return;
    setListeningResults((previous) => [
      ...previous,
      {
        exercise: currentListeningExercise,
        userTranscript: listeningTranscript.trim(),
        isCorrect: listeningIsCorrect ?? false,
        feedback: flattenPracticeReview(listeningReview),
        revealed: listeningRevealed,
      },
    ]);
    if (listeningIndex + 1 < listeningExercises.length) {
      setListeningIndex(listeningIndex + 1);
      setListeningTranscript("");
      setListeningRevealed(false);
      setListeningChecked(false);
      setListeningIsCorrect(null);
      setListeningReview(null);
      setListeningErrorType(null);
    } else {
      setPhase("recap");
    }
  }

  async function handleGrammarLink(errorType: string, context?: string) {
    const topic = context ? `${errorType} : ${context}` : errorType;
    setIsLoadingGrammar(true);
    setShowGrammarDrawer(true);
    try {
      const note = await fetchGrammarNote(topic);
      setGrammarNote(note);
    } catch {
      setGrammarNote(null);
    } finally {
      setIsLoadingGrammar(false);
    }
  }

  function handleGenerate() {
    if (activeTab === "phrases") handleGeneratePhrases();
    else if (activeTab === "construction") handleGenerateConstruction();
    else if (activeTab === "jlpt") handleGenerateJlpt();
    else if (activeTab === "ecoute") handleGenerateListening();
    else handleGenerateConjugation();
  }

  // ---- EVALUATION ----
  const currentExercise = exercises[currentIndex] ?? null;

  async function handleCheck() {
    if (!currentExercise || !userAnswer.trim()) return;
    setIsEvaluating(true);
    setErrorMessage(null);
    try {
      if (activeTab === "phrases" || activeTab === "construction") {
        const evaluation = await evaluatePhrase(
          userAnswer.trim(),
          currentExercise.answer,
          activeTab === "construction"
            ? (currentExercise.frenchPrompt ?? currentExercise.prompt)
            : currentExercise.prompt,
          activeTab === "construction" ? (currentExercise.direction ?? direction) : direction,
        );
        const canRetry = Boolean(evaluation.retryable) && !evaluation.isCorrect && !phraseRetryUsed;
        if (canRetry) {
          setIsRetryingPhrase(true);
          setPhraseRetryUsed(true);
          setCurrentHint(evaluation.hint ?? evaluation.feedback);
          setCurrentIsCorrect(false);
          setCurrentFeedback(null);
          setCurrentReview(null);
          setCurrentErrorType(evaluation.errorType ?? null);
          setHasCheckedCurrent(false);
          refreshQuota();
          return;
        }
        setIsRetryingPhrase(false);
        setCurrentHint(null);
        applyEvaluation(evaluation);
      } else if (activeTab === "jlpt") {
        const evaluation = await evaluateJlptAnswer(
          userAnswer.trim(),
          currentExercise.answer,
          currentExercise.prompt,
          jlptDirection,
        );
        applyEvaluation(evaluation);
      } else {
        const result = await evaluateConjugation(
          currentExercise.prompt,
          currentExercise.answer,
          userAnswer.trim(),
        );
        applyEvaluation({
          isCorrect: result.evaluation.isCorrect,
          feedback: result.evaluation.explanation,
          summary: result.evaluation.summary,
          rule: result.evaluation.rule,
          example: result.evaluation.example,
          errorType: "conjugation",
        });
        setConjEvaluationCache((previous) =>
          new Map(previous).set(currentIndex, result.evaluation),
        );
        setQuota(result.quota);
      }
      setHasCheckedCurrent(true);
      refreshQuota();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur lors de la vérification");
    } finally {
      setIsEvaluating(false);
    }
  }

  function handleNext() {
    if (!currentExercise) return;
    setResults((previous) => [
      ...previous,
      {
        exercise: currentExercise,
        userAnswer,
        isCorrect: currentIsCorrect,
        feedback: currentFeedback,
      },
    ]);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= exercises.length) {
      setPhase("recap");
    } else {
      setCurrentIndex(nextIndex);
      clearQuestionState();
      setTimeout(() => {
        if (activeTab === "conjugaison") inputRef.current?.focus();
      }, 50);
    }
  }

  function revealPhraseCorrection() {
    setIsRetryingPhrase(false);
    setCurrentHint(null);
    setCurrentIsCorrect(false);
    setHasCheckedCurrent(true);
  }

  function handleSkip() {
    if (!currentExercise) return;
    setResults((previous) => [
      ...previous,
      { exercise: currentExercise, userAnswer: "", isCorrect: null },
    ]);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= exercises.length) {
      setPhase("recap");
    } else {
      setCurrentIndex(nextIndex);
      clearQuestionState();
    }
  }

  function handleFinishEarly() {
    if (currentExercise && !hasCheckedCurrent) {
      setResults((previous) => [
        ...previous,
        { exercise: currentExercise, userAnswer: "", isCorrect: null },
      ]);
    }
    setPhase("recap");
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    setUserAnswer((previous) => (previous ? `${previous} ${text}` : text));
  }, []);

  // Keyboard shortcuts
  const handleCheckRef = useRef(handleCheck);
  const handleNextRef = useRef(handleNext);
  const handleRestartRef = useRef(resetSession);
  handleCheckRef.current = handleCheck;
  handleNextRef.current = handleNext;
  handleRestartRef.current = resetSession;

  useEffect(() => {
    if (phase !== "training") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.key === "Enter" && !hasCheckedCurrent && userAnswer.trim()) {
        event.preventDefault();
        handleCheckRef.current();
      } else if (event.ctrlKey && event.key === "ArrowRight" && hasCheckedCurrent) {
        event.preventDefault();
        handleNextRef.current();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (
          window.confirm("Quitter la session ? La progression en cours ne sera pas enregistrée.")
        ) {
          handleRestartRef.current();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, hasCheckedCurrent, userAnswer]);

  // Recap stats
  const recapStats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let skipped = 0;
    for (const result of results) {
      if (result.isCorrect === null) skipped++;
      else if (result.isCorrect) correct++;
      else incorrect++;
    }
    return { correct, incorrect, skipped };
  }, [results]);

  // Phrases & Construction SRS word IDs
  const allWordIdsForSrs = useMemo(() => {
    if (activeTab !== "phrases" && activeTab !== "construction")
      return { successWordIds: [], failWordIds: [] };
    const successWordIds: number[] = [];
    const failWordIds: number[] = [];
    for (const result of results) {
      const wordIds = result.exercise.wordIds ?? [];
      if (result.isCorrect === true) {
        for (const wordId of wordIds) successWordIds.push(wordId);
      } else if (result.isCorrect === false) {
        for (const wordId of wordIds) failWordIds.push(wordId);
      }
    }
    return { successWordIds, failWordIds };
  }, [results, activeTab]);

  function buildPendingReviews(): Array<{ wordId: number; result: "success" | "fail" }> {
    const reviews: Array<{ wordId: number; result: "success" | "fail" }> = [];
    const seen = new Set<number>();
    for (const wordId of allWordIdsForSrs.successWordIds) {
      if (!seen.has(wordId)) {
        reviews.push({ wordId, result: "success" });
        seen.add(wordId);
      }
    }
    for (const wordId of allWordIdsForSrs.failWordIds) {
      if (!seen.has(wordId)) {
        reviews.push({ wordId, result: "fail" });
        seen.add(wordId);
      }
    }
    return reviews;
  }

  async function handleSubmitReviews() {
    const reviews = buildPendingReviews();
    if (reviews.length === 0) {
      setReviewsSubmitted(true);
      try {
        window.localStorage.removeItem("pratique:pending-reviews");
      } catch {
        // ignore storage errors
      }
      return;
    }
    setIsSubmittingReviews(true);
    setErrorMessage(null);
    try {
      window.localStorage.setItem("pratique:pending-reviews", JSON.stringify(reviews));
    } catch {
      // ignore storage errors
    }
    try {
      await submitBulkReviews(reviews);
      setReviewsSubmitted(true);
      try {
        window.localStorage.removeItem("pratique:pending-reviews");
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      if (error instanceof BulkReviewsError) {
        if (error.isAuthError) {
          setErrorMessage(
            "Ta session a expiré. Reconnecte-toi puis reviens sur cet écran pour réessayer l'enregistrement SRS.",
          );
        } else {
          setErrorMessage(
            `Échec de l'enregistrement SRS : ${error.message} Tes révisions sont conservées localement, tu peux retenter avec « Réessayer ».`,
          );
        }
      } else {
        const message = error instanceof Error ? error.message : "Erreur inconnue.";
        setErrorMessage(
          `Échec de l'enregistrement SRS : ${message} Tes révisions sont conservées localement, tu peux retenter avec « Réessayer ».`,
        );
      }
    } finally {
      setIsSubmittingReviews(false);
    }
  }

  function getVoiceLang(): string {
    if (activeTab === "phrases" || activeTab === "construction")
      return direction === "jp-to-fr" ? "fr-FR" : "ja-JP";
    if (activeTab === "jlpt") return jlptDirection === "fr-to-jp" ? "ja-JP" : "fr-FR";
    return "ja-JP";
  }

  const phraseStyleLabel =
    phraseStyle === "blocks" ? "assembler" : phraseStyle === "story" ? "histoire" : "écrire";
  const pratiquePill: HubMode =
    activeTab === "jlpt" ? "jlpt" : activeTab === "conjugaison" ? "conjugaison" : "phrases";

  const setupHeading = (() => {
    if (activeTab === "phrases" || activeTab === "construction") {
      return {
        title: "Phrases",
        description: "Écris avec ton vocabulaire : tape, assemble, ou raconte une courte histoire.",
      };
    }
    if (activeTab === "jlpt") {
      return {
        title: "JLPT",
        description: `Entraînement ${jlptLevel} généré, indépendant de tes mots.`,
      };
    }
    if (activeTab === "conjugaison") {
      return {
        title: "Conjugaison",
        description: "Conjugue les verbes d’une série.",
      };
    }
    return {
      title: "Écoute",
      description: "Écoute une phrase et transcris-la.",
    };
  })();

  // ===================== SETUP =====================
  if (phase === "setup") {
    const selectedSeriesNames = tags
      .filter((tag) => selectedTagIds.includes(tag.id))
      .map((tag) => tag.name);
    const listeningSeriesNames = tags
      .filter((tag) => listeningTagIds.includes(tag.id))
      .map((tag) => tag.name);
    const conjugationSeriesName = tags.find((tag) => tag.id === conjTagId)?.name;
    const directionLabel = (value: "fr-to-jp" | "jp-to-fr") =>
      value === "fr-to-jp" ? "vers le japonais" : "vers le français";

    let generateLabel = "Générer";
    let generateSummary = "";
    let generateBlockedReason: string | null = null;

    if (activeTab === "phrases") {
      generateLabel = isGenerating
        ? "Génération…"
        : phraseStyle === "story"
          ? "Générer l’histoire"
          : `Générer ${phraseCount} ${phraseCount > 1 ? "phrases" : "phrase"}`;
      generateSummary = [
        phraseStyleLabel,
        directionLabel(direction),
        selectedSeriesNames.length === 1
          ? selectedSeriesNames[0]
          : `${selectedSeriesNames.length} séries`,
      ].join(" · ");
      if (selectedTagIds.length === 0) generateBlockedReason = "Choisis au moins une série.";
      else if (selectedParticles.length === 0)
        generateBlockedReason = "Coche au moins une particule dans Plus d’options.";
    } else if (activeTab === "construction") {
      generateLabel = isGenerating ? "Génération…" : `Générer ${phraseCount} puzzles`;
      generateSummary = [
        phraseStyleLabel,
        directionLabel(direction),
        selectedSeriesNames.length === 1
          ? selectedSeriesNames[0]
          : `${selectedSeriesNames.length} séries`,
      ].join(" · ");
      if (selectedTagIds.length === 0) generateBlockedReason = "Choisis au moins une série.";
      else if (selectedParticles.length === 0)
        generateBlockedReason = "Coche au moins une particule dans Plus d’options.";
    } else if (activeTab === "jlpt") {
      generateLabel = isGenerating
        ? "Génération…"
        : jlptType === "paragraph"
          ? "Générer le paragraphe"
          : `Générer ${jlptCount} exercices`;
      generateSummary = `${jlptLevel} · ${directionLabel(jlptDirection)} · ${
        { words: "mots", phrases: "phrases", paragraph: "paragraphe" }[jlptType]
      }`;
    } else if (activeTab === "conjugaison") {
      generateLabel = isGenerating ? "Génération…" : `Générer ${conjCount} formes`;
      generateSummary = `${conjugationSeriesName ?? "aucune série"} · ${conjForms.size} formes`;
      if (!conjTagId) generateBlockedReason = "Choisis une série.";
      else if (conjForms.size === 0) generateBlockedReason = "Coche au moins une forme.";
    } else if (activeTab === "ecoute") {
      generateLabel = isGenerating ? "Génération…" : `Générer ${listeningCount} dictées`;
      generateSummary = [
        listeningDifficulty === "debutant" ? "débutant" : "intermédiaire",
        listeningSeriesNames.length === 1
          ? listeningSeriesNames[0]
          : `${listeningSeriesNames.length} séries`,
      ].join(" · ");
      if (listeningTagIds.length === 0) generateBlockedReason = "Choisis au moins une série.";
    }

    const grammarFields = (
      <div className="pratiqueStep__stack">
        <div>
          <p className="pratiqueStep__miniLabel">Particules</p>
          <div className="pratique__chipGrid">
            {AVAILABLE_PARTICLES.map((particle) => (
              <button
                key={particle}
                type="button"
                className={`pratique__chip pratique__chip--particle ${selectedParticles.includes(particle) ? "pratique__chip--active" : ""}`}
                onClick={() =>
                  setSelectedParticles((previous) =>
                    previous.includes(particle)
                      ? previous.filter((item) => item !== particle)
                      : [...previous, particle],
                  )
                }
              >
                {particle}
              </button>
            ))}
          </div>
        </div>
        <div className="pratiqueChoiceGrid pratiqueChoiceGrid--compact">
          <div>
            <p className="pratiqueStep__miniLabel">Temps</p>
            <div className="pratique__toggleRow">
              {TENSE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`pratique__toggle pratique__toggle--sm ${tense === option.value ? "pratique__toggle--active" : ""}`}
                  onClick={() => setTense(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="pratiqueStep__miniLabel">Polarité</p>
            <div className="pratique__toggleRow">
              {POLARITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`pratique__toggle pratique__toggle--sm ${polarity === option.value ? "pratique__toggle--active" : ""}`}
                  onClick={() => setPolarity(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="pratiqueStep__miniLabel">Politesse</p>
            <div className="pratique__toggleRow">
              {POLITENESS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`pratique__toggle pratique__toggle--sm ${politeness === option.value ? "pratique__toggle--active" : ""}`}
                  onClick={() => setPoliteness(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <p className="pratiqueStep__miniLabel">
            Vocabulaire envoyé à l’IA : {vocabSampleSize} mots
          </p>
          <input
            type="range"
            min={10}
            max={300}
            step={10}
            value={vocabSampleSize}
            onChange={(event) => setVocabSampleSize(Number(event.target.value))}
            className="pratique__slider"
            aria-label="Taille de l'échantillon de vocabulaire"
          />
        </div>
        <div>
          <p className="pratiqueStep__miniLabel">Contexte (optionnel)</p>
          <textarea
            className="pratique__textarea"
            placeholder="Ex. : phrases du quotidien, au restaurant…"
            value={customContext}
            onChange={(event) => setCustomContext(event.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>
      </div>
    );

    return (
      <div className="pratique pratique--setup">
        <div className="pageHeader">
          <div>
            <h1 className="pageTitle">Pratique</h1>
            <p className="pageSubtitle">{setupHeading.description}</p>
          </div>
        </div>
        <PillNav
          ariaLabel="Modes de pratique"
          items={PRATIQUE_PILLS}
          value={pratiquePill}
          onChange={handleTabChange}
        />
        {quota ? <QuotaBar quota={quota} /> : null}

        <div className="pratiqueSetup">
          {activeTab === "phrases" || activeTab === "construction" ? (
            <>
              <SetupStep
                index={1}
                title="Comment tu pratiques ?"
                hint="Un seul mode : tu choisis ensuite tes mots."
              >
                <SetupChoices
                  value={phraseStyle}
                  onChange={applyPhraseStyle}
                  options={[
                    {
                      value: "write",
                      title: "Écrire",
                      text: "Tu tapes la traduction, phrase par phrase.",
                    },
                    {
                      value: "blocks",
                      title: "Assembler",
                      text: "Tu ranges les blocs pour former la phrase.",
                    },
                    {
                      value: "story",
                      title: "Histoire",
                      text: "Un court paragraphe avec tes mots.",
                    },
                  ]}
                />
              </SetupStep>
              <SetupStep index={2} title="Quelle série ?" hint="On n’utilise que tes mots.">
                <SeriesPicker
                  tags={tags}
                  selectedIds={selectedTagIds}
                  multiple
                  onChange={setSelectedTagIds}
                />
              </SetupStep>
              <SetupStep index={3} title="Dans quel sens ?">
                <SetupChoices
                  value={direction}
                  onChange={setDirection}
                  options={[
                    {
                      value: "fr-to-jp",
                      title: "Écrire en japonais",
                      text:
                        phraseStyle === "blocks"
                          ? "Tu vois le français, tu ranges la phrase japonaise."
                          : "Tu vois le français, tu tapes la phrase japonaise.",
                    },
                    {
                      value: "jp-to-fr",
                      title: "Écrire en français",
                      text: "Tu vois le japonais, tu donnes la traduction.",
                    },
                  ]}
                />
              </SetupStep>
              {phraseStyle !== "story" ? (
                <SetupStep index={4} title="Combien ?">
                  <CountChoices
                    values={[3, 5, 8, 10]}
                    value={phraseCount}
                    onChange={setPhraseCount}
                    unit={phraseStyle === "blocks" ? "puzzles" : "phrases"}
                  />
                </SetupStep>
              ) : null}
              <details className="pratiqueAdvanced">
                <summary>Plus d’options</summary>
                <div className="pratiqueAdvanced__body">
                  <div className="pratiqueChoiceGrid pratiqueChoiceGrid--compact">
                    <div>
                      <p className="pratiqueStep__miniLabel">Longueur</p>
                      <div className="pratique__toggleRow">
                        {(["short", "medium", "long"] as const).map((length) => (
                          <button
                            key={length}
                            type="button"
                            className={`pratique__toggle pratique__toggle--sm ${sentenceLength === length ? "pratique__toggle--active" : ""}`}
                            onClick={() => setSentenceLength(length)}
                          >
                            {{ short: "Courtes", medium: "Moyennes", long: "Longues" }[length]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {phraseStyle === "story" ? (
                      <div>
                        <p className="pratiqueStep__miniLabel">Kanji</p>
                        <div className="pratique__toggleRow">
                          <button
                            type="button"
                            className={`pratique__toggle ${withKanji ? "pratique__toggle--active" : ""}`}
                            onClick={() => setWithKanji(true)}
                          >
                            Avec
                          </button>
                          <button
                            type="button"
                            className={`pratique__toggle ${!withKanji ? "pratique__toggle--active" : ""}`}
                            onClick={() => setWithKanji(false)}
                          >
                            Sans
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {grammarFields}
                </div>
              </details>
            </>
          ) : null}

          {activeTab === "jlpt" ? (
            <>
              <SetupStep index={1} title="Quel niveau ?">
                <SetupChoices
                  value={jlptLevel}
                  onChange={setJlptLevel}
                  options={JLPT_LEVELS.map((level) => ({
                    value: level,
                    title: level,
                    text: JLPT_LEVEL_HINTS[level],
                  }))}
                />
              </SetupStep>
              <SetupStep index={2} title="Dans quel sens ?">
                <SetupChoices
                  value={jlptDirection}
                  onChange={setJlptDirection}
                  options={[
                    {
                      value: "fr-to-jp",
                      title: "Écrire en japonais",
                      text: `Tu vois le français, tu produis le japonais ${jlptLevel}.`,
                    },
                    {
                      value: "jp-to-fr",
                      title: "Écrire en français",
                      text: `Tu vois le japonais ${jlptLevel}, tu traduis.`,
                    },
                  ]}
                />
              </SetupStep>
              <SetupStep
                index={3}
                title="Quel format ?"
                hint={`Ce n’est pas ton vocabulaire : contenu ${jlptLevel} généré.`}
              >
                <SetupChoices
                  value={jlptType}
                  onChange={setJlptType}
                  options={[
                    {
                      value: "words",
                      title: "Mots",
                      text: `Un mot à la fois, pour le lexique ${jlptLevel}.`,
                    },
                    {
                      value: "phrases",
                      title: "Phrases",
                      text: "Tu traduis une phrase courte.",
                    },
                    {
                      value: "paragraph",
                      title: "Paragraphe",
                      text: "Un petit texte, une seule réponse.",
                    },
                  ]}
                />
              </SetupStep>
              <SetupStep
                index={4}
                title={jlptType === "paragraph" ? "Quelle longueur ?" : "Combien ?"}
              >
                {jlptType === "paragraph" ? (
                  <SetupChoices
                    value={jlptParagraphLength}
                    onChange={setJlptParagraphLength}
                    options={[
                      {
                        value: "short",
                        title: "Court",
                        text: "Quelques lignes, une lecture rapide.",
                      },
                      {
                        value: "medium",
                        title: "Moyen",
                        text: "Un paragraphe confortable.",
                      },
                      {
                        value: "long",
                        title: "Long",
                        text: "Un peu plus de lecture.",
                      },
                    ]}
                  />
                ) : (
                  <CountChoices
                    values={[3, 5, 8, 10, 15]}
                    value={jlptCount}
                    onChange={setJlptCount}
                    unit="exercices"
                  />
                )}
              </SetupStep>
              <details className="pratiqueAdvanced">
                <summary>Plus d’options</summary>
                <div className="pratiqueAdvanced__body">
                  <div>
                    <p className="pratiqueStep__miniLabel">Kanji</p>
                    <div className="pratique__toggleRow">
                      <button
                        type="button"
                        className={`pratique__toggle ${jlptWithKanji ? "pratique__toggle--active" : ""}`}
                        onClick={() => setJlptWithKanji(true)}
                      >
                        Avec
                      </button>
                      <button
                        type="button"
                        className={`pratique__toggle ${!jlptWithKanji ? "pratique__toggle--active" : ""}`}
                        onClick={() => setJlptWithKanji(false)}
                      >
                        Sans
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="pratiqueStep__miniLabel">Contexte (optionnel)</p>
                    <textarea
                      className="pratique__textarea"
                      placeholder="Ex. : vocabulaire de la nourriture…"
                      value={jlptContext}
                      onChange={(event) => setJlptContext(event.target.value)}
                      maxLength={500}
                      rows={2}
                    />
                  </div>
                </div>
              </details>
            </>
          ) : null}

          {activeTab === "conjugaison" ? (
            <>
              <SetupStep
                index={1}
                title="Quelle série ?"
                hint="Une série à la fois, avec tes verbes."
              >
                <SeriesPicker
                  tags={tags}
                  selectedIds={conjTagId ? [conjTagId] : []}
                  multiple={false}
                  onChange={(ids) => setConjTagId(ids[0] ?? null)}
                />
              </SetupStep>
              <SetupStep index={2} title="Quelles formes ?">
                <div className="pratique__chipGrid">
                  {CORE_CONJUGATION_FORMS.map((form) => (
                    <button
                      key={form}
                      type="button"
                      className={`pratique__chip ${conjForms.has(form) ? "pratique__chip--active" : ""}`}
                      onClick={() =>
                        setConjForms((previous) => {
                          const next = new Set(previous);
                          if (next.has(form)) next.delete(form);
                          else next.add(form);
                          return next;
                        })
                      }
                    >
                      {form}
                    </button>
                  ))}
                </div>
                <details className="pratiqueAdvanced pratiqueAdvanced--nested">
                  <summary>Autres formes</summary>
                  <div className="pratique__chipGrid">
                    {EXTRA_CONJUGATION_FORMS.map((form) => (
                      <button
                        key={form}
                        type="button"
                        className={`pratique__chip ${conjForms.has(form) ? "pratique__chip--active" : ""}`}
                        onClick={() =>
                          setConjForms((previous) => {
                            const next = new Set(previous);
                            if (next.has(form)) next.delete(form);
                            else next.add(form);
                            return next;
                          })
                        }
                      >
                        {form}
                      </button>
                    ))}
                  </div>
                </details>
              </SetupStep>
              <SetupStep index={3} title="Combien ?">
                <CountChoices
                  values={[5, 10, 15, 20]}
                  value={conjCount}
                  onChange={setConjCount}
                  unit="formes"
                />
              </SetupStep>
            </>
          ) : null}

          {activeTab === "ecoute" ? (
            <>
              <SetupStep
                index={1}
                title="Quelle série ?"
                hint="Les phrases sont générées à partir de tes mots."
              >
                <SeriesPicker
                  tags={tags}
                  selectedIds={listeningTagIds}
                  multiple
                  onChange={setListeningTagIds}
                />
              </SetupStep>
              <SetupStep index={2} title="Quel niveau ?">
                <SetupChoices
                  value={listeningDifficulty}
                  onChange={setListeningDifficulty}
                  options={[
                    {
                      value: "debutant",
                      title: "Débutant",
                      text: "Phrases courtes, rythme lent, vocabulaire simple.",
                    },
                    {
                      value: "intermediaire",
                      title: "Intermédiaire",
                      text: "Un peu plus long, un peu plus rapide.",
                    },
                  ]}
                />
              </SetupStep>
              <SetupStep index={3} title="Combien ?">
                <CountChoices
                  values={[3, 5, 8]}
                  value={listeningCount}
                  onChange={setListeningCount}
                  unit="dictées"
                />
              </SetupStep>
            </>
          ) : null}
        </div>

        {errorMessage ? <div className="formError">{errorMessage}</div> : null}

        <div className="pratiqueSetup__launch">
          {generateSummary ? <p className="pratiqueSetup__summary">{generateSummary}</p> : null}
          {generateBlockedReason ? (
            <p className="pratiqueSetup__blocked">{generateBlockedReason}</p>
          ) : null}
          <button
            className="button button--primary pratiqueSetup__generate"
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || Boolean(generateBlockedReason)}
          >
            {generateLabel}
          </button>
        </div>
      </div>
    );
  }

  // ===================== LISTENING TRAINING =====================
  if (phase === "training" && activeTab === "ecoute") {
    const currentListeningExercise = listeningExercises[listeningIndex];
    if (!currentListeningExercise) return null;

    return (
      <div className="phrasesTraining phrasesTraining--session">
        <div className="phrasesTraining__progressBar">
          <div
            className="phrasesTraining__progressFill"
            style={{ width: `${(listeningIndex / listeningExercises.length) * 100}%` }}
          />
        </div>
        <div className="phrasesTraining__counter">
          {listeningIndex + 1} / {listeningExercises.length}
        </div>

        <div
          className={`phrasesTraining__card${isEvaluating ? " phrasesTraining__card--busy" : ""}`}
          style={{ textAlign: "center" }}
        >
          {isEvaluating ? (
            <div className="phrasesTraining__overlay" aria-live="polite">
              <span className="phrasesTraining__overlayPill">
                <span className="phrasesTraining__spinner" aria-hidden="true" />
                Correction…
              </span>
            </div>
          ) : null}
          <p
            style={{
              fontSize: "14px",
              color: "var(--color-text-soft)",
              marginBottom: "var(--space-4)",
            }}
          >
            Écoute et transcris en japonais
          </p>

          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: "var(--space-5)",
            }}
          >
            <button
              type="button"
              className="button"
              onClick={() => playListeningAudio(currentListeningExercise.japanese)}
            >
              {listeningIsPlaying && !listeningIsPaused ? "Rejouer" : "Écouter"}
            </button>
            {listeningIsPlaying && (
              <button type="button" className="button" onClick={pauseListeningAudio}>
                {listeningIsPaused ? "Reprendre" : "Pause"}
              </button>
            )}
            <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-soft)" }}>Vitesse :</span>
              {[0.8, 1.0, 1.2].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={`pratique__toggle pratique__toggle--sm ${listeningSpeed === speed ? "pratique__toggle--active" : ""}`}
                  onClick={() => setListeningSpeed(speed)}
                  style={{ padding: "2px 6px", fontSize: "12px" }}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="pratique__textarea"
            placeholder="Écris ce que tu as entendu..."
            value={listeningTranscript}
            onChange={(event) => setListeningTranscript(event.target.value)}
            rows={3}
            style={{ marginBottom: "var(--space-4)" }}
            disabled={listeningChecked}
            spellCheck={false}
            autoComplete="off"
            lang="ja"
          />

          {listeningRevealed && (
            <div
              style={{
                marginBottom: "var(--space-4)",
                padding: "var(--space-3)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-soft)",
                  margin: "0 0 var(--space-1)",
                }}
              >
                Texte attendu :
              </p>
              <p style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 var(--space-1)" }}>
                {currentListeningExercise.japanese}
              </p>
              <p style={{ fontSize: "13px", color: "var(--color-text-soft)", margin: 0 }}>
                {currentListeningExercise.french}
              </p>
            </div>
          )}

          {!listeningChecked ? (
            <div className="phrasesTraining__actionRow">
              {!listeningRevealed ? (
                <button type="button" className="button" onClick={() => setListeningRevealed(true)}>
                  Révéler le texte
                </button>
              ) : null}
              <button
                type="button"
                className="button button--primary"
                disabled={!listeningTranscript.trim() || isEvaluating}
                onClick={() => void handleListeningCheck()}
              >
                {isEvaluating ? "Correction…" : "Vérifier"}
              </button>
            </div>
          ) : null}

          {listeningChecked && listeningIsCorrect !== null ? (
            <PracticeReviewCard
              isCorrect={listeningIsCorrect}
              errorType={listeningErrorType}
              review={listeningReview}
              expectedAnswer={currentListeningExercise.japanese}
              expectedKana={currentListeningExercise.japanese_kana}
              expectedAlt={currentListeningExercise.french}
              userAnswer={listeningTranscript}
              diffGranularity="character"
              onGrammar={() =>
                handleGrammarLink(
                  flattenPracticeReview(listeningReview) ?? "écoute",
                  currentListeningExercise.japanese,
                )
              }
            />
          ) : null}

          <TeacherChat
            key={`ecoute-${listeningIndex}`}
            prompt={currentListeningExercise.french}
            expectedAnswer={currentListeningExercise.japanese}
            userAnswer={listeningTranscript}
            mode="ecoute"
            resetKey={`ecoute-${listeningIndex}`}
            defaultOpen={listeningChecked}
            variant={listeningChecked ? "afterReview" : "inline"}
            errorType={listeningErrorType}
            feedback={flattenPracticeReview(listeningReview)}
          />
        </div>

        {listeningChecked ? (
          <div className="phrasesTraining__sessionBar">
            <button className="button button--primary" type="button" onClick={handleListeningNext}>
              {listeningIndex + 1 >= listeningExercises.length
                ? "Voir le récapitulatif"
                : "Suivant →"}
            </button>
          </div>
        ) : (
          <div className="phrasesTraining__sessionBar">
            <button type="button" className="button" onClick={resetSession}>
              Quitter
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="formError" style={{ marginTop: "var(--space-3)" }}>
            {errorMessage}
          </div>
        )}

        <GrammarDrawer
          isOpen={showGrammarDrawer}
          isLoading={isLoadingGrammar}
          note={grammarNote}
          onClose={() => setShowGrammarDrawer(false)}
        />
      </div>
    );
  }

  // ===================== TRAINING =====================
  if (phase === "training" && currentExercise) {
    const isConjugation = activeTab === "conjugaison";
    const isParagraph =
      (activeTab === "phrases" && contentType === "paragraph") ||
      (activeTab === "jlpt" && jlptType === "paragraph");

    const answerDirection =
      currentExercise.direction ?? (activeTab === "jlpt" ? jlptDirection : direction);
    const promptLabel = isConjugation
      ? "Conjugue"
      : activeTab === "construction"
        ? "Assemble la phrase"
        : answerDirection === "jp-to-fr"
          ? "Traduis en français"
          : "Traduis en japonais";

    return (
      <div className="phrasesTraining phrasesTraining--session">
        <div className="phrasesTraining__progressBar">
          <div
            className="phrasesTraining__progressFill"
            style={{
              width: `${((currentIndex + (hasCheckedCurrent ? 1 : 0)) / exercises.length) * 100}%`,
            }}
          />
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="phrasesTraining__topBar">
          <span className="phrasesTraining__counter">
            {currentIndex + 1} / {exercises.length}
          </span>
          <button className="button" type="button" onClick={handleFinishEarly}>
            Terminer
          </button>
        </div>

        <div
          className={`phrasesTraining__card${isEvaluating ? " phrasesTraining__card--busy" : ""}`}
        >
          {isEvaluating ? (
            <div className="phrasesTraining__overlay" aria-live="polite">
              <span className="phrasesTraining__overlayPill">
                <span className="phrasesTraining__spinner" aria-hidden="true" />
                Correction…
              </span>
            </div>
          ) : null}
          <div className="phrasesTraining__promptBlock">
            <p className="phrasesTraining__promptLabel">{promptLabel}</p>
            <div
              className={`phrasesTraining__prompt${isConjugation ? " phrasesTraining__prompt--verb" : ""}`}
            >
              {currentExercise.prompt}
            </div>
          </div>

          <div className="phrasesTraining__inputArea">
            {isConjugation ? (
              <input
                ref={inputRef}
                className="phrasesTraining__answer phrasesTraining__answer--single"
                value={userAnswer}
                onChange={(event) => setUserAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (!hasCheckedCurrent && userAnswer.trim()) handleCheck();
                    else if (hasCheckedCurrent) handleNext();
                  }
                }}
                placeholder="Ta conjugaison…"
                disabled={hasCheckedCurrent}
              />
            ) : activeTab === "construction" && currentExercise.blocks ? (
              <SentenceBuilder
                blocks={currentExercise.blocks}
                separator={currentExercise.blockSeparator ?? ""}
                disabled={hasCheckedCurrent}
                resetKey={currentIndex}
                onChange={(orderedIndices) => {
                  if (!currentExercise.blocks) return;
                  setUserAnswer(
                    joinBlocks(
                      currentExercise.blocks,
                      orderedIndices,
                      currentExercise.blockSeparator ?? "",
                    ),
                  );
                }}
              />
            ) : (
              <div className="phrasesTraining__inputRow">
                <textarea
                  ref={textareaRef}
                  className="phrasesTraining__textarea"
                  placeholder="Écris ta réponse…"
                  value={userAnswer}
                  onChange={(event) => setUserAnswer(event.target.value)}
                  disabled={hasCheckedCurrent}
                  spellCheck={answerDirection === "jp-to-fr"}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  lang={answerDirection === "jp-to-fr" ? "fr" : "ja"}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !hasCheckedCurrent) {
                      event.preventDefault();
                      handleCheck();
                    }
                  }}
                  rows={isParagraph ? 5 : 2}
                />
                <VoiceButton
                  onTranscript={handleVoiceTranscript}
                  lang={getVoiceLang()}
                  disabled={hasCheckedCurrent}
                />
              </div>
            )}
          </div>

          {!hasCheckedCurrent && (
            <div className="phrasesTraining__actionRow">
              <button
                className="button button--primary"
                type="button"
                onClick={handleCheck}
                disabled={!userAnswer.trim() || isEvaluating}
              >
                {isEvaluating ? "Correction…" : isRetryingPhrase ? "Corriger" : "Vérifier"}
                <kbd className="kbdHint">Ctrl+↵</kbd>
              </button>
              {!isConjugation && (
                <button className="button" type="button" onClick={handleSkip}>
                  Passer
                </button>
              )}
            </div>
          )}

          {isRetryingPhrase && currentHint ? (
            <div className="phrasesTraining__hint">
              <div className="phrasesTraining__hintTitle">Presque — un indice</div>
              <p className="phrasesTraining__hintText">{currentHint}</p>
              <button className="button" type="button" onClick={revealPhraseCorrection}>
                Voir la correction
              </button>
            </div>
          ) : null}

          {errorMessage && !hasCheckedCurrent && (
            <div className="formError" style={{ marginTop: "var(--space-4)" }}>
              {errorMessage}
            </div>
          )}

          {hasCheckedCurrent && currentIsCorrect !== null ? (
            <PracticeReviewCard
              isCorrect={currentIsCorrect}
              errorType={currentErrorType}
              review={currentReview}
              expectedAnswer={currentExercise.answer}
              expectedKana={currentExercise.answerAlt}
              userAnswer={userAnswer}
              diffGranularity={
                activeTab === "phrases" && direction === "jp-to-fr" ? "word" : "character"
              }
              explanation={currentExercise.explanation}
              onGrammar={
                currentIsCorrect
                  ? undefined
                  : () =>
                      handleGrammarLink(
                        currentFeedback ?? currentReview?.summary ?? "erreur",
                        currentExercise.prompt,
                      )
              }
            />
          ) : null}

          <TeacherChat
            key={`${activeTab}-${currentIndex}`}
            prompt={currentExercise.prompt}
            expectedAnswer={currentExercise.answer}
            userAnswer={userAnswer}
            direction={currentExercise.direction ?? direction}
            mode={activeTab}
            resetKey={`${activeTab}-${currentIndex}`}
            defaultOpen={hasCheckedCurrent}
            variant={hasCheckedCurrent ? "afterReview" : "inline"}
            errorType={currentErrorType}
            feedback={currentFeedback}
          />
        </div>

        {hasCheckedCurrent ? (
          <div className="phrasesTraining__sessionBar">
            <button className="button button--primary" type="button" onClick={handleNext}>
              {currentIndex + 1 >= exercises.length ? "Voir le récapitulatif" : "Suivant →"}
              <kbd className="kbdHint">Ctrl+→</kbd>
            </button>
          </div>
        ) : null}

        <GrammarDrawer
          isOpen={showGrammarDrawer}
          isLoading={isLoadingGrammar}
          note={grammarNote}
          onClose={() => setShowGrammarDrawer(false)}
        />
      </div>
    );
  }

  // ===================== LISTENING RECAP =====================
  if (phase === "recap" && activeTab === "ecoute") {
    const listeningCorrectCount = listeningResults.filter((result) => result.isCorrect).length;
    const listeningIncorrectCount = listeningResults.filter(
      (result) => result.isCorrect === false,
    ).length;

    return (
      <div className="phrasesRecap">
        <h2 className="phrasesRecap__title">Récapitulatif — Écoute</h2>

        <div className="phrasesRecap__summary">
          <span className="phrasesRecap__stat phrasesRecap__stat--success">
            ✓ {listeningCorrectCount} réussie(s)
          </span>
          <span className="phrasesRecap__stat phrasesRecap__stat--error">
            ✗ {listeningIncorrectCount} incorrecte(s)
          </span>
        </div>

        {listeningResults.length > 0 && (
          <div className="phrasesRecap__tableWrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Japonais attendu</th>
                  <th>Ta transcription</th>
                  <th>Résultat</th>
                  <th>Sauvegarder</th>
                </tr>
              </thead>
              <tbody>
                {listeningResults.map((result, index) => (
                  <tr key={`${result.exercise.japanese}-${index}`}>
                    <td className="muted">{index + 1}</td>
                    <td>
                      {result.exercise.japanese}
                      <AudioButton text={result.exercise.japanese} size="small" />
                      <div style={{ fontSize: "12px", color: "var(--color-text-soft)" }}>
                        {result.exercise.french}
                      </div>
                    </td>
                    <td>{result.userTranscript || <span className="muted">—</span>}</td>
                    <td>
                      {result.revealed && (
                        <span style={{ fontSize: "11px", color: "var(--color-text-soft)" }}>
                          (révélé){" "}
                        </span>
                      )}
                      {result.isCorrect ? (
                        <span style={{ color: "var(--color-success)" }}>✓</span>
                      ) : (
                        <span style={{ color: "var(--color-danger)" }}>✗</span>
                      )}
                      {result.feedback && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-soft)",
                            marginTop: "2px",
                          }}
                        >
                          {result.feedback}
                        </div>
                      )}
                    </td>
                    <td>
                      <SavePhraseButton
                        french={result.exercise.french}
                        japanese={result.exercise.japanese}
                        japaneseKana={result.exercise.japanese_kana}
                        source="ecoute"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="phrasesRecap__actions">
          <button className="button button--primary" type="button" onClick={resetSession}>
            Recommencer
          </button>
          <Link className="button" to="/">
            Retour
          </Link>
        </div>
      </div>
    );
  }

  // ===================== RECAP =====================
  return (
    <div className="phrasesRecap">
      <h2 className="phrasesRecap__title">Récapitulatif</h2>

      <div className="phrasesRecap__summary">
        <span className="phrasesRecap__stat phrasesRecap__stat--success">
          ✓ {recapStats.correct} réussie(s)
        </span>
        <span className="phrasesRecap__stat phrasesRecap__stat--error">
          ✗ {recapStats.incorrect} incorrecte(s)
        </span>
        {recapStats.skipped > 0 && (
          <span className="phrasesRecap__stat phrasesRecap__stat--skipped">
            — {recapStats.skipped} passée(s)
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="phrasesRecap__tableWrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Ta réponse</th>
                <th>Attendue</th>
                <th>Résultat</th>
                <th>Phrase</th>
                {activeTab === "jlpt" && <th>Vocab</th>}
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.exercise.prompt + String(index)}>
                  <td className="muted">{index + 1}</td>
                  <td>{result.exercise.prompt}</td>
                  <td>{result.userAnswer || <span className="muted">—</span>}</td>
                  <td className="muted">{result.exercise.answer}</td>
                  <td>
                    {result.isCorrect === null ? (
                      <span className="muted">Passée</span>
                    ) : result.isCorrect ? (
                      <span style={{ color: "var(--color-success)" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--color-danger)" }}>✗</span>
                    )}
                  </td>
                  <td>
                    <SavePhraseButton
                      french={
                        result.exercise.frenchPrompt ??
                        (direction === "jp-to-fr" ? result.exercise.answer : result.exercise.prompt)
                      }
                      japanese={
                        direction === "jp-to-fr" ? result.exercise.prompt : result.exercise.answer
                      }
                      source={activeTab}
                    />
                  </td>
                  {activeTab === "jlpt" && (
                    <td>
                      {addedToVocab.has(index) ? (
                        <span className="muted">✓</span>
                      ) : (
                        <button
                          type="button"
                          className="button"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={async () => {
                            try {
                              const allTags = await fetchTags();
                              let jlptTag = allTags.find((tag) => tag.name === `JLPT ${jlptLevel}`);
                              if (!jlptTag) jlptTag = await createTag(`JLPT ${jlptLevel}`);
                              const isJpToFr = jlptDirection === "jp-to-fr";
                              const japanese = isJpToFr
                                ? result.exercise.prompt
                                : result.exercise.answer;
                              const french = isJpToFr
                                ? result.exercise.answer
                                : result.exercise.prompt;
                              await createWord({ french, kana: japanese, tagIds: [jlptTag.id] });
                              setAddedToVocab((previous) => new Set(previous).add(index));
                            } catch {
                              setErrorMessage("Erreur lors de l'ajout");
                            }
                          }}
                        >
                          + Vocab
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorMessage && <div className="formError">{errorMessage}</div>}

      <div className="phrasesRecap__actions">
        {(activeTab === "phrases" || activeTab === "construction") && (
          <button
            className="button button--primary"
            type="button"
            onClick={handleSubmitReviews}
            disabled={isSubmittingReviews || reviewsSubmitted}
          >
            {reviewsSubmitted
              ? "SRS enregistré ✓"
              : isSubmittingReviews
                ? "Enregistrement en cours…"
                : errorMessage
                  ? "Réessayer l'enregistrement"
                  : "Enregistrer dans le SRS"}
          </button>
        )}
        {activeTab === "jlpt" && (
          <button
            className="button"
            type="button"
            disabled={isAddingAll || addedToVocab.size === results.length}
            onClick={async () => {
              setIsAddingAll(true);
              try {
                const allTags = await fetchTags();
                let jlptTag = allTags.find((tag) => tag.name === `JLPT ${jlptLevel}`);
                if (!jlptTag) jlptTag = await createTag(`JLPT ${jlptLevel}`);
                const newAdded = new Set(addedToVocab);
                for (let i = 0; i < results.length; i++) {
                  if (newAdded.has(i)) continue;
                  const result = results[i];
                  const isJpToFr = jlptDirection === "jp-to-fr";
                  const japanese = isJpToFr ? result.exercise.prompt : result.exercise.answer;
                  const french = isJpToFr ? result.exercise.answer : result.exercise.prompt;
                  await createWord({ french, kana: japanese, tagIds: [jlptTag.id] });
                  newAdded.add(i);
                }
                setAddedToVocab(newAdded);
              } catch {
                setErrorMessage("Erreur lors de l'ajout");
              } finally {
                setIsAddingAll(false);
              }
            }}
          >
            {addedToVocab.size === results.length
              ? "Tous ajoutés ✓"
              : isAddingAll
                ? "Ajout…"
                : "Ajouter tout au vocabulaire"}
          </button>
        )}
        <button className="button button--primary" type="button" onClick={resetSession}>
          Recommencer
        </button>
        <Link className="button" to="/">
          Retour
        </Link>
      </div>

      <GrammarDrawer
        isOpen={showGrammarDrawer}
        isLoading={isLoadingGrammar}
        note={grammarNote}
        onClose={() => setShowGrammarDrawer(false)}
      />
    </div>
  );
}

function PracticeReviewCard({
  isCorrect,
  errorType,
  review,
  expectedAnswer,
  expectedKana,
  expectedAlt,
  userAnswer,
  diffGranularity,
  explanation,
  onGrammar,
}: {
  isCorrect: boolean;
  errorType: string | null;
  review: PracticeReview | null;
  expectedAnswer: string;
  expectedKana?: string | null;
  expectedAlt?: string | null;
  userAnswer: string;
  diffGranularity: "word" | "character";
  explanation?: string;
  onGrammar?: () => void;
}) {
  const errorLabel = errorType ? (ERROR_TYPE_LABELS[errorType] ?? errorType) : null;
  const kanaReading = expectedKana && hasJapaneseScript(expectedKana) ? expectedKana : null;
  const frenchAlt = expectedAlt && !hasJapaneseScript(expectedAlt) ? expectedAlt : null;

  return (
    <div className="phrasesTraining__feedback">
      <div className="phrasesTraining__verdict">
        <div
          className={`phrasesTraining__resultBadge ${isCorrect ? "phrasesTraining__resultBadge--success" : "phrasesTraining__resultBadge--error"}`}
        >
          {isCorrect ? "Juste" : "À revoir"}
        </div>
        {errorLabel && !isCorrect ? (
          <span className="phrasesTraining__errorType">{errorLabel}</span>
        ) : null}
      </div>

      <AnswerDiff
        userAnswer={userAnswer.trim()}
        expectedAnswer={expectedAnswer}
        expectedKana={kanaReading}
        granularity={diffGranularity}
      />

      {frenchAlt ? <div className="phrasesTraining__expectedKana">{frenchAlt}</div> : null}

      {review?.summary ? (
        <div className="phrasesTraining__tip">
          <div className="phrasesTraining__tipTitle">{isCorrect ? "Retour" : "L’erreur"}</div>
          <div className="phrasesTraining__tipContent">{review.summary}</div>
        </div>
      ) : null}

      {review?.rule ? (
        <div className="phrasesTraining__tip">
          <div className="phrasesTraining__tipTitle">La règle</div>
          <div className="phrasesTraining__tipContent">{review.rule}</div>
        </div>
      ) : null}

      {review?.example ? (
        <div className="phrasesTraining__tip">
          <div className="phrasesTraining__tipTitle">Exemple</div>
          <div className="phrasesTraining__tipContent">{review.example}</div>
        </div>
      ) : null}

      {onGrammar ? (
        <button type="button" className="button phrasesTraining__grammarBtn" onClick={onGrammar}>
          Comprendre cette erreur
        </button>
      ) : null}

      {explanation ? <div className="phrasesTraining__explanation">{explanation}</div> : null}
    </div>
  );
}

function GrammarDrawer({
  isOpen,
  isLoading,
  note,
  onClose,
}: {
  isOpen: boolean;
  isLoading: boolean;
  note: GrammarNote | null;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <dialog className="grammarDrawer" open aria-label="Explication grammaticale">
      <button
        type="button"
        className="grammarDrawer__backdrop"
        onClick={onClose}
        aria-label="Fermer"
      />
      <div className="grammarDrawer__panel">
        <div className="grammarDrawer__header">
          <h3 className="grammarDrawer__title">Explication grammaticale</h3>
          <button type="button" className="button" onClick={onClose}>
            Fermer
          </button>
        </div>
        {isLoading ? (
          <div className="muted">Chargement…</div>
        ) : note ? (
          <div className="grammarDrawer__body">
            <h4>{note.topic}</h4>
            {note.content}
          </div>
        ) : (
          <div className="muted">Impossible de charger la note de grammaire.</div>
        )}
      </div>
    </dialog>
  );
}

function SavePhraseButton({
  french,
  japanese,
  japaneseKana,
  source,
}: {
  french: string;
  japanese: string;
  japaneseKana?: string;
  source: string;
}) {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (isSaved)
    return (
      <span className="muted" style={{ fontSize: "12px" }}>
        ✓ Sauvé
      </span>
    );

  return (
    <button
      type="button"
      className="button"
      style={{ padding: "2px 8px", fontSize: 12 }}
      disabled={isSaving}
      onClick={async () => {
        setIsSaving(true);
        try {
          await savePhrase({ french, japanese, japanese_kana: japaneseKana, source });
          setIsSaved(true);
        } catch {
          // ignore
        } finally {
          setIsSaving(false);
        }
      }}
    >
      {isSaving ? "..." : "Sauvegarder"}
    </button>
  );
}

function SetupStep({
  index,
  title,
  hint,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="pratiqueStep">
      <header className="pratiqueStep__header">
        <span className="pratiqueStep__index">{index}</span>
        <div>
          <h2 className="pratiqueStep__title">{title}</h2>
          {hint ? <p className="pratiqueStep__hint">{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function SetupChoices<Value extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: Value; title: string; text: string }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div className={`pratiqueChoiceGrid${options.length > 2 ? " pratiqueChoiceGrid--three" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`pratiqueChoice${value === option.value ? " pratiqueChoice--active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          <span className="pratiqueChoice__title">{option.title}</span>
          <span className="pratiqueChoice__text">{option.text}</span>
        </button>
      ))}
    </div>
  );
}

function CountChoices({
  values,
  value,
  onChange,
  unit,
}: {
  values: number[];
  value: number;
  onChange: (value: number) => void;
  unit: string;
}) {
  return (
    <fieldset className="pratiqueCount" aria-label={unit}>
      {values.map((count) => (
        <button
          key={count}
          type="button"
          className={`pratiqueCount__btn${value === count ? " pratiqueCount__btn--active" : ""}`}
          onClick={() => onChange(count)}
        >
          {count}
        </button>
      ))}
    </fieldset>
  );
}

function SeriesPicker({
  tags,
  selectedIds,
  multiple,
  onChange,
}: {
  tags: Tag[];
  selectedIds: number[];
  multiple: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTags = normalizedQuery
    ? tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery))
    : tags;
  const allSelected = multiple && tags.length > 0 && selectedIds.length === tags.length;

  if (tags.length === 0) {
    return (
      <p className="pratiqueStep__empty">
        Ajoute des mots dans Vocabulaire : tes séries apparaîtront ici.
      </p>
    );
  }

  return (
    <div className="pratiqueSeries">
      {tags.length > 6 ? (
        <SearchBar
          className="pratiqueSeries__search"
          value={query}
          onChange={setQuery}
          placeholder="Filtrer les séries…"
          countLabel={
            normalizedQuery
              ? `${visibleTags.length} série${visibleTags.length > 1 ? "s" : ""}`
              : undefined
          }
        />
      ) : null}
      {multiple && tags.length > 1 ? (
        <div className="pratiqueSeries__toolbar">
          <button
            type="button"
            className="pratique__selectAll"
            onClick={() => onChange(allSelected ? [] : tags.map((tag) => tag.id))}
          >
            {allSelected ? "Aucune" : "Toutes"}
          </button>
          <span className="pratiqueSeries__count">
            {selectedIds.length} sélectionnée{selectedIds.length > 1 ? "s" : ""}
          </span>
        </div>
      ) : null}
      <div className="pratique__chipGrid">
        {visibleTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className={`pratique__chip ${selectedIds.includes(tag.id) ? "pratique__chip--active" : ""}`}
            onClick={() => {
              if (multiple) {
                onChange(
                  selectedIds.includes(tag.id)
                    ? selectedIds.filter((id) => id !== tag.id)
                    : [...selectedIds, tag.id],
                );
                return;
              }
              onChange(selectedIds[0] === tag.id ? [] : [tag.id]);
            }}
          >
            {tag.name}
          </button>
        ))}
      </div>
      {visibleTags.length === 0 ? (
        <p className="pratiqueStep__empty">Aucune série ne correspond.</p>
      ) : null}
    </div>
  );
}
