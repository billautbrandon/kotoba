import React from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";

import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { HomePage } from "./pages/HomePage";
import { SeriesStartPage } from "./pages/SeriesStartPage";
import { TrainPage } from "./pages/TrainPage";
import { WordsPage } from "./pages/WordsPage";

export function App() {
  return (
    <div className="container">
      <header className="topbar">
        <Link className="topbar__titleLink" to="/">
          Kotoba
        </Link>
        <nav className="nav">
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
            to="/words"
          >
            Mots
          </NavLink>
        </nav>
      </header>

      <div className="panel">
        <div className="panel__content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/series/:tagId" element={<SeriesStartPage />} />
            <Route path="/train" element={<Navigate to="/" replace />} />
            <Route path="/train/difficult" element={<Navigate to="/" replace />} />
            <Route path="/train/tag/:tagId" element={<TrainPage mode="tag" />} />
            <Route path="/difficult" element={<DifficultWordsPage />} />
            <Route path="/words" element={<WordsPage />} />
            <Route path="*" element={<Navigate to="/train" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
