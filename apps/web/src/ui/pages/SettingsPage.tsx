import type React from "react";
import { useEffect, useState } from "react";

import type { User } from "../../api";
import {
  changePassword,
  downloadMissingKanjiSvgs,
  fetchMe,
  updateProfile,
  uploadAvatar,
} from "../../api";
import { PillNav } from "../components/PillNav";
import { WordsPage } from "./WordsPage";

type SettingsTab = "profile" | "password" | "vocabulary" | "tools";
type ThemePreference = "light" | "dark";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; hint: string }> = [
  { id: "profile", label: "Profil", hint: "Compte et apparence" },
  { id: "password", label: "Mot de passe", hint: "Sécurité" },
  { id: "vocabulary", label: "Vocabulaire", hint: "Mots et imports" },
  { id: "tools", label: "Outils", hint: "Kanji et données" },
];

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("kotoba.theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme: ThemePreference) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  window.localStorage.setItem("kotoba.theme", theme);
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  return (
    <div className="settingsPage">
      <div className="pageHeader">
        <div>
          <p className="settingsPage__kicker">Compte</p>
          <h1 className="pageTitle">Paramètres</h1>
          <p className="pageSubtitle">
            Profil, apparence, sécurité, et gestion de ton vocabulaire.
          </p>
        </div>
      </div>

      <PillNav
        ariaLabel="Sections des paramètres"
        items={SETTINGS_TABS}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "profile" && <ProfileSection />}
      {activeTab === "password" && <PasswordSection />}
      {activeTab === "vocabulary" && (
        <div className="settingsVocab">
          <p className="settingsVocab__lead">
            Ajoute, organise et importe tes mots depuis cette liste.
          </p>
          <WordsPage />
        </div>
      )}
      {activeTab === "tools" && <ToolsSection />}
    </div>
  );
}

function ProfileSection() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(readStoredTheme);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      try {
        const user = await fetchMe();
        if (!isCancelled) {
          setCurrentUser(user);
          setEmail(user.email ?? "");
          setDisplayName(user.display_name ?? "");
          if (user.avatar_url) setAvatarPreview(user.avatar_url);
        }
      } catch (error) {
        if (!isCancelled)
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, []);

  function handleThemeChange(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("L'image doit faire moins de 5 Mo.");
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      if (avatarFile) {
        const updatedUser = await uploadAvatar(avatarFile);
        setCurrentUser(updatedUser);
        setAvatarFile(null);
      }
      const updatedUser = await updateProfile({
        email: email.trim() || null,
        display_name: displayName.trim() || null,
      });
      setCurrentUser(updatedUser);
      setSuccessMessage("Profil mis à jour.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="settingsPanel">
        <p className="muted">Chargement du profil…</p>
      </div>
    );
  }

  return (
    <div className="settingsStack">
      <form className="settingsPanel" onSubmit={handleSubmit}>
        <div className="settingsPanel__header">
          <div>
            <h2 className="settingsPanel__title">Identité</h2>
            <p className="settingsPanel__text">Avatar, nom d'affichage et adresse e-mail.</p>
          </div>
        </div>

        <div className="settingsIdentity">
          {avatarPreview ? (
            <img src={avatarPreview} alt="" className="settingsAvatar" />
          ) : (
            <div className="settingsAvatar settingsAvatar__placeholder">
              {currentUser?.username[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="settingsIdentity__meta">
            <div className="settingsIdentity__name">
              {displayName.trim() || currentUser?.username}
            </div>
            <div className="settingsIdentity__handle">@{currentUser?.username}</div>
            <label className="button settingsIdentity__upload">
              Choisir une image
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="srOnly"
              />
            </label>
            <p className="settingsIdentity__hint">JPEG, PNG, GIF ou WebP · 5 Mo max</p>
          </div>
        </div>

        <div className="settingsFields">
          <label className="field">
            <div className="field__label">Nom d'utilisateur</div>
            <input className="input" value={currentUser?.username ?? ""} disabled />
          </label>

          <label className="field">
            <div className="field__label">Nom d'affichage</div>
            <input
              className="input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ex: Brandon"
              maxLength={100}
            />
          </label>

          <label className="field">
            <div className="field__label">Email</div>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Ex: brandon@example.com"
            />
          </label>
        </div>

        {errorMessage && <div className="formError">{errorMessage}</div>}
        {successMessage && <div className="formSuccess">{successMessage}</div>}

        <div>
          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Enregistrement…" : "Enregistrer le profil"}
          </button>
        </div>
      </form>

      <div className="settingsPanel">
        <div className="settingsPanel__header">
          <div>
            <h2 className="settingsPanel__title">Apparence</h2>
            <p className="settingsPanel__text">Thème clair ou sombre pour toute l'application.</p>
          </div>
        </div>
        <fieldset className="settingsTheme">
          <legend className="srOnly">Thème</legend>
          <button
            type="button"
            className={`settingsTheme__option${theme === "light" ? " settingsTheme__option--active" : ""}`}
            onClick={() => handleThemeChange("light")}
          >
            <span
              className="settingsTheme__preview settingsTheme__preview--light"
              aria-hidden="true"
            />
            <span className="settingsTheme__name">Clair</span>
          </button>
          <button
            type="button"
            className={`settingsTheme__option${theme === "dark" ? " settingsTheme__option--active" : ""}`}
            onClick={() => handleThemeChange("dark")}
          >
            <span
              className="settingsTheme__preview settingsTheme__preview--dark"
              aria-hidden="true"
            />
            <span className="settingsTheme__name">Sombre</span>
          </button>
        </fieldset>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      if (!currentPassword) {
        setErrorMessage("Le mot de passe actuel est requis.");
        return;
      }
      if (!newPassword) {
        setErrorMessage("Le nouveau mot de passe est requis.");
        return;
      }
      if (newPassword.length < 8) {
        setErrorMessage("Le nouveau mot de passe doit contenir au moins 8 caractères.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage("Les mots de passe ne correspondent pas.");
        return;
      }

      await changePassword(currentPassword, newPassword);
      setSuccessMessage("Mot de passe modifié.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Impossible de modifier le mot de passe.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="settingsPanel" onSubmit={handleSubmit}>
      <div className="settingsPanel__header">
        <div>
          <h2 className="settingsPanel__title">Mot de passe</h2>
          <p className="settingsPanel__text">Choisis un mot de passe d'au moins 8 caractères.</p>
        </div>
      </div>

      <div className="settingsFields">
        <label className="field">
          <div className="field__label">Mot de passe actuel</div>
          <input
            className="input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        <label className="field">
          <div className="field__label">Nouveau mot de passe</div>
          <input
            className="input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </label>

        <label className="field">
          <div className="field__label">Confirmer</div>
          <input
            className="input"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </label>
      </div>

      {errorMessage && <div className="formError">{errorMessage}</div>}
      {successMessage && <div className="formSuccess">{successMessage}</div>}

      <div>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Modification…" : "Modifier le mot de passe"}
        </button>
      </div>
    </form>
  );
}

function ToolsSection() {
  const [isDownloadingKanji, setIsDownloadingKanji] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDownloadKanji() {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsDownloadingKanji(true);
    try {
      const result = await downloadMissingKanjiSvgs();
      setStatusMessage(
        `Terminé : ${result.downloaded} kanji téléchargé(s) sur ${result.missingCount} manquant(s). ${result.failed} échec(s).`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsDownloadingKanji(false);
    }
  }

  return (
    <div className="settingsStack">
      <div className="settingsPanel">
        <div className="settingsPanel__header">
          <div>
            <h2 className="settingsPanel__title">Traits de kanji</h2>
            <p className="settingsPanel__text">
              Télécharge les SVG manquants pour afficher le tracé des kanji pendant tes sessions.
            </p>
          </div>
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={isDownloadingKanji}
          onClick={() => void handleDownloadKanji()}
        >
          {isDownloadingKanji ? "Téléchargement…" : "Télécharger les kanji manquants"}
        </button>
        {errorMessage ? <div className="formError">{errorMessage}</div> : null}
        {statusMessage ? <div className="formSuccess">{statusMessage}</div> : null}
      </div>
    </div>
  );
}
