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
import { AdminPage } from "./pages/AdminPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SeriesStartPage } from "./pages/SeriesStartPage";
import { SrsPage } from "./pages/SrsPage";
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
    location.pathname.startsWith("/series/") ||
    location.pathname.startsWith("/train/tag/") ||
    location.pathname.startsWith("/train/srs/");

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
          style={{
            background: currentUser.avatar_url ? "transparent" : undefined,
            padding: currentUser.avatar_url ? 0 : undefined,
            border: currentUser.avatar_url ? "2px solid var(--color-border)" : undefined,
            overflow: "hidden",
          }}
        >
          {currentUser.avatar_url ? (
            <img
              src={currentUser.avatar_url}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            getInitials(currentUser.display_name ?? currentUser.username)
          )}
        </button>
        {isDropdownOpen && (
          <div className="topbarUser__dropdown">
            <button
              className="topbarUser__dropdownItem topbarUser__dropdownItem--header"
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                navigate("/profile");
              }}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}
            >
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt=""
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {getInitials(currentUser.display_name ?? currentUser.username)}
                </div>
              )}
              <span>{currentUser.display_name ?? currentUser.username}</span>
            </button>
            <button
              className="topbarUser__dropdownItem"
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                navigate("/profile");
              }}
            >
              Modifier le profil
            </button>
            <button
              className="topbarUser__dropdownItem"
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                navigate("/settings");
              }}
            >
              Changer le mot de passe
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
              to="/srs"
            >
              <span style={{ marginRight: "var(--space-2)" }}>🧠</span>
              SRS
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
              element={requireAuth(<TrainPage mode="tag" />)}
            />
            <Route
              path="/train/srs/:category"
              element={requireAuth(<TrainPage mode="srs" />)}
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
              path="/srs"
              element={requireAuth(<SrsPage />)}
            />
            <Route
              path="/words"
              element={requireAuth(<WordsPage />)}
            />
            <Route
              path="/profile"
              element={requireAuth(<ProfilePage />)}
            />
            <Route
              path="/admin"
              element={requireAuth(<AdminPage />)}
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
