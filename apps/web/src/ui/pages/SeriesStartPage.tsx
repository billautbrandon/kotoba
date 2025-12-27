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
    if (sessionMode === "manual") {
      navigate(`/train/tag/${tagId}?mode=manual&prompt=${promptMode}`);
      return;
    }
    navigate(`/train/tag/${tagId}?mode=timer&seconds=${timerSeconds}&prompt=${promptMode}`);
  }

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Démarrer une série</div>
      <div className="muted" style={{ marginTop: 4 }}>
        Série: <strong>{tagLabel}</strong>
      </div>

      {!Number.isFinite(tagId) ? (
        <div className="muted" style={{ marginTop: 16 }}>
          Tag invalide.
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div className="wordCard">
            <div className="muted" style={{ fontSize: 12 }}>
              Mode
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <label
                className="nav__link"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="radio"
                  checked={sessionMode === "manual"}
                  onChange={() => setSessionMode("manual")}
                />
                Manuel
              </label>
              <label
                className="nav__link"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="radio"
                  checked={sessionMode === "timer"}
                  onChange={() => setSessionMode("timer")}
                />
                Temps
              </label>
            </div>

            {sessionMode === "manual" ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Raccourcis: <strong>→</strong> / <strong>Entrée</strong> pour avancer,{" "}
                <strong>←</strong> pour revenir.
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  Durée par mot
                </div>
                <div className="row">
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

            <div style={{ marginTop: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Question (mode)
              </div>
              <div className="row">
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

            <div className="row" style={{ marginTop: 16 }}>
              <button className="button button--primary" type="button" onClick={() => start()}>
                Démarrer
              </button>
              <Link className="button" to="/">
                Retour
              </Link>
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
