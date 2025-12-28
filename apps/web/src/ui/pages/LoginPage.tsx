import type React from "react";
import { useMemo, useState } from "react";

import type { User } from "../../api";
import { loginUser, registerUser } from "../../api";

type Mode = "login" | "register";

export function LoginPage(props: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const title = useMemo(() => {
    return mode === "login" ? "Connexion" : "Créer un compte";
  }, [mode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const normalizedUsername = username.trim();
      if (!normalizedUsername) {
        setErrorMessage("Le nom d'utilisateur est requis.");
        return;
      }
      if (normalizedUsername.length < 3) {
        setErrorMessage("Le nom d'utilisateur doit faire au moins 3 caractères.");
        return;
      }
      if (!password) {
        setErrorMessage("Le mot de passe est requis.");
        return;
      }
      if (mode === "register" && password.length < 8) {
        setErrorMessage("Le mot de passe doit faire au moins 8 caractères.");
        return;
      }

      const user =
        mode === "login"
          ? await loginUser(normalizedUsername, password, rememberMe)
          : await registerUser(normalizedUsername, password);
      props.onAuthenticated(user);
    } catch {
      setErrorMessage(
        mode === "login"
          ? "Identifiants invalides."
          : "Impossible de créer le compte (vérifie le mot de passe).",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="authCard">
        <div className="authCard__header">
          <h1 className="authCard__title">{title}</h1>
          <p className="authCard__subtitle">Tes mots et séries sont liés à ton profil.</p>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <div className="field__label">Nom d'utilisateur</div>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="ex: brandon"
            />
          </label>

          <label className="field">
            <div className="field__label">Mot de passe</div>
            <input
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              placeholder="••••••••"
            />
          </label>

          {mode === "login" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                cursor: "pointer",
                fontSize: "15px",
                marginTop: "var(--space-2)",
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span>Rester connecté</span>
            </label>
          )}

          {errorMessage ? <div className="formError">{errorMessage}</div> : null}

          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {mode === "login" ? "Se connecter" : "Créer le compte"}
          </button>

          <div className="authCard__switch">
            {mode === "login" ? (
              <>
                Pas de compte ?{" "}
                <button
                  className="linkButton"
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setErrorMessage(null);
                  }}
                >
                  Créer un compte
                </button>
              </>
            ) : (
              <>
                Déjà un compte ?{" "}
                <button
                  className="linkButton"
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMessage(null);
                  }}
                >
                  Se connecter
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
