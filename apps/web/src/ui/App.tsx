import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

import type { User } from "../api";
import { fetchMe, logoutUser } from "../api";
import { DictionaryPage } from "./pages/DictionaryPage";
import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SeriesStartPage } from "./pages/SeriesStartPage";
import { TrainPage } from "./pages/TrainPage";
import { WordsPage } from "./pages/WordsPage";

export function App() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

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

  const topbarRight = useMemo(() => {
    if (isAuthLoading) return <span className="topbarUser">Chargement…</span>;
    if (!currentUser) return <span className="topbarUser">Invité</span>;
    return (
      <div className="topbarUser">
        <span className="topbarUser__name">{currentUser.username}</span>
        <button
          className="button button--ghost"
          type="button"
          onClick={async () => {
            await logoutUser();
            setCurrentUser(null);
            navigate("/login", { replace: true });
          }}
        >
          Déconnexion
        </button>
      </div>
    );
  }, [currentUser, isAuthLoading, navigate]);

  const isAuthenticated = Boolean(currentUser) && !isAuthLoading;

  return (
    <div className="container">
      <header className="topbar">
        <div className="topbar__left">
          <Link className="topbar__titleLink" to="/">
            <span className="topbar__titleMain">Kotoba</span>
            <span className="topbar__titleKana">言葉</span>
          </Link>
        </div>

        <nav className="topbar__nav nav">
          <NavLink
            className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            to="/"
            end
          >
            Accueil
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            to="/train"
          >
            Entraînement
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            to="/difficult"
          >
            Mots difficiles
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            to="/dictionary"
          >
            Dictionnaire
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
            to="/words"
          >
            Mots
          </NavLink>
        </nav>

        <div className="topbar__right">{topbarRight}</div>
      </header>

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
