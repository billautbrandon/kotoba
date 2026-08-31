import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import type { User } from "../api";
import {
  type SrsSummary,
  downloadMissingKanjiSvgs,
  fetchMe,
  fetchSrsSummary,
  logoutUser,
} from "../api";
import {
  HomeNavIcon,
  PracticeNavIcon,
  ReadingNavIcon,
  SrsNavIcon,
  VocabNavIcon,
} from "./components/NavIcons";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { AdminPage } from "./pages/AdminPage";
import { DialoguePage } from "./pages/DialoguePage";
import { DictionaryPage } from "./pages/DictionaryPage";
import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { GrammarPage } from "./pages/GrammarPage";
import { HomePage } from "./pages/HomePage";
import { KanjiLearningPage } from "./pages/KanjiLearningPage";
import { KanjiQuizPage } from "./pages/KanjiQuizPage";
import { LoginPage } from "./pages/LoginPage";
import { PhraseBankPage } from "./pages/PhraseBankPage";
import { PratiquePage } from "./pages/PratiquePage";
import { ReadingPage } from "./pages/ReadingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SrsPage } from "./pages/SrsPage";
import { StatsPage } from "./pages/StatsPage";
import { TrainPage } from "./pages/TrainPage";
import { WordsPage } from "./pages/WordsPage";

function getInitials(name: string): string {
  return name
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
  const [isDownloadingKanji, setIsDownloadingKanji] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("kotoba.theme");
    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  useEffect(() => {
    function handleShortcutKey(event: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName.toLowerCase() ?? "";
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;
      if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setIsShortcutsOpen((previous) => !previous);
      }
    }
    window.addEventListener("keydown", handleShortcutKey);
    return () => window.removeEventListener("keydown", handleShortcutKey);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadMe() {
      try {
        const user = await fetchMe();
        if (isMounted) setCurrentUser(user);
      } catch {
        if (isMounted) setCurrentUser(null);
      } finally {
        if (isMounted) setIsAuthLoading(false);
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
    if (isDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const isAuthenticated = Boolean(currentUser);

  const requireAuth = (element: React.ReactElement) => {
    if (isAuthLoading) return <div className="muted">Chargement...</div>;
    if (!currentUser) return <Navigate to="/login" replace state={{ from: location }} />;
    return element;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setSrsSummary(null);
      return;
    }
    let isMounted = true;
    async function loadSrsSummary() {
      try {
        const summary = await fetchSrsSummary();
        if (isMounted) setSrsSummary(summary);
      } catch {
        /* ignore */
      }
    }
    loadSrsSummary();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  function goTo(path: string) {
    setIsDropdownOpen(false);
    navigate(path);
  }

  const isHomeActive =
    location.pathname === "/" ||
    location.pathname.startsWith("/series/") ||
    location.pathname.startsWith("/train/tag/") ||
    location.pathname.startsWith("/train/srs/");

  return (
    <div className="app">
      {isAuthenticated && (
        <header className="topbar">
          <div className="topbar__inner">
            <Link className="topbar__brand" to="/">
              <span className="topbar__brandName">Kotoba</span>
              <span className="topbar__brandKana">言葉</span>
            </Link>

            <nav className="topbar__nav">
              <NavLink
                className={() => `topbar__navLink ${isHomeActive ? "topbar__navLink--active" : ""}`}
                to="/"
              >
                <HomeNavIcon />
                <span className="topbar__navLabel">Accueil</span>
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `topbar__navLink ${isActive ? "topbar__navLink--active" : ""}`
                }
                to="/dictionary"
              >
                <VocabNavIcon />
                <span className="topbar__navLabel">Vocabulaire</span>
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `topbar__navLink ${isActive ? "topbar__navLink--active" : ""}`
                }
                to="/srs"
              >
                <SrsNavIcon />
                <span className="topbar__navLabel">SRS</span>
                {srsSummary && srsSummary.dueCount > 0 && (
                  <span className="topbar__badge">{srsSummary.dueCount}</span>
                )}
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `topbar__navLink ${isActive ? "topbar__navLink--active" : ""}`
                }
                to="/pratique"
              >
                <PracticeNavIcon />
                <span className="topbar__navLabel">Pratique</span>
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `topbar__navLink ${isActive ? "topbar__navLink--active" : ""}`
                }
                to="/lecture"
              >
                <ReadingNavIcon />
                <span className="topbar__navLabel">Lecture</span>
              </NavLink>
            </nav>

            <div className="topbar__right" ref={dropdownRef}>
              <button
                className="topbar__avatar"
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-label="Menu utilisateur"
              >
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" className="topbar__avatarImg" />
                ) : (
                  getInitials(currentUser?.display_name ?? currentUser?.username ?? "?")
                )}
              </button>

              {isDropdownOpen && (
                <div className="dropdown">
                  <div className="dropdown__header">
                    {currentUser?.display_name ?? currentUser?.username}
                  </div>
                  <div className="dropdown__section">Pratique</div>
                  <button
                    className="dropdown__item"
                    type="button"
                    onClick={() => goTo("/dialogue")}
                  >
                    Dialogue
                  </button>
                  <button className="dropdown__item" type="button" onClick={() => goTo("/kanji")}>
                    Kanji
                  </button>
                  <button
                    className="dropdown__item"
                    type="button"
                    onClick={() => goTo("/kanji-quiz")}
                  >
                    Quiz kanji
                  </button>
                  <div className="dropdown__separator" />
                  <div className="dropdown__section">Vocabulaire</div>
                  <button className="dropdown__item" type="button" onClick={() => goTo("/words")}>
                    Mots
                  </button>
                  <button
                    className="dropdown__item"
                    type="button"
                    onClick={() => goTo("/difficult")}
                  >
                    Mots difficiles
                  </button>
                  <button
                    className="dropdown__item"
                    type="button"
                    onClick={() => goTo("/phrases-bank")}
                  >
                    Banque de phrases
                  </button>
                  <button
                    className="dropdown__item"
                    type="button"
                    onClick={() => goTo("/grammaire")}
                  >
                    Grammaire
                  </button>
                  <div className="dropdown__separator" />
                  <button className="dropdown__item" type="button" onClick={() => goTo("/stats")}>
                    Statistiques
                  </button>
                  <button
                    className="dropdown__item"
                    type="button"
                    onClick={() => goTo("/settings")}
                  >
                    Paramètres
                  </button>
                  {currentUser?.is_admin === 1 && (
                    <button className="dropdown__item" type="button" onClick={() => goTo("/admin")}>
                      Administration
                    </button>
                  )}
                  <button
                    className="dropdown__item"
                    type="button"
                    disabled={isDownloadingKanji}
                    onClick={async () => {
                      setIsDropdownOpen(false);
                      setIsDownloadingKanji(true);
                      try {
                        const result = await downloadMissingKanjiSvgs();
                        alert(
                          `Terminé: ${result.downloaded} kanji téléchargé(s) sur ${result.missingCount} manquant(s). ${result.failed} échec(s).`,
                        );
                      } catch (error) {
                        alert(
                          `Erreur: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
                        );
                      } finally {
                        setIsDownloadingKanji(false);
                      }
                    }}
                  >
                    {isDownloadingKanji ? "Téléchargement..." : "Télécharger les kanji"}
                  </button>
                  <div className="dropdown__separator" />
                  <button
                    className="dropdown__item dropdown__item--danger"
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
          </div>
        </header>
      )}

      <main className="main">
        <Routes>
          <Route
            path="/login"
            element={
              isAuthLoading ? (
                <div className="muted">Chargement...</div>
              ) : currentUser ? (
                <Navigate
                  to={
                    typeof location.state === "object" &&
                    location.state &&
                    "from" in location.state &&
                    (location.state as { from?: { pathname?: string; search?: string } }).from
                      ?.pathname
                      ? `${(location.state as { from?: { pathname?: string; search?: string } }).from?.pathname}${(location.state as { from?: { pathname?: string; search?: string } }).from?.search ?? ""}`
                      : "/"
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
          <Route path="/" element={requireAuth(<HomePage currentUser={currentUser} />)} />
          <Route path="/train" element={<Navigate to="/" replace />} />
          <Route path="/train/difficult" element={requireAuth(<TrainPage mode="difficult" />)} />
          <Route path="/train/tag/:tagId" element={requireAuth(<TrainPage mode="tag" />)} />
          <Route path="/train/srs/:category" element={requireAuth(<TrainPage mode="srs" />)} />
          <Route path="/difficult" element={requireAuth(<DifficultWordsPage />)} />
          <Route path="/dictionary" element={requireAuth(<DictionaryPage />)} />
          <Route path="/kanji" element={requireAuth(<KanjiLearningPage />)} />
          <Route path="/srs" element={requireAuth(<SrsPage />)} />
          <Route path="/pratique" element={requireAuth(<PratiquePage />)} />
          <Route path="/dialogue" element={requireAuth(<DialoguePage />)} />
          <Route path="/phrases" element={<Navigate to="/pratique?tab=phrases" replace />} />
          <Route path="/jlpt" element={<Navigate to="/pratique?tab=jlpt" replace />} />
          <Route
            path="/conjugation"
            element={<Navigate to="/pratique?tab=conjugaison" replace />}
          />
          <Route path="/words" element={requireAuth(<WordsPage />)} />
          <Route path="/stats" element={requireAuth(<StatsPage />)} />
          <Route path="/kanji-quiz" element={requireAuth(<KanjiQuizPage />)} />
          <Route path="/phrases-bank" element={requireAuth(<PhraseBankPage />)} />
          <Route path="/grammaire" element={requireAuth(<GrammarPage />)} />
          <Route path="/lecture" element={requireAuth(<ReadingPage />)} />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
          <Route path="/admin" element={requireAuth(<AdminPage />)} />
          <Route path="/settings" element={requireAuth(<SettingsPage />)} />
          <Route path="*" element={<Navigate to="/train" replace />} />
        </Routes>
      </main>
      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}
    </div>
  );
}
