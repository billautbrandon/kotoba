import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchSeries } from "../../api";
import { DailyChallengeCard } from "../components/DailyChallengeCard";

type SeriesRow = {
  tagId: number;
  tagName: string;
  wordsCount: number;
  totalScore: number;
  lastReviewedAt: string | null;
};

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function HomePage() {
  const navigate = useNavigate();
  const [series, setSeries] = useState<SeriesRow[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const loadedSeries = await fetchSeries();
        if (!isCancelled) {
          setSeries(loadedSeries);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
          setSeries([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  const totalWords = useMemo(() => {
    if (!series) return 0;
    return series.reduce((accumulator, row) => accumulator + row.wordsCount, 0);
  }, [series]);

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Séries</h1>
          <p className="pageSubtitle">
            Lance une session d'entraînement par tag. ({totalWords} mots au total, tags inclus)
          </p>
        </div>
        <button className="button button--primary" type="button" onClick={() => navigate("/words")}>
          + Ajouter du vocabulaire
        </button>
      </div>

      <DailyChallengeCard />

      {isLoading ? (
        <div className="muted" style={{ marginTop: "var(--space-6)" }}>
          Chargement…
        </div>
      ) : null}

      {errorMessage ? (
        <div className="formError" style={{ marginTop: "var(--space-6)" }}>
          {errorMessage}
        </div>
      ) : null}

      {!isLoading && series && series.length === 0 ? (
        <div className="muted" style={{ marginTop: "var(--space-6)" }}>
          Aucune série: crée des tags et assigne-les à des mots dans "Mots".
        </div>
      ) : null}

      {series && series.length > 0 ? (
        <div
          style={{
            marginTop: "var(--space-8)",
            border: "2px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Mots</th>
                <th>Score (cumul)</th>
                <th>Dernière session</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr
                  key={row.tagId}
                  className="tableRowLink"
                  tabIndex={0}
                  onClick={() =>
                    navigate(`/train/tag/${row.tagId}?name=${encodeURIComponent(row.tagName)}`)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/train/tag/${row.tagId}?name=${encodeURIComponent(row.tagName)}`);
                    }
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{row.tagName}</td>
                  <td className="muted">{row.wordsCount}</td>
                  <td className="muted">{row.totalScore}</td>
                  <td className="muted" style={{ fontSize: "13px" }}>
                    {row.lastReviewedAt ? formatRelativeDate(row.lastReviewedAt) : "—"}
                  </td>
                  <td className="muted" style={{ textAlign: "right" }}>
                    →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
