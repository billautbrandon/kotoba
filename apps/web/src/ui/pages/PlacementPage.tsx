import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  type PlacementQuestion,
  type User,
  fetchPlacementQuestions,
  skipPlacement,
  submitPlacement,
} from "../../api";
import { FuriganaText } from "../components/FuriganaText";

export function PlacementPage({
  onCompleted,
}: {
  onCompleted: (user: User) => void;
}) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<{ catalogId: number; choice: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    correctCount: number;
    total: number;
    placementLevel: string;
    knownCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlacementQuestions()
      .then((loaded) => {
        if (!cancelled) setQuestions(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Impossible de charger le test");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = questions[currentIndex];
  const progressPercent = questions.length === 0 ? 0 : (currentIndex / questions.length) * 100;

  async function handleSkip() {
    setIsSubmitting(true);
    try {
      const user = await skipPlacement();
      onCompleted(user);
      navigate("/", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de passer le test");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function chooseAnswer(choice: string) {
    if (!current || isSubmitting) return;
    const nextAnswers = [...answers, { catalogId: current.catalogId, choice }];
    setAnswers(nextAnswers);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = await submitPlacement(nextAnswers);
      setResult({
        correctCount: payload.correctCount,
        total: payload.total,
        placementLevel: payload.placementLevel,
        knownCount: payload.knownCount,
      });
      onCompleted(payload.user);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’enregistrer le test");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="muted">Préparation du test de niveau…</div>;
  }

  if (result) {
    return (
      <div className="placementPage">
        <div className="pageHeader">
          <div>
            <h1 className="pageTitle">Ton départ</h1>
            <p className="pageSubtitle">
              {result.correctCount}/{result.total} — niveau {result.placementLevel}
            </p>
          </div>
        </div>
        <div className="placementCard">
          <p>
            {result.knownCount > 0
              ? `${result.knownCount} mot${result.knownCount > 1 ? "s" : ""} déjà connu${result.knownCount > 1 ? "s" : ""} : on ne te les rejoue pas.`
              : "On commence au début du N5, avec les mots les plus courants."}
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => navigate("/catalogue", { replace: true })}
          >
            Voir le catalogue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="placementPage">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Test de placement</h1>
          <p className="pageSubtitle">
            Dix questions à l’inscription, de N5 vers plus loin. Pour avancer, tu dois déjà
            connaître les mots N5 courants — choisis le sens.
          </p>
        </div>
      </div>

      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      {current ? (
        <div className="placementCard">
          <div className="placementCard__progressTrack">
            <div className="placementCard__progressFill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="placementCard__meta">
            Question {currentIndex + 1} sur {questions.length}
          </p>
          <div className="placementCard__prompt">
            <FuriganaText kanji={current.kanji ?? current.kana} kana={current.kana} />
          </div>
          <div className="placementCard__choices">
            {current.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                className="placementCard__choice"
                disabled={isSubmitting}
                onClick={() => void chooseAnswer(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="muted">Aucune question disponible.</div>
      )}

      <button
        type="button"
        className="linkButton"
        disabled={isSubmitting}
        onClick={() => void handleSkip()}
      >
        Commencer à N5 sans test
      </button>
    </div>
  );
}
