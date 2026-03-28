import type React from "react";
import { useEffect, useState } from "react";

import type { User } from "../../api";
import {
  changePassword,
  fetchMe,
  fetchStreak,
  updateDailyGoal,
  updateProfile,
  uploadAvatar,
} from "../../api";
import { WordsPage } from "./WordsPage";

type SettingsTab = "profile" | "password" | "vocabulary" | "appearance";

function loadTheme(): "light" | "dark" {
  const saved = window.localStorage.getItem("kotoba.theme");
  if (saved === "dark") return "dark";
  return "light";
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem("kotoba.theme", theme);
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  return (
    <div>
      <div className="pageHeader">
        <h1 className="pageTitle">Parametres</h1>
        <p className="pageSubtitle">Gere ton profil et la securite de ton compte.</p>
      </div>

      <div className="settingsTabs">
        <button
          className={`settingsTabs__tab ${activeTab === "profile" ? "settingsTabs__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("profile")}
        >
          Profil
        </button>
        <button
          className={`settingsTabs__tab ${activeTab === "password" ? "settingsTabs__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("password")}
        >
          Mot de passe
        </button>
        <button
          className={`settingsTabs__tab ${activeTab === "vocabulary" ? "settingsTabs__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("vocabulary")}
        >
          Vocabulaire
        </button>
        <button
          className={`settingsTabs__tab ${activeTab === "appearance" ? "settingsTabs__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("appearance")}
        >
          Apparence
        </button>
      </div>

      {activeTab === "profile" && <ProfileSection />}
      {activeTab === "password" && <PasswordSection />}
      {activeTab === "vocabulary" && <WordsPage />}
      {activeTab === "appearance" && <AppearanceSection />}
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
      setSuccessMessage("Profil mis a jour.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="muted">Chargement...</div>;
  }

  return (
    <form className="form settingsSection" onSubmit={handleSubmit}>
      <div className="field">
        <div className="field__label">Avatar</div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Avatar"
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid var(--color-border)",
              }}
            />
          ) : (
            <div className="settingsAvatar__placeholder">
              {currentUser?.username[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <label className="button" style={{ cursor: "pointer" }}>
            Choisir une image
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <div className="muted" style={{ marginTop: "var(--space-2)", fontSize: "14px" }}>
          JPEG, PNG, GIF, WebP (max 5 Mo)
        </div>
      </div>

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

      {errorMessage && <div className="formError">{errorMessage}</div>}
      {successMessage && <div className="formSuccess">{successMessage}</div>}

      <div>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          Enregistrer
        </button>
      </div>
    </form>
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
        setErrorMessage("Le nouveau mot de passe doit contenir au moins 8 caracteres.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage("Les mots de passe ne correspondent pas.");
        return;
      }

      await changePassword(currentPassword, newPassword);
      setSuccessMessage("Mot de passe modifie.");
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
    <form className="form settingsSection" onSubmit={handleSubmit}>
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

      {errorMessage && <div className="formError">{errorMessage}</div>}
      {successMessage && <div className="formSuccess">{successMessage}</div>}

      <div>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          Modifier le mot de passe
        </button>
      </div>
    </form>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [dailyGoalSaved, setDailyGoalSaved] = useState(false);

  useEffect(() => {
    fetchStreak()
      .then((info) => setDailyGoal(info.dailyGoal))
      .catch(() => {});
  }, []);

  function handleThemeChange(newTheme: "light" | "dark") {
    setTheme(newTheme);
    applyTheme(newTheme);
  }

  async function handleDailyGoalSave() {
    try {
      await updateDailyGoal(dailyGoal);
      setDailyGoalSaved(true);
      setTimeout(() => setDailyGoalSaved(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="settingsSection">
      <div className="field">
        <div className="field__label">Thème</div>
        <div className="phrasesSetup__optionRow">
          <label
            className={`phrasesSetup__radioOption ${theme === "light" ? "phrasesSetup__radioOption--active" : ""}`}
          >
            <input
              type="radio"
              name="theme"
              checked={theme === "light"}
              onChange={() => handleThemeChange("light")}
            />
            Clair
          </label>
          <label
            className={`phrasesSetup__radioOption ${theme === "dark" ? "phrasesSetup__radioOption--active" : ""}`}
          >
            <input
              type="radio"
              name="theme"
              checked={theme === "dark"}
              onChange={() => handleThemeChange("dark")}
            />
            Sombre
          </label>
        </div>
      </div>

      <div className="field" style={{ marginTop: "var(--space-6)" }}>
        <div className="field__label">Objectif quotidien</div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <input
            className="input"
            type="number"
            min={1}
            max={200}
            value={dailyGoal}
            onChange={(event) => setDailyGoal(Number(event.target.value))}
            style={{ width: 80 }}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            révisions / jour
          </span>
          <button type="button" className="button button--primary" onClick={handleDailyGoalSave}>
            {dailyGoalSaved ? "Enregistré ✓" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
