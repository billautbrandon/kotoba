import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

type SessionMode = "manual" | "timer";
type PromptMode = "french" | "romaji" | "kana" | "kanji";

type PersistedSeriesSettings = {
  sessionMode: SessionMode;
  timerSeconds: number;
  promptMode: PromptMode;
};

const seriesSettingsStorageKey = "kotoba.seriesSettings.v1";

export function SeriesStartPage() {
  const routeParams = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tagId = Number(routeParams.tagId);
  const tagNameFromQuery = searchParams.get("name") ?? null;

  const [sessionMode, setSessionMode] = useState<SessionMode>(() => {
    return loadSeriesSettingsFromStorage().sessionMode;
  });
  const [timerSeconds, setTimerSeconds] = useState<number>(() => {
    return loadSeriesSettingsFromStorage().timerSeconds;
  });
  const [promptMode, setPromptMode] = useState<PromptMode>(() => {
    return loadSeriesSettingsFromStorage().promptMode;
  });
  const [onlyDifficult, setOnlyDifficult] = useState<boolean>(false);

  const tagLabel = useMemo(() => {
    if (tagNameFromQuery) return tagNameFromQuery;
    if (Number.isFinite(tagId)) return `Tag ${tagId}`;
    return "Tag ?";
  }, [tagId, tagNameFromQuery]);

  useEffect(() => {
    saveSeriesSettingsToStorage({ sessionMode, timerSeconds, promptMode });
  }, [promptMode, sessionMode, timerSeconds]);

  function start() {
    if (!Number.isFinite(tagId)) return;
    const difficultParam = onlyDifficult ? "&difficult=1" : "";
    const nameParam = tagNameFromQuery ? `&name=${encodeURIComponent(tagNameFromQuery)}` : "";
    if (sessionMode === "manual") {
      navigate(`/train/tag/${tagId}?mode=manual&prompt=${promptMode}${difficultParam}${nameParam}`);
      return;
    }
    navigate(
      `/train/tag/${tagId}?mode=timer&seconds=${timerSeconds}&prompt=${promptMode}${difficultParam}${nameParam}`,
    );
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Démarrer une série</h1>
          <p className="pageSubtitle">
            Série: <strong>{tagLabel}</strong>
          </p>
        </div>
      </div>

      {!Number.isFinite(tagId) ? (
        <div className="muted" style={{ marginTop: 16 }}>
          Tag invalide.
        </div>
      ) : (
        <div style={{ marginTop: "var(--space-8)" }}>
          <div className="panel">
            <div className="panel__content">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "var(--space-4)" }}>
                    Mode d'entraînement
                  </h2>
                  <div
                    className="row"
                    style={{ gap: "var(--space-3)", marginBottom: "var(--space-4)" }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        cursor: "pointer",
                        padding: "var(--space-4)",
                        border: `2px solid ${sessionMode === "manual" ? "var(--color-primary)" : "var(--color-border)"}`,
                        borderRadius: "var(--radius-md)",
                        background:
                          sessionMode === "manual" ? "rgba(199, 62, 29, 0.1)" : "transparent",
                        flex: 1,
                      }}
                    >
                      <input
                        type="radio"
                        checked={sessionMode === "manual"}
                        onChange={() => setSessionMode("manual")}
                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>Manuel</div>
                        <div className="muted" style={{ fontSize: "14px", marginTop: "4px" }}>
                          Raccourcis: <strong>→</strong> / <strong>Entrée</strong> pour avancer,{" "}
                          <strong>←</strong> pour revenir
                        </div>
                      </div>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        cursor: "pointer",
                        padding: "var(--space-4)",
                        border: `2px solid ${sessionMode === "timer" ? "var(--color-primary)" : "var(--color-border)"}`,
                        borderRadius: "var(--radius-md)",
                        background:
                          sessionMode === "timer" ? "rgba(199, 62, 29, 0.1)" : "transparent",
                        flex: 1,
                      }}
                    >
                      <input
                        type="radio"
                        checked={sessionMode === "timer"}
                        onChange={() => setSessionMode("timer")}
                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>Temps</div>
                        <div className="muted" style={{ fontSize: "14px", marginTop: "4px" }}>
                          Durée automatique par mot
                        </div>
                      </div>
                    </label>
                  </div>

                  {sessionMode === "timer" && (
                    <div>
                      <div
                        className="muted"
                        style={{ fontSize: "14px", marginBottom: "var(--space-3)" }}
                      >
                        Durée par mot
                      </div>
                      <div className="row" style={{ gap: "var(--space-3)" }}>
                        {[3, 5, 8].map((seconds) => (
                          <button
                            key={seconds}
                            className={`button ${timerSeconds === seconds ? "button--primary" : ""}`}
                            type="button"
                            onClick={() => setTimerSeconds(seconds)}
                          >
                            {seconds}s
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    borderTop: "2px solid var(--color-border)",
                    paddingTop: "var(--space-8)",
                  }}
                >
                  <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "var(--space-4)" }}>
                    Format de question
                  </h2>
                  <div className="row" style={{ gap: "var(--space-3)" }}>
                    {(
                      [
                        ["french", "FR"],
                        ["romaji", "Rōmaji"],
                        ["kana", "Kana"],
                        ["kanji", "Kanji"],
                      ] as Array<[PromptMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        className={`button ${promptMode === mode ? "button--primary" : ""}`}
                        type="button"
                        onClick={() => setPromptMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    borderTop: "2px solid var(--color-border)",
                    paddingTop: "var(--space-8)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      cursor: "pointer",
                      fontSize: "16px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={onlyDifficult}
                      onChange={(e) => setOnlyDifficult(e.target.checked)}
                      style={{ width: "20px", height: "20px", cursor: "pointer" }}
                    />
                    <span>Uniquement les mots difficiles</span>
                  </label>
                </div>

                <div
                  style={{
                    borderTop: "2px solid var(--color-border)",
                    paddingTop: "var(--space-8)",
                  }}
                >
                  <div className="row" style={{ gap: "var(--space-3)" }}>
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() => start()}
                    >
                      Démarrer
                    </button>
                    <Link className="button" to="/">
                      Retour
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function loadSeriesSettingsFromStorage(): PersistedSeriesSettings {
  try {
    const rawValue = window.localStorage.getItem(seriesSettingsStorageKey);
    if (!rawValue) {
      return { sessionMode: "manual", timerSeconds: 5, promptMode: "french" };
    }
    const parsedValue = JSON.parse(rawValue) as Partial<PersistedSeriesSettings>;
    const sessionMode: SessionMode =
      parsedValue.sessionMode === "timer" || parsedValue.sessionMode === "manual"
        ? parsedValue.sessionMode
        : "manual";
    const promptMode: PromptMode =
      parsedValue.promptMode === "french" ||
      parsedValue.promptMode === "romaji" ||
      parsedValue.promptMode === "kana" ||
      parsedValue.promptMode === "kanji"
        ? parsedValue.promptMode
        : "french";
    const timerSeconds = Number(parsedValue.timerSeconds);
    const safeTimerSeconds = Number.isFinite(timerSeconds) ? timerSeconds : 5;
    return { sessionMode, timerSeconds: safeTimerSeconds, promptMode };
  } catch {
    return { sessionMode: "manual", timerSeconds: 5, promptMode: "french" };
  }
}

function saveSeriesSettingsToStorage(settings: PersistedSeriesSettings) {
  try {
    window.localStorage.setItem(seriesSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
