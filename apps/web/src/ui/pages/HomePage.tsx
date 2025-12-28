import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchSeries } from "../../api";

type SeriesRow = {
  tagId: number;
  tagName: string;
  wordsCount: number;
  totalScore: number;
};

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
      </div>

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
                    navigate(`/series/${row.tagId}?name=${encodeURIComponent(row.tagName)}`)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/series/${row.tagId}?name=${encodeURIComponent(row.tagName)}`);
                    }
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{row.tagName}</td>
                  <td className="muted">{row.wordsCount}</td>
                  <td className="muted">{row.totalScore}</td>
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
