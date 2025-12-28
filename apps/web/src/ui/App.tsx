import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import type { User } from "../api";
import { fetchMe, fetchSeries, logoutUser } from "../api";
import { DictionaryPage } from "./pages/DictionaryPage";
import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { HomePage } from "./pages/HomePage";
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

  const isAuthenticated = Boolean(currentUser) && !isAuthLoading;

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
            <div
              className="topbarUser__dropdownItem"
              style={{ fontWeight: 700, cursor: "default" }}
            >
              {currentUser.username}
            </div>
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
                <LoginPage
                  onAuthenticated={(user) => {
                    setCurrentUser(user);
                    navigate("/", { replace: true });
                  }}
                />
              }
            />

            <Route
              path="/"
              element={isAuthenticated ? <HomePage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/series/:tagId"
              element={isAuthenticated ? <SeriesStartPage /> : <Navigate to="/login" replace />}
            />
            <Route path="/train" element={<Navigate to="/" replace />} />
            <Route path="/train/difficult" element={<Navigate to="/" replace />} />
            <Route
              path="/train/tag/:tagId"
              element={
                isAuthenticated ? <TrainPage mode="tag" /> : <Navigate to="/login" replace />
              }
            />
            <Route
              path="/difficult"
              element={isAuthenticated ? <DifficultWordsPage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/dictionary"
              element={isAuthenticated ? <DictionaryPage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/words"
              element={isAuthenticated ? <WordsPage /> : <Navigate to="/login" replace />}
            />
            <Route path="*" element={<Navigate to="/train" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
