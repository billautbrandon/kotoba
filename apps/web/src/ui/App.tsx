import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import type { User } from "../api";
import { downloadMissingKanjiSvgs, fetchMe, fetchSeries, logoutUser } from "../api";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DictionaryPage } from "./pages/DictionaryPage";
import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { HomePage } from "./pages/HomePage";
import { KanjiLearningPage } from "./pages/KanjiLearningPage";
import { LoginPage } from "./pages/LoginPage";
import { SeriesStartPage } from "./pages/SeriesStartPage";
import { TrainPage } from "./pages/TrainPage";
import { WordsPage } from "./pages/WordsPage";

function getInitials(username: string): string {
  return username
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasSeries, setHasSeries] = useState<boolean>(false);
  const [isDownloadingKanji, setIsDownloadingKanji] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSeriesPage =
    location.pathname.startsWith("/series/") || location.pathname.startsWith("/train/tag/");

  useEffect(() => {
    let isMounted = true;
    async function loadMe() {
      try {
        const user = await fetchMe();
        if (isMounted) {
          setCurrentUser(user);
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }
    loadMe();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const isAuthenticated = Boolean(currentUser);

  const requireAuth = (element: React.ReactElement) => {
    // IMPORTANT: do not redirect while auth state is still loading,
    // otherwise a refresh on /kanji (or any page) will always bounce to /login then /
    // and you won't stay on the same page after refresh.
    if (isAuthLoading) {
      return <div className="muted">Chargement...</div>;
    }
    if (!currentUser) {
      return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return element;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setHasSeries(false);
      return;
    }
    let isMounted = true;
    async function checkSeries() {
      try {
        const series = await fetchSeries();
        if (isMounted) {
          setHasSeries(series.length > 0);
        }
      } catch {
        if (isMounted) {
          setHasSeries(false);
        }
      }
    }
    checkSeries();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const topbarRight = useMemo(() => {
    if (isAuthLoading) {
      return (
        <div className="topbarUser">
          <div className="topbarUser__avatar" style={{ opacity: 0.5 }}>
            …
          </div>
        </div>
      );
    }
    if (!currentUser) {
      return (
        <div className="topbarUser">
          <div className="topbarUser__avatar" style={{ background: "var(--color-muted)" }}>
            ?
          </div>
        </div>
      );
    }
    return (
      <div className="topbarUser" ref={dropdownRef}>
        <button
          className="topbarUser__avatar"
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          aria-label="Menu utilisateur"
        >
          {getInitials(currentUser.username)}
        </button>
        {isDropdownOpen && (
          <div className="topbarUser__dropdown">
            <button
              className="topbarUser__dropdownItem topbarUser__dropdownItem--header"
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                navigate("/settings");
              }}
            >
              {currentUser.username}
            </button>
            <button
              className="topbarUser__dropdownItem"
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                navigate("/words");
              }}
            >
              Ajouter du vocabulaire
            </button>
            <button
              className="topbarUser__dropdownItem"
              type="button"
              disabled={isDownloadingKanji}
              onClick={async () => {
                setIsDropdownOpen(false);
                setIsDownloadingKanji(true);
                try {
                  const result = await downloadMissingKanjiSvgs();
                  alert(
                    `Téléchargement terminé !\n${result.downloaded} kanji téléchargé(s) sur ${result.missingCount} manquant(s).\n${result.failed} échec(s).`,
                  );
                } catch (error) {
                  alert(
                    `Erreur lors du téléchargement: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
                  );
                } finally {
                  setIsDownloadingKanji(false);
                }
              }}
            >
              {isDownloadingKanji ? "Téléchargement..." : "Télécharger les kanji non disponibles"}
            </button>
            <button
              className="topbarUser__dropdownItem topbarUser__dropdownItem--danger"
              type="button"
              onClick={async () => {
                await logoutUser();
                setCurrentUser(null);
                setIsDropdownOpen(false);
                navigate("/login", { replace: true });
              }}
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
    );
  }, [currentUser, isAuthLoading, navigate, isDropdownOpen]);

  return (
    <div className="container">
      {isAuthenticated && (
        <header className="topbar">
          <div className="topbar__left">
            <Link className="topbar__titleLink" to="/">
              <span className="topbar__titleMain">Kotoba</span>
              <span className="topbar__titleKana">言葉</span>
            </Link>
          </div>

          <nav className="topbar__nav nav">
            <NavLink
              className={() => {
                return `nav__link ${location.pathname === "/" || isSeriesPage ? "nav__link--active" : ""} ${!hasSeries ? "nav__link--disabled" : ""}`;
              }}
              to="/"
              onClick={(e) => {
                if (!hasSeries) {
                  e.preventDefault();
                }
              }}
            >
              <span style={{ marginRight: "var(--space-2)" }}>📚</span>
              Séries
            </NavLink>
            <NavLink
              className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
              to="/dictionary"
            >
              <span style={{ marginRight: "var(--space-2)" }}>📖</span>
              Dictionnaire
            </NavLink>
            <NavLink
              className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
              to="/kanji"
            >
              <span style={{ marginRight: "var(--space-2)" }}>✍️</span>
              Tracé
            </NavLink>
          </nav>

          <div className="topbar__right">{topbarRight}</div>
        </header>
      )}

      <div className="panel">
        <div className="panel__content">
          <Routes>
            <Route
              path="/login"
              element={
                isAuthLoading ? (
                  <div className="muted">Chargement...</div>
                ) : currentUser ? (
                  <Navigate
                    to={
                      (typeof location.state === "object" &&
                      location.state &&
                      "from" in location.state &&
                      (location.state as { from?: { pathname?: string; search?: string } }).from?.pathname
                        ? `${(location.state as { from?: { pathname?: string; search?: string } }).from?.pathname}${(location.state as { from?: { pathname?: string; search?: string } }).from?.search ?? ""}`
                        : "/")
                    }
                    replace
                  />
                ) : (
                  <LoginPage
                    onAuthenticated={(user) => {
                      setCurrentUser(user);
                      const from =
                        typeof location.state === "object" &&
                        location.state &&
                        "from" in location.state
                          ? (location.state as { from?: { pathname?: string; search?: string } }).from
                          : undefined;
                      navigate(from?.pathname ? `${from.pathname}${from.search ?? ""}` : "/", {
                        replace: true,
                      });
                    }}
                  />
                )
              }
            />

            <Route path="/" element={requireAuth(<HomePage />)} />
            <Route
              path="/series/:tagId"
              element={requireAuth(<SeriesStartPage />)}
            />
            <Route path="/train" element={<Navigate to="/" replace />} />
            <Route path="/train/difficult" element={<Navigate to="/" replace />} />
            <Route
              path="/train/tag/:tagId"
              element={
                requireAuth(<TrainPage mode="tag" />)
              }
            />
            <Route
              path="/difficult"
              element={requireAuth(<DifficultWordsPage />)}
            />
            <Route
              path="/dictionary"
              element={requireAuth(<DictionaryPage />)}
            />
            <Route
              path="/kanji"
              element={requireAuth(<KanjiLearningPage />)}
            />
            <Route
              path="/words"
              element={requireAuth(<WordsPage />)}
            />
            <Route
              path="/settings"
              element={requireAuth(<ChangePasswordPage />)}
            />
            <Route path="*" element={<Navigate to="/train" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
