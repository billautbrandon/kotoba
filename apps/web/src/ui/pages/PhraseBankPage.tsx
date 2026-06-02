import { useEffect, useState } from "react";
import {
  type SavedPhrase,
  deleteSavedPhrase,
  fetchDuePhrases,
  fetchSavedPhrases,
  reviewSavedPhrase,
} from "../../api";
import { AudioButton } from "../components/AudioButton";

type PhraseBankPhase = "list" | "review";

const SOURCE_LABELS: Record<string, string> = {
  phrases: "Phrases",
  construction: "Construction",
  dialogue: "Dialogue",
  jlpt: "JLPT",
  daily: "Défi quotidien",
  reading: "Lecture",
  ecoute: "Écoute",
};

export function PhraseBankPage() {
  const [phase, setPhase] = useState<PhraseBankPhase>("list");
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const [duePhrases, setDuePhrases] = useState<SavedPhrase[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const [reviewIndex, setReviewIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [reviewResults, setReviewResults] = useState<Array<{ phraseId: number; result: "success" | "fail" }>>([]);

  async function loadPhrases() {
    setIsLoading(true);
    try {
      const [allPhrases, dueData] = await Promise.all([
        fetchSavedPhrases(sourceFilter || undefined),
        fetchDuePhrases(),
      ]);
      setPhrases(allPhrases);
      setDuePhrases(dueData.phrases);
      setDueCount(dueData.dueCount);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPhrases();
  }, [sourceFilter]);

  async function handleDelete(phraseId: number) {
    try {
      await deleteSavedPhrase(phraseId);
      setPhrases((previous) => previous.filter((phrase) => phrase.id !== phraseId));
    } catch {
      // ignore
    }
  }

  function startReview() {
    if (duePhrases.length === 0) return;
    setPhase("review");
    setReviewIndex(0);
    setIsRevealed(false);
    setReviewResults([]);
  }

  async function handleReviewResult(result: "success" | "fail") {
    const currentPhrase = duePhrases[reviewIndex];
    if (!currentPhrase) return;

    try {
      await reviewSavedPhrase(currentPhrase.id, result);
    } catch {
      // ignore
    }

    const newResults = [...reviewResults, { phraseId: currentPhrase.id, result }];
    setReviewResults(newResults);

    if (reviewIndex + 1 < duePhrases.length) {
      setReviewIndex(reviewIndex + 1);
      setIsRevealed(false);
    } else {
      setPhase("list");
      loadPhrases();
    }
  }

  // ========== REVIEW MODE ==========
  if (phase === "review" && duePhrases.length > 0) {
    const currentPhrase = duePhrases[reviewIndex];
    if (!currentPhrase) return null;

    return (
      <div>
        <div className="pageHeader">
          <h1 className="pageTitle">Révision des phrases</h1>
          <p className="pageSubtitle">
            {reviewIndex + 1} / {duePhrases.length}
          </p>
        </div>

        <div style={{
          maxWidth: "600px",
          margin: "var(--space-6) auto",
          padding: "var(--space-6)",
          border: "2px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>
            Traduis en japonais :
          </p>
          <p style={{ fontSize: "20px", fontWeight: 600, marginBottom: "var(--space-6)" }}>
            {currentPhrase.french}
          </p>

          {isRevealed ? (
            <div>
              <p style={{ fontSize: "22px", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                {currentPhrase.japanese}
                <AudioButton text={currentPhrase.japanese} size="medium" />
              </p>
              {currentPhrase.japanese_kana && currentPhrase.japanese_kana !== currentPhrase.japanese && (
                <p style={{ fontSize: "14px", color: "var(--color-text-soft)" }}>
                  {currentPhrase.japanese_kana}
                </p>
              )}
              {currentPhrase.explanation && (
                <p style={{ fontSize: "13px", color: "var(--color-text-soft)", marginTop: "var(--space-3)" }}>
                  {currentPhrase.explanation}
                </p>
              )}

              <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", marginTop: "var(--space-5)" }}>
                <button
                  type="button"
                  className="button"
                  style={{ borderColor: "var(--color-danger, #ef4444)", color: "var(--color-danger, #ef4444)" }}
                  onClick={() => handleReviewResult("fail")}
                >
                  Je ne savais pas
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => handleReviewResult("success")}
                >
                  Je savais !
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setIsRevealed(true)}
            >
              Révéler la réponse
            </button>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          <button
            type="button"
            className="button"
            onClick={() => { setPhase("list"); loadPhrases(); }}
          >
            Arrêter la révision
          </button>
        </div>
      </div>
    );
  }

  // ========== LIST MODE ==========
  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Banque de phrases</h1>
          <p className="pageSubtitle">
            {phrases.length} phrase{phrases.length !== 1 ? "s" : ""} sauvegardée{phrases.length !== 1 ? "s" : ""}
            {dueCount > 0 && ` — ${dueCount} à réviser`}
          </p>
        </div>
        {dueCount > 0 && (
          <button type="button" className="button button--primary" onClick={startReview}>
            Réviser ({dueCount})
          </button>
        )}
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <select
          className="input"
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
          style={{ maxWidth: "200px" }}
        >
          <option value="">Toutes les sources</option>
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="muted">Chargement…</div>
      ) : phrases.length === 0 ? (
        <div className="muted">
          Aucune phrase sauvegardée. Sauvegarde des phrases depuis tes sessions d'entraînement !
        </div>
      ) : (
        <div style={{
          border: "2px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}>
          <table className="table">
            <thead>
              <tr>
                <th>Français</th>
                <th>Japonais</th>
                <th>Source</th>
                <th>SRS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {phrases.map((phrase) => (
                <tr key={phrase.id}>
                  <td>{phrase.french}</td>
                  <td>
                    {phrase.japanese}
                    <AudioButton text={phrase.japanese} size="small" />
                  </td>
                  <td className="muted" style={{ fontSize: "13px" }}>
                    {SOURCE_LABELS[phrase.source] ?? phrase.source}
                  </td>
                  <td className="muted" style={{ fontSize: "13px" }}>
                    {phrase.srs_next_review_at
                      ? new Date(phrase.srs_next_review_at) <= new Date()
                        ? "À réviser"
                        : `dans ${phrase.srs_interval}j`
                      : "Nouveau"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      style={{ fontSize: "12px", padding: "2px 8px" }}
                      onClick={() => handleDelete(phrase.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
