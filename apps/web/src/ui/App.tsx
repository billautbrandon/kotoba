import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { DifficultWordsPage } from "./pages/DifficultWordsPage";
import { HomePage } from "./pages/HomePage";
import { TrainPage } from "./pages/TrainPage";
import { WordsPage } from "./pages/WordsPage";

export function App() {
  return (
    <div className="container">
      <header className="topbar">
        <div className="topbar__title">Kotoba</div>
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
            <Route path="/train" element={<TrainPage mode="all" />} />
            <Route path="/train/difficult" element={<TrainPage mode="difficult" />} />
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
