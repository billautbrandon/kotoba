import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BulkReviewsError,
  type ConjugationEvaluation,
  type ConjugationExercise,
  type ConstructionBlock,
  type GeminiQuota,
  type GeneratedPhrase,
  type JlptConstraints,
  type JlptExercise,
  type PhraseConstraints,
  type PhraseEvaluation,
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
  generateConjugationExercises,
  generateConstructionPhrases,
  generateJlptExercises,
  generateListeningExercises,
  generatePhrases,
  savePhrase,
  submitBulkReviews,
  type ListeningExercise,
  type GrammarNote,
} from "../../api";
import { AnswerDiff } from "../components/AnswerDiff";
import { AudioButton } from "../components/AudioButton";
import { QuotaBar } from "../components/QuotaBar";
import { SentenceBuilder, joinBlocks } from "../components/SentenceBuilder";
import { TeacherChat } from "../components/TeacherChat";
import { VoiceButton } from "../components/VoiceButton";

type PratiqueTab = "phrases" | "jlpt" | "conjugaison" | "construction" | "ecoute";
type PratiquePhase = "setup" | "training" | "recap";
type SentenceLength = "short" | "medium" | "long";

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
};

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
  const initialTab = (searchParams.get("tab") as PratiqueTab) || "phrases";
  const [activeTab, setActiveTab] = useState<PratiqueTab>(initialTab);
  const [phase, setPhase] = useState<PratiquePhase>("setup");

  // Shared state
  const [tags, setTags] = useState<Tag[]>([]);
  const [quota, setQuota] = useState<GeminiQuota | null>(null);
  const [exercises, setExercises] = useState<UnifiedExercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [hasCheckedCurrent, setHasCheckedCurrent] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<string | null>(null);
  const [currentIsCorrect, setCurrentIsCorrect] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);

  // Phrases state (restored from localStorage on first render)
  const persistedPhrases = useMemo(() => loadPhrasesSettings(), []);
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
    persistedPhrases?.contentType ?? "phrases",
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
  const [listeningDifficulty, setListeningDifficulty] = useState<"debutant" | "intermediaire">("debutant");
  const [listeningCount, setListeningCount] = useState(5);
  const [listeningExercises, setListeningExercises] = useState<ListeningExercise[]>([]);
  const [listeningIndex, setListeningIndex] = useState(0);
  const [listeningTranscript, setListeningTranscript] = useState("");
  const [listeningRevealed, setListeningRevealed] = useState(false);
  const [listeningResults, setListeningResults] = useState<Array<{
    exercise: ListeningExercise;
    userTranscript: string;
    isCorrect: boolean | null;
    feedback: string | null;
    revealed: boolean;
  }>>([]);
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
    Promise.all([fetchTags(), fetchGeminiQuota()])
      .then(([loadedTags, loadedQuota]) => {
        setTags(loadedTags);
        setQuota(loadedQuota);
      })
      .catch(() => {});
  }, []);

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
  ]);

  function handleTabChange(tab: PratiqueTab) {
    if (phase !== "setup") return;
    setActiveTab(tab);
    setSearchParams({ tab });
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
    setCurrentIsCorrect(null);
    setErrorMessage(null);
    setReviewsSubmitted(false);
    setAddedToVocab(new Set());
    setConjEvaluationCache(new Map());
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
        count: phraseCount,
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
    utterance.onstart = () => { setListeningIsPlaying(true); setListeningIsPaused(false); };
    utterance.onend = () => { setListeningIsPlaying(false); setListeningIsPaused(false); listeningUtteranceRef.current = null; };
    utterance.onerror = () => { setListeningIsPlaying(false); setListeningIsPaused(false); listeningUtteranceRef.current = null; };
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
      setListeningResults((previous) => [...previous, {
        exercise: currentListeningExercise,
        userTranscript: listeningTranscript.trim(),
        isCorrect: evaluation.isCorrect ?? false,
        feedback: evaluation.feedback ?? null,
        revealed: listeningRevealed,
      }]);
      if (listeningIndex + 1 < listeningExercises.length) {
        setListeningIndex(listeningIndex + 1);
        setListeningTranscript("");
        setListeningRevealed(false);
      } else {
        setPhase("recap");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur de vérification");
    } finally {
      setIsEvaluating(false);
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
      if (activeTab === "phrases") {
        const evaluation = await evaluatePhrase(
          userAnswer.trim(),
          currentExercise.answer,
          currentExercise.prompt,
          direction,
        );
        setCurrentIsCorrect(evaluation.isCorrect);
        setCurrentFeedback(evaluation.feedback);
      } else if (activeTab === "construction") {
        const exerciseDirection = currentExercise.direction ?? direction;
        const evaluation = await evaluatePhrase(
          userAnswer.trim(),
          currentExercise.answer,
          currentExercise.frenchPrompt ?? currentExercise.prompt,
          exerciseDirection,
        );
        setCurrentIsCorrect(evaluation.isCorrect);
        setCurrentFeedback(evaluation.feedback);
      } else if (activeTab === "jlpt") {
        const evaluation = await evaluateJlptAnswer(
          userAnswer.trim(),
          currentExercise.answer,
          currentExercise.prompt,
          jlptDirection,
        );
        setCurrentIsCorrect(evaluation.isCorrect);
        setCurrentFeedback(evaluation.feedback);
      } else {
        const result = await evaluateConjugation(
          currentExercise.prompt,
          currentExercise.answer,
          userAnswer.trim(),
        );
        setCurrentIsCorrect(result.evaluation.isCorrect);
        setCurrentFeedback(result.evaluation.explanation);
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
      setUserAnswer("");
      setCurrentIsCorrect(null);
      setCurrentFeedback(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
      setTimeout(() => {
        if (activeTab === "conjugaison") inputRef.current?.focus();
      }, 50);
    }
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
      setUserAnswer("");
      setCurrentIsCorrect(null);
      setCurrentFeedback(null);
      setHasCheckedCurrent(false);
      setErrorMessage(null);
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
        handleRestartRef.current();
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

  // ===================== SETUP =====================
  if (phase === "setup") {
    return (
      <div className="pratique">
        <div className="pratique__tabs">
          {(["phrases", "construction", "jlpt", "conjugaison", "ecoute"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`pratique__tab ${activeTab === tab ? "pratique__tab--active" : ""}`}
              onClick={() => handleTabChange(tab)}
            >
              {tab === "phrases"
                ? "Phrases"
                : tab === "construction"
                  ? "Construction"
                  : tab === "jlpt"
                    ? "JLPT N5"
                    : tab === "conjugaison"
                      ? "Conjugaison"
                      : "Écoute"}
            </button>
          ))}
        </div>

        {quota && <QuotaBar quota={quota} />}

        <div className="pratique__setup">
          {activeTab === "phrases" && (
            <>
              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">Direction</div>
                  <div className="pratique__toggleRow">
                    <button
                      type="button"
                      className={`pratique__toggle ${direction === "fr-to-jp" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setDirection("fr-to-jp")}
                    >
                      FR → JP
                    </button>
                    <button
                      type="button"
                      className={`pratique__toggle ${direction === "jp-to-fr" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setDirection("jp-to-fr")}
                    >
                      JP → FR
                    </button>
                  </div>
                </div>
                <div className="pratique__field">
                  <div className="pratique__label">Type</div>
                  <div className="pratique__toggleRow">
                    <button
                      type="button"
                      className={`pratique__toggle ${contentType === "phrases" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setContentType("phrases")}
                    >
                      Phrases
                    </button>
                    <button
                      type="button"
                      className={`pratique__toggle ${contentType === "paragraph" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setContentType("paragraph")}
                    >
                      Histoire
                    </button>
                  </div>
                </div>
              </div>

              <div className="pratique__field">
                <div className="pratique__label">Tags</div>
                <div className="pratique__chipGrid">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`pratique__chip ${selectedTagIds.includes(tag.id) ? "pratique__chip--active" : ""}`}
                      onClick={() =>
                        setSelectedTagIds((previous) =>
                          previous.includes(tag.id)
                            ? previous.filter((id) => id !== tag.id)
                            : [...previous, tag.id],
                        )
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pratique__field">
                <div className="pratique__label">Particules</div>
                <div className="pratique__chipGrid">
                  {AVAILABLE_PARTICLES.map((particle) => (
                    <button
                      key={particle}
                      type="button"
                      className={`pratique__chip pratique__chip--particle ${selectedParticles.includes(particle) ? "pratique__chip--active" : ""}`}
                      onClick={() =>
                        setSelectedParticles((previous) =>
                          previous.includes(particle)
                            ? previous.filter((p) => p !== particle)
                            : [...previous, particle],
                        )
                      }
                    >
                      {particle}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pratique__row pratique__row--grammar">
                <div className="pratique__field pratique__field--compact">
                  <div className="pratique__label">Temps</div>
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
                <div className="pratique__field pratique__field--compact">
                  <div className="pratique__label">Polarité</div>
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
                <div className="pratique__field pratique__field--compact">
                  <div className="pratique__label">Politesse</div>
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

              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">
                    {contentType === "phrases"
                      ? "Nombre de phrases"
                      : "Nombre de phrases (histoire)"}
                  </div>
                  <div className="pratique__toggleRow">
                    {[1, 3, 5, 8, 10].map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`pratique__toggle pratique__toggle--sm ${phraseCount === count ? "pratique__toggle--active" : ""}`}
                        onClick={() => setPhraseCount(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pratique__field">
                  <div className="pratique__label">Longueur des phrases</div>
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
              </div>

              <div className="pratique__field">
                <div className="pratique__label">
                  Vocabulaire envoyé à l'IA : <strong>{vocabSampleSize}</strong> mots aléatoires
                </div>
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
                <div className="pratique__hint">
                  Si l'IA renvoie une erreur JSON ou met du temps à répondre, réduis cette valeur.
                </div>
              </div>

              {contentType === "paragraph" && (
                <div className="pratique__field">
                  <div className="pratique__label">Kanji</div>
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
              )}

              {!showContext ? (
                <button
                  type="button"
                  className="pratique__contextToggle"
                  onClick={() => setShowContext(true)}
                >
                  + Ajouter un contexte
                </button>
              ) : (
                <div className="pratique__field">
                  <div className="pratique__label">Contexte (optionnel)</div>
                  <textarea
                    className="pratique__textarea"
                    placeholder="Ex : Utilise des phrases simples du quotidien…"
                    value={customContext}
                    onChange={(event) => setCustomContext(event.target.value)}
                    maxLength={500}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}

          {activeTab === "construction" && (
            <>
              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">Direction</div>
                  <div className="pratique__toggleRow">
                    <button
                      type="button"
                      className={`pratique__toggle ${direction === "fr-to-jp" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setDirection("fr-to-jp")}
                    >
                      FR → JP
                    </button>
                    <button
                      type="button"
                      className={`pratique__toggle ${direction === "jp-to-fr" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setDirection("jp-to-fr")}
                    >
                      JP → FR
                    </button>
                  </div>
                </div>
              </div>

              <div className="pratique__field">
                <div className="pratique__label">Tags</div>
                <div className="pratique__chipGrid">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`pratique__chip ${selectedTagIds.includes(tag.id) ? "pratique__chip--active" : ""}`}
                      onClick={() =>
                        setSelectedTagIds((previous) =>
                          previous.includes(tag.id)
                            ? previous.filter((id) => id !== tag.id)
                            : [...previous, tag.id],
                        )
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pratique__field">
                <div className="pratique__label">Particules</div>
                <div className="pratique__chipGrid">
                  {AVAILABLE_PARTICLES.map((particle) => (
                    <button
                      key={particle}
                      type="button"
                      className={`pratique__chip pratique__chip--particle ${selectedParticles.includes(particle) ? "pratique__chip--active" : ""}`}
                      onClick={() =>
                        setSelectedParticles((previous) =>
                          previous.includes(particle)
                            ? previous.filter((p) => p !== particle)
                            : [...previous, particle],
                        )
                      }
                    >
                      {particle}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pratique__row pratique__row--grammar">
                <div className="pratique__field pratique__field--compact">
                  <div className="pratique__label">Temps</div>
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
                <div className="pratique__field pratique__field--compact">
                  <div className="pratique__label">Polarité</div>
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
                <div className="pratique__field pratique__field--compact">
                  <div className="pratique__label">Politesse</div>
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

              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">Nombre de phrases</div>
                  <div className="pratique__toggleRow">
                    {[1, 3, 5, 8, 10].map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`pratique__toggle pratique__toggle--sm ${phraseCount === count ? "pratique__toggle--active" : ""}`}
                        onClick={() => setPhraseCount(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pratique__field">
                  <div className="pratique__label">Longueur des phrases</div>
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
              </div>

              <div className="pratique__field">
                <div className="pratique__label">
                  Vocabulaire envoyé à l'IA : <strong>{vocabSampleSize}</strong> mots aléatoires
                </div>
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
                <div className="pratique__hint">
                  Si l'IA renvoie une erreur JSON ou met du temps à répondre, réduis cette valeur.
                </div>
              </div>

              {!showContext ? (
                <button
                  type="button"
                  className="pratique__contextToggle"
                  onClick={() => setShowContext(true)}
                >
                  + Ajouter un contexte
                </button>
              ) : (
                <div className="pratique__field">
                  <div className="pratique__label">Contexte (optionnel)</div>
                  <textarea
                    className="pratique__textarea"
                    placeholder="Ex : Phrases du quotidien, vocabulaire de cuisine…"
                    value={customContext}
                    onChange={(event) => setCustomContext(event.target.value)}
                    maxLength={500}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}

          {activeTab === "jlpt" && (
            <>
              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">Direction</div>
                  <div className="pratique__toggleRow">
                    <button
                      type="button"
                      className={`pratique__toggle ${jlptDirection === "fr-to-jp" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setJlptDirection("fr-to-jp")}
                    >
                      FR → JP
                    </button>
                    <button
                      type="button"
                      className={`pratique__toggle ${jlptDirection === "jp-to-fr" ? "pratique__toggle--active" : ""}`}
                      onClick={() => setJlptDirection("jp-to-fr")}
                    >
                      JP → FR
                    </button>
                  </div>
                </div>
                <div className="pratique__field">
                  <div className="pratique__label">Type</div>
                  <div className="pratique__toggleRow">
                    {(["words", "phrases", "paragraph"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`pratique__toggle pratique__toggle--sm ${jlptType === type ? "pratique__toggle--active" : ""}`}
                        onClick={() => setJlptType(type)}
                      >
                        {{ words: "Mots", phrases: "Phrases", paragraph: "Paragraphe" }[type]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">Kanji</div>
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
                {jlptType !== "paragraph" ? (
                  <div className="pratique__field">
                    <div className="pratique__label">Nombre</div>
                    <div className="pratique__toggleRow">
                      {[3, 5, 8, 10, 15].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={`pratique__toggle pratique__toggle--sm ${jlptCount === count ? "pratique__toggle--active" : ""}`}
                          onClick={() => setJlptCount(count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="pratique__field">
                    <div className="pratique__label">Longueur</div>
                    <div className="pratique__toggleRow">
                      {(["short", "medium", "long"] as const).map((length) => (
                        <button
                          key={length}
                          type="button"
                          className={`pratique__toggle pratique__toggle--sm ${jlptParagraphLength === length ? "pratique__toggle--active" : ""}`}
                          onClick={() => setJlptParagraphLength(length)}
                        >
                          {{ short: "Court", medium: "Moyen", long: "Long" }[length]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {!showContext ? (
                <button
                  type="button"
                  className="pratique__contextToggle"
                  onClick={() => setShowContext(true)}
                >
                  + Ajouter un contexte
                </button>
              ) : (
                <div className="pratique__field">
                  <div className="pratique__label">Contexte (optionnel)</div>
                  <textarea
                    className="pratique__textarea"
                    placeholder="Ex : Je veux pratiquer le vocabulaire de la nourriture…"
                    value={jlptContext}
                    onChange={(event) => setJlptContext(event.target.value)}
                    maxLength={500}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}

          {activeTab === "conjugaison" && (
            <>
              <div className="pratique__field">
                <div className="pratique__label">Série</div>
                <div className="pratique__chipGrid">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`pratique__chip ${conjTagId === tag.id ? "pratique__chip--active" : ""}`}
                      onClick={() => setConjTagId(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pratique__field">
                <div className="pratique__label">
                  Formes
                  <button
                    type="button"
                    className="pratique__selectAll"
                    onClick={() =>
                      setConjForms((previous) =>
                        previous.size === CONJUGATION_FORMS.length
                          ? new Set()
                          : new Set(CONJUGATION_FORMS),
                      )
                    }
                  >
                    {conjForms.size === CONJUGATION_FORMS.length ? "Aucune" : "Toutes"}
                  </button>
                </div>
                <div className="pratique__chipGrid">
                  {CONJUGATION_FORMS.map((form) => (
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
              </div>

              <div className="pratique__field">
                <div className="pratique__label">Nombre</div>
                <div className="pratique__toggleRow">
                  {[5, 10, 15, 20].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`pratique__toggle pratique__toggle--sm ${conjCount === count ? "pratique__toggle--active" : ""}`}
                      onClick={() => setConjCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "ecoute" && (
            <>
              <div className="pratique__field">
                <div className="pratique__label">Tags</div>
                <div className="pratique__chipGrid">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`pratique__chip ${listeningTagIds.includes(tag.id) ? "pratique__chip--active" : ""}`}
                      onClick={() => setListeningTagIds((previous) =>
                        previous.includes(tag.id) ? previous.filter((id) => id !== tag.id) : [...previous, tag.id]
                      )}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pratique__row">
                <div className="pratique__field">
                  <div className="pratique__label">Difficulté</div>
                  <div className="pratique__toggleRow">
                    <button type="button" className={`pratique__toggle ${listeningDifficulty === "debutant" ? "pratique__toggle--active" : ""}`} onClick={() => setListeningDifficulty("debutant")}>Débutant</button>
                    <button type="button" className={`pratique__toggle ${listeningDifficulty === "intermediaire" ? "pratique__toggle--active" : ""}`} onClick={() => setListeningDifficulty("intermediaire")}>Intermédiaire</button>
                  </div>
                </div>
                <div className="pratique__field">
                  <div className="pratique__label">Nombre de phrases</div>
                  <div className="pratique__toggleRow">
                    {[3, 5, 8].map((count) => (
                      <button key={count} type="button" className={`pratique__toggle pratique__toggle--sm ${listeningCount === count ? "pratique__toggle--active" : ""}`} onClick={() => setListeningCount(count)}>
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {errorMessage && <div className="formError">{errorMessage}</div>}

        <div className="pratique__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              ((activeTab === "phrases" || activeTab === "construction") &&
                (selectedTagIds.length === 0 || selectedParticles.length === 0)) ||
              (activeTab === "conjugaison" && (!conjTagId || conjForms.size === 0)) ||
              (activeTab === "ecoute" && listeningTagIds.length === 0)
            }
          >
            {isGenerating ? "Génération…" : "Générer"}
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
      <div className="phrasesTraining">
        <div className="phrasesTraining__progressBar">
          <div className="phrasesTraining__progressFill" style={{ width: `${((listeningIndex) / listeningExercises.length) * 100}%` }} />
        </div>
        <div className="phrasesTraining__counter">
          {listeningIndex + 1} / {listeningExercises.length}
        </div>

        <div className="phrasesTraining__card" style={{ textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "var(--color-text-soft)", marginBottom: "var(--space-4)" }}>
            Écoute et transcris en japonais
          </p>

          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", alignItems: "center", marginBottom: "var(--space-5)" }}>
            <button type="button" className="button" onClick={() => playListeningAudio(currentListeningExercise.japanese)}>
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
          />

          {listeningRevealed && (
            <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
              <p style={{ fontSize: "13px", color: "var(--color-text-soft)", margin: "0 0 var(--space-1)" }}>Texte attendu :</p>
              <p style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 var(--space-1)" }}>{currentListeningExercise.japanese}</p>
              <p style={{ fontSize: "13px", color: "var(--color-text-soft)", margin: 0 }}>{currentListeningExercise.french}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
            {!listeningRevealed && (
              <button type="button" className="button" onClick={() => setListeningRevealed(true)}>
                Révéler le texte
              </button>
            )}
            <button
              type="button"
              className="button button--primary"
              disabled={!listeningTranscript.trim() || isEvaluating}
              onClick={handleListeningCheck}
            >
              {isEvaluating ? "Vérification…" : "Vérifier"}
            </button>
          </div>
        </div>

        <div className="phrasesTraining__footActions">
          <button type="button" className="button" onClick={resetSession}>Quitter</button>
        </div>

        {errorMessage && <div className="formError" style={{ marginTop: "var(--space-3)" }}>{errorMessage}</div>}
      </div>
    );
  }

  // ===================== TRAINING =====================
  if (phase === "training" && currentExercise) {
    const isConjugation = activeTab === "conjugaison";
    const isParagraph =
      (activeTab === "phrases" && contentType === "paragraph") ||
      (activeTab === "jlpt" && jlptType === "paragraph");

    return (
      <div className="phrasesTraining">
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

        <div className="phrasesTraining__card">
          <div
            className="phrasesTraining__prompt"
            style={isConjugation ? { fontSize: 28 } : undefined}
          >
            {currentExercise.prompt}
          </div>

          <div className="phrasesTraining__inputArea">
            {isConjugation ? (
              <input
                ref={inputRef}
                className="input"
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
                {isEvaluating ? "Vérification…" : "Vérifier"}
                <kbd className="kbdHint">Ctrl+↵</kbd>
              </button>
              {!isConjugation && (
                <button className="button" type="button" onClick={handleSkip}>
                  Passer
                </button>
              )}
            </div>
          )}

          {errorMessage && !hasCheckedCurrent && (
            <div className="formError" style={{ marginTop: "var(--space-4)" }}>
              {errorMessage}
            </div>
          )}

          <TeacherChat
            prompt={currentExercise.prompt}
            expectedAnswer={currentExercise.answer}
            userAnswer={userAnswer}
            direction={currentExercise.direction ?? direction}
            mode={activeTab}
            resetKey={`${activeTab}-${currentIndex}`}
          />

          {hasCheckedCurrent && currentIsCorrect !== null && (
            <div className="phrasesTraining__feedback">
              <div
                className={`phrasesTraining__resultBadge ${currentIsCorrect ? "phrasesTraining__resultBadge--success" : "phrasesTraining__resultBadge--error"}`}
              >
                {currentIsCorrect ? "✓ Réussi" : "✗ Incorrect"}
              </div>

              <div className="phrasesTraining__expectedAnswer">
                <div className="phrasesTraining__expectedLabel">Réponse attendue</div>
                <div className="phrasesTraining__expectedKanji">{currentExercise.answer}</div>
                {currentExercise.answerAlt && (
                  <div className="phrasesTraining__expectedKana">{currentExercise.answerAlt}</div>
                )}
              </div>

              {!currentIsCorrect && userAnswer.trim().length > 0 && (
                <AnswerDiff
                  userAnswer={userAnswer.trim()}
                  expectedAnswer={currentExercise.answer}
                  granularity={
                    activeTab === "phrases" && direction === "jp-to-fr" ? "word" : "character"
                  }
                />
              )}

              {currentFeedback && (
                <div className="phrasesTraining__tip">
                  <div className="phrasesTraining__tipTitle">Conseil</div>
                  <div className="phrasesTraining__tipContent">{currentFeedback}</div>
                </div>
              )}

              {!currentIsCorrect && (
                <button
                  type="button"
                  className="button"
                  style={{ marginTop: "var(--space-3)", fontSize: "13px" }}
                  onClick={() => handleGrammarLink(currentFeedback ?? "erreur", currentExercise.prompt)}
                >
                  Comprendre cette erreur
                </button>
              )}

              {currentExercise.explanation && (
                <div className="phrasesTraining__explanation">{currentExercise.explanation}</div>
              )}

              <button
                className="button button--primary"
                type="button"
                onClick={handleNext}
                style={{ marginTop: "var(--space-5)" }}
              >
                {currentIndex + 1 >= exercises.length ? "Voir le récapitulatif" : "Suivant →"}
                <kbd className="kbdHint">Ctrl+→</kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===================== LISTENING RECAP =====================
  if (phase === "recap" && activeTab === "ecoute") {
    const listeningCorrectCount = listeningResults.filter((result) => result.isCorrect).length;
    const listeningIncorrectCount = listeningResults.filter((result) => result.isCorrect === false).length;

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
                  <tr key={index}>
                    <td className="muted">{index + 1}</td>
                    <td>
                      {result.exercise.japanese}
                      <AudioButton text={result.exercise.japanese} size="small" />
                      <div style={{ fontSize: "12px", color: "var(--color-text-soft)" }}>{result.exercise.french}</div>
                    </td>
                    <td>{result.userTranscript || <span className="muted">—</span>}</td>
                    <td>
                      {result.revealed && <span style={{ fontSize: "11px", color: "var(--color-text-soft)" }}>(révélé) </span>}
                      {result.isCorrect ? (
                        <span style={{ color: "var(--color-success)" }}>✓</span>
                      ) : (
                        <span style={{ color: "var(--color-danger)" }}>✗</span>
                      )}
                      {result.feedback && (
                        <div style={{ fontSize: "12px", color: "var(--color-text-soft)", marginTop: "2px" }}>{result.feedback}</div>
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
                      french={result.exercise.frenchPrompt ?? (direction === "jp-to-fr" ? result.exercise.answer : result.exercise.prompt)}
                      japanese={direction === "jp-to-fr" ? result.exercise.prompt : result.exercise.answer}
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
                              let jlptTag = allTags.find((tag) => tag.name === "JLPT N5");
                              if (!jlptTag) jlptTag = await createTag("JLPT N5");
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
                let jlptTag = allTags.find((tag) => tag.name === "JLPT N5");
                if (!jlptTag) jlptTag = await createTag("JLPT N5");
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

      {showGrammarDrawer && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "400px", maxWidth: "90vw",
          background: "var(--color-bg)", borderLeft: "2px solid var(--color-border)",
          boxShadow: "-4px 0 12px rgba(0,0,0,0.1)", zIndex: 100, overflow: "auto",
          padding: "var(--space-5)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
            <h3 style={{ margin: 0 }}>Explication grammaticale</h3>
            <button type="button" className="button" onClick={() => setShowGrammarDrawer(false)} style={{ padding: "2px 8px" }}>Fermer</button>
          </div>
          {isLoadingGrammar ? (
            <div className="muted">Chargement…</div>
          ) : grammarNote ? (
            <div style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              <h4 style={{ marginTop: 0 }}>{grammarNote.topic}</h4>
              {grammarNote.content}
            </div>
          ) : (
            <div className="muted">Impossible de charger la note de grammaire.</div>
          )}
        </div>
      )}
    </div>
  );
}

function SavePhraseButton({ french, japanese, japaneseKana, source }: {
  french: string; japanese: string; japaneseKana?: string; source: string;
}) {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (isSaved) return <span className="muted" style={{ fontSize: "12px" }}>✓ Sauvé</span>;

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
