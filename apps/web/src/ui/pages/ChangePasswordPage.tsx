import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { changePassword } from "../../api";

export function ChangePasswordPage() {
  const navigate = useNavigate();
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
      setSuccessMessage("Mot de passe modifié avec succès.");
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
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Changer le mot de passe</h1>
          <p className="pageSubtitle">Mets à jour ton mot de passe pour sécuriser ton compte.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel__content">
          <form className="form" onSubmit={handleSubmit}>
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
              <div className="field__label">Confirmer le nouveau mot de passe</div>
              <input
                className="input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
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
                Modifier le mot de passe
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

