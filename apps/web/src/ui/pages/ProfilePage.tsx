import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { User } from "../../api";
import { fetchMe, updateProfile, uploadAvatar } from "../../api";

export function ProfilePage() {
  const navigate = useNavigate();
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
          if (user.avatar_url) {
            setAvatarPreview(user.avatar_url);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
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
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
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
      setSuccessMessage("Profil mis à jour avec succès.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div>
        <div className="muted" style={{ marginTop: 16 }}>
          Chargement…
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Profil</h1>
          <p className="pageSubtitle">Gère ton profil : email, nom d'affichage et avatar.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel__content">
          <form className="form" onSubmit={handleSubmit}>
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
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background: "var(--color-panel-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "32px",
                      fontWeight: 700,
                      color: "var(--color-text-soft)",
                    }}
                  >
                    {currentUser?.username[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <label
                  className="button"
                  style={{
                    cursor: "pointer",
                    display: "inline-block",
                  }}
                >
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
                Formats acceptés : JPEG, PNG, GIF, WebP (max 5 Mo)
              </div>
            </div>

            <label className="field">
              <div className="field__label">Nom d'utilisateur</div>
              <input className="input" value={currentUser?.username ?? ""} disabled />
              <div className="muted" style={{ marginTop: "var(--space-2)", fontSize: "14px" }}>
                Le nom d'utilisateur ne peut pas être modifié.
              </div>
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

            {errorMessage ? <div className="formError">{errorMessage}</div> : null}
            {successMessage ? (
              <div
                style={{
                  padding: "var(--space-4)",
                  background: "rgba(45, 67, 72, 0.1)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-success)",
                }}
              >
                {successMessage}
              </div>
            ) : null}

            <div className="row" style={{ marginTop: "var(--space-6)", gap: "var(--space-3)" }}>
              <button className="button button--primary" disabled={isSubmitting} type="submit">
                Enregistrer
              </button>
              <button
                className="button"
                type="button"
                onClick={() => navigate(-1)}
                disabled={isSubmitting}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
