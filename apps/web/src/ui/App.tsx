import type React from "react";
import { useEffect, useState } from "react";
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

type SidebarLinkProps = {
  to: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  isActive?: boolean;
  onNavigate?: () => void;
};

function SidebarLink({ to, label, icon, badge, isActive, onNavigate }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive: routeActive }) =>
        `sidebar__link ${(isActive ?? routeActive) ? "sidebar__link--active" : ""}`
      }
    >
      {icon}
      <span className="sidebar__linkLabel">{label}</span>
      {badge}
    </NavLink>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDownloadingKanji, setIsDownloadingKanji] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [srsSummary, setSrsSummary] = useState<SrsSummary | null>(null);

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

  const isHomeActive =
    location.pathname === "/" ||
    location.pathname.startsWith("/series/") ||
    location.pathname.startsWith("/train/tag/") ||
    location.pathname.startsWith("/train/tags") ||
    location.pathname.startsWith("/train/srs/");

  function closeMobileNav() {
    setIsMobileNavOpen(false);
  }

  const sidebar = isAuthenticated ? (
    <aside className={`sidebar${isMobileNavOpen ? " sidebar--open" : ""}`}>
      <Link className="sidebar__brand" to="/" onClick={closeMobileNav}>
        <span className="sidebar__brandName">Kotoba</span>
        <span className="sidebar__brandKana">言葉</span>
      </Link>

      <nav className="sidebar__nav">
        <SidebarLink
          to="/"
          label="Accueil"
          icon={<HomeNavIcon className="sidebar__icon" />}
          isActive={isHomeActive}
          onNavigate={closeMobileNav}
        />
        <SidebarLink
          to="/dictionary"
          label="Vocabulaire"
          icon={<VocabNavIcon className="sidebar__icon" />}
          onNavigate={closeMobileNav}
        />
        <SidebarLink
          to="/srs"
          label="SRS"
          icon={<SrsNavIcon className="sidebar__icon" />}
          badge={
            srsSummary && srsSummary.dueCount > 0 ? (
              <span className="sidebar__badge">{srsSummary.dueCount}</span>
            ) : null
          }
          onNavigate={closeMobileNav}
        />
        <SidebarLink
          to="/pratique"
          label="Pratique"
          icon={<PracticeNavIcon className="sidebar__icon" />}
          onNavigate={closeMobileNav}
        />
        <SidebarLink
          to="/lecture"
          label="Lecture"
          icon={<ReadingNavIcon className="sidebar__icon" />}
          onNavigate={closeMobileNav}
        />

        <div className="sidebar__section">Pratique</div>
        <SidebarLink to="/dialogue" label="Dialogue" onNavigate={closeMobileNav} />
        <SidebarLink to="/kanji" label="Kanji" onNavigate={closeMobileNav} />
        <SidebarLink to="/kanji-quiz" label="Quiz kanji" onNavigate={closeMobileNav} />

        <div className="sidebar__section">Vocabulaire</div>
        <SidebarLink to="/words" label="Mots" onNavigate={closeMobileNav} />
        <SidebarLink to="/difficult" label="Mots difficiles" onNavigate={closeMobileNav} />
        <SidebarLink to="/phrases-bank" label="Banque de phrases" onNavigate={closeMobileNav} />
        <SidebarLink to="/grammaire" label="Grammaire" onNavigate={closeMobileNav} />

        <div className="sidebar__section">Compte</div>
        <SidebarLink to="/stats" label="Statistiques" onNavigate={closeMobileNav} />
        <SidebarLink to="/settings" label="Paramètres" onNavigate={closeMobileNav} />
        {currentUser?.is_admin === 1 ? (
          <SidebarLink to="/admin" label="Administration" onNavigate={closeMobileNav} />
        ) : null}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__avatar">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="sidebar__avatarImg" />
            ) : (
              getInitials(currentUser?.display_name ?? currentUser?.username ?? "?")
            )}
          </div>
          <div className="sidebar__userName">
            {currentUser?.display_name ?? currentUser?.username}
          </div>
        </div>
        <button
          className="sidebar__footerButton"
          type="button"
          disabled={isDownloadingKanji}
          onClick={async () => {
            setIsDownloadingKanji(true);
            try {
              const result = await downloadMissingKanjiSvgs();
              alert(
                `Terminé: ${result.downloaded} kanji téléchargé(s) sur ${result.missingCount} manquant(s). ${result.failed} échec(s).`,
              );
            } catch (error) {
              alert(`Erreur: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
            } finally {
              setIsDownloadingKanji(false);
            }
          }}
        >
          {isDownloadingKanji ? "Téléchargement..." : "Télécharger les kanji"}
        </button>
        <button
          className="sidebar__footerButton sidebar__footerButton--danger"
          type="button"
          onClick={async () => {
            await logoutUser();
            setCurrentUser(null);
            closeMobileNav();
            navigate("/login", { replace: true });
          }}
        >
          Déconnexion
        </button>
      </div>
    </aside>
  ) : null;

  return (
    <div className={`app${isAuthenticated ? " app--withSidebar" : ""}`}>
      {sidebar}
      {isAuthenticated && isMobileNavOpen ? (
        <button
          className="sidebarBackdrop"
          type="button"
          aria-label="Fermer le menu"
          onClick={closeMobileNav}
        />
      ) : null}

      <div className="app__content">
        {isAuthenticated ? (
          <div className="mobileBar">
            <button
              className="mobileBar__menu"
              type="button"
              aria-label="Ouvrir le menu"
              onClick={() => setIsMobileNavOpen(true)}
            >
              Menu
            </button>
            <Link className="mobileBar__brand" to="/">
              Kotoba
            </Link>
          </div>
        ) : null}

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
                          ? (location.state as { from?: { pathname?: string; search?: string } })
                              .from
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
            <Route path="/train/tags" element={requireAuth(<TrainPage mode="tag" />)} />
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
      </div>
      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}
    </div>
  );
}
