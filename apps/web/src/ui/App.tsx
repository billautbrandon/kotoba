import type React from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import type { User } from "../api";
import { type SrsSummary, fetchMe, fetchSrsSummary, logoutUser } from "../api";
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

const MORE_PATH_PREFIXES = [
  "/dialogue",
  "/kanji-quiz",
  "/kanji",
  "/words",
  "/difficult",
  "/phrases-bank",
  "/grammaire",
  "/stats",
  "/settings",
  "/admin",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isMorePath(pathname: string): boolean {
  return MORE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function getMobilePageTitle(pathname: string): string {
  if (pathname.startsWith("/train/")) return "Session";
  if (pathname === "/" || pathname.startsWith("/series/")) return "Accueil";
  const titles: Array<[string, string]> = [
    ["/dictionary", "Dictionnaire"],
    ["/srs", "SRS"],
    ["/pratique", "Pratique"],
    ["/lecture", "Lecture"],
    ["/dialogue", "Dialogue"],
    ["/kanji-quiz", "Quiz kanji"],
    ["/kanji", "Kanji"],
    ["/words", "Mots"],
    ["/difficult", "Mots difficiles"],
    ["/phrases-bank", "Phrases"],
    ["/grammaire", "Grammaire"],
    ["/stats", "Statistiques"],
    ["/settings", "Paramètres"],
    ["/admin", "Administration"],
  ];
  for (const [prefix, title] of titles) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return "Kotoba";
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
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("kotoba.sidebarMore");
    if (stored === "closed") return false;
    if (stored === "open") return true;
    return isMorePath(window.location.pathname);
  });
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
    if (isAuthLoading) return <div className="muted">Chargement…</div>;
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

  useEffect(() => {
    if (isMorePath(location.pathname)) setIsMoreOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    window.localStorage.setItem("kotoba.sidebarMore", isMoreOpen ? "open" : "closed");
  }, [isMoreOpen]);

  function closeMobileNav() {
    setIsMobileNavOpen(false);
  }

  const sidebar = isAuthenticated ? (
    <aside id="app-sidebar" className={`sidebar${isMobileNavOpen ? " sidebar--open" : ""}`}>
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

        <button
          className="sidebar__moreToggle"
          type="button"
          aria-expanded={isMoreOpen}
          aria-controls="sidebar-more"
          onClick={() => setIsMoreOpen((previous) => !previous)}
        >
          Plus
          <span className="sidebar__moreChevron">{isMoreOpen ? "▾" : "▸"}</span>
        </button>
        {isMoreOpen ? (
          <div id="sidebar-more" className="sidebar__more">
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
          </div>
        ) : null}
      </nav>

      <div className="sidebar__footer">
        <Link className="sidebar__user" to="/settings" onClick={closeMobileNav}>
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
        </Link>
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
              aria-label={isMobileNavOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isMobileNavOpen}
              aria-controls="app-sidebar"
              onClick={() => setIsMobileNavOpen(true)}
            >
              Menu
            </button>
            <span className="mobileBar__title">{getMobilePageTitle(location.pathname)}</span>
          </div>
        ) : null}

        <main className="main">
          <Routes>
            <Route
              path="/login"
              element={
                isAuthLoading ? (
                  <div className="muted">Chargement…</div>
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
