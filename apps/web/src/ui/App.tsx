import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import type { SrsSummary, User } from "../api";
import { fetchMe, fetchSrsSummary, logoutUser } from "../api";
import { scrollAppToTop } from "../utils/scroll";
import {
  CatalogNavIcon,
  PracticeNavIcon,
  SrsNavIcon,
  VocabNavIcon,
  WordsNavIcon,
} from "./components/NavIcons";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { AdminPage } from "./pages/AdminPage";
import { CataloguePage } from "./pages/CataloguePage";
import { DialoguePage } from "./pages/DialoguePage";
import { DictionaryPage } from "./pages/DictionaryPage";
import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { GrammarPage } from "./pages/GrammarPage";
import { HomePage } from "./pages/HomePage";
import { KanjiLearningPage } from "./pages/KanjiLearningPage";
import { KanjiQuizPage } from "./pages/KanjiQuizPage";
import { LoginPage } from "./pages/LoginPage";
import { PhraseBankPage } from "./pages/PhraseBankPage";
import { PlacementPage } from "./pages/PlacementPage";
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

type TopNavLinkProps = {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  isActive?: boolean;
  variant?: "top" | "mobile";
};

function TopNavLink({ to, label, icon, badge, isActive, variant = "top" }: TopNavLinkProps) {
  const isMobile = variant === "mobile";
  return (
    <NavLink
      to={to}
      className={({ isActive: routeActive }) => {
        const active = isActive ?? routeActive;
        if (isMobile) {
          return `mobileBar__link${active ? " mobileBar__link--active" : ""}`;
        }
        return `topNav__link${active ? " topNav__link--active" : ""}`;
      }}
    >
      {icon}
      <span className={isMobile ? "mobileBar__label" : "topNav__linkLabel"}>{label}</span>
      {badge}
    </NavLink>
  );
}

function AccountMenu({
  currentUser,
  onLogout,
}: {
  currentUser: User;
  onLogout: () => Promise<void>;
}) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = currentUser.display_name ?? currentUser.username;

  useEffect(() => {
    if (location.key) setIsOpen(false);
  }, [location.key]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="accountMenu" ref={menuRef}>
      <button
        className={`accountMenu__trigger${isOpen ? " accountMenu__trigger--open" : ""}`}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Menu du compte"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span className="accountMenu__avatar">
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="accountMenu__avatarImg" />
          ) : (
            getInitials(displayName)
          )}
        </span>
        <span className="accountMenu__meta">
          <span className="accountMenu__name">{displayName}</span>
          <span className="accountMenu__level">Niv. {currentUser.level}</span>
        </span>
      </button>
      {isOpen ? (
        <div className="accountMenu__dropdown" role="menu">
          <div className="accountMenu__identity">
            <div className="accountMenu__identityName">{displayName}</div>
            <div className="accountMenu__identityLevel">Niveau {currentUser.level}</div>
          </div>
          <Link className="accountMenu__item" role="menuitem" to="/stats">
            Statistiques
          </Link>
          <Link className="accountMenu__item" role="menuitem" to="/settings">
            Paramètres
          </Link>
          {currentUser.is_admin === 1 ? (
            <Link className="accountMenu__item" role="menuitem" to="/admin">
              Administration
            </Link>
          ) : null}
          <button
            className="accountMenu__item accountMenu__item--danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              void onLogout();
            }}
          >
            Déconnexion
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
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
    const currentPath = location.pathname;
    let isMounted = true;
    fetchSrsSummary()
      .then((summary) => {
        if (isMounted && currentPath) setSrsSummary(summary);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, location.pathname]);

  useEffect(() => {
    if (!isAuthenticated || location.pathname !== "/") return;
    let isMounted = true;
    fetchMe()
      .then((user) => {
        if (isMounted) setCurrentUser(user);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, location.pathname]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the route changes
  useEffect(() => {
    scrollAppToTop();
  }, [location.pathname, location.search]);

  const isHomeActive = location.pathname === "/";
  const isVocabActive =
    location.pathname === "/dictionary" ||
    location.pathname.startsWith("/train/tag/") ||
    location.pathname.startsWith("/train/tags");
  const isSrsActive = location.pathname === "/srs" || location.pathname.startsWith("/train/srs/");
  const isTrainSession = location.pathname.startsWith("/train/");

  const primaryLinks = (
    <>
      <TopNavLink
        to="/dictionary"
        label="Vocabulaire"
        icon={<VocabNavIcon className="topNav__icon" />}
        isActive={isVocabActive}
      />
      <TopNavLink
        to="/catalogue"
        label="Catalogue"
        icon={<CatalogNavIcon className="topNav__icon" />}
      />
      <TopNavLink
        to="/srs"
        label="SRS"
        icon={<SrsNavIcon className="topNav__icon" />}
        isActive={isSrsActive}
        badge={
          srsSummary && srsSummary.dueCount > 0 ? (
            <span className="topNav__badge">{srsSummary.dueCount}</span>
          ) : null
        }
      />
      <TopNavLink
        to="/pratique"
        label="Pratique"
        icon={<PracticeNavIcon className="topNav__icon" />}
      />
      <TopNavLink to="/words" label="Mots" icon={<WordsNavIcon className="topNav__icon" />} />
    </>
  );

  async function handleLogout() {
    await logoutUser();
    setCurrentUser(null);
    navigate("/login", { replace: true });
  }

  return (
    <div
      className={`app${isAuthenticated ? " app--withNav" : ""}${isTrainSession ? " app--session" : ""}`}
    >
      {isAuthenticated && currentUser ? (
        <header className="topNav">
          <Link className={`topNav__brand${isHomeActive ? " topNav__brand--active" : ""}`} to="/">
            <span className="topNav__brandName">Kotoba</span>
            <span className="topNav__brandKana">言葉</span>
          </Link>
          <nav className="topNav__links" aria-label="Navigation principale">
            {primaryLinks}
          </nav>
          <AccountMenu currentUser={currentUser} onLogout={handleLogout} />
        </header>
      ) : null}

      <div className="app__content">
        <main className={`main${location.pathname === "/" ? " main--dashboard" : ""}`}>
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
                    onAuthenticated={(user, options) => {
                      setCurrentUser(user);
                      if (options?.isNewAccount && !user.placement_completed_at) {
                        navigate("/placement", { replace: true });
                        return;
                      }
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
            <Route
              path="/placement"
              element={requireAuth(<PlacementPage onCompleted={(user) => setCurrentUser(user)} />)}
            />
            <Route path="/catalogue" element={requireAuth(<CataloguePage />)} />
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
      {isAuthenticated && currentUser && !isTrainSession ? (
        <nav className="mobileBar" aria-label="Navigation mobile">
          <TopNavLink
            variant="mobile"
            to="/dictionary"
            label="Vocabulaire"
            icon={<VocabNavIcon className="topNav__icon" />}
            isActive={isVocabActive}
          />
          <TopNavLink
            variant="mobile"
            to="/catalogue"
            label="Catalogue"
            icon={<CatalogNavIcon className="topNav__icon" />}
          />
          <TopNavLink
            variant="mobile"
            to="/srs"
            label="SRS"
            icon={<SrsNavIcon className="topNav__icon" />}
            isActive={isSrsActive}
            badge={
              srsSummary && srsSummary.dueCount > 0 ? (
                <span className="topNav__badge">{srsSummary.dueCount}</span>
              ) : null
            }
          />
          <TopNavLink
            variant="mobile"
            to="/pratique"
            label="Pratique"
            icon={<PracticeNavIcon className="topNav__icon" />}
          />
          <TopNavLink
            variant="mobile"
            to="/words"
            label="Mots"
            icon={<WordsNavIcon className="topNav__icon" />}
          />
        </nav>
      ) : null}
      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}
    </div>
  );
}
