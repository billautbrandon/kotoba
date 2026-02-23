import { useEffect, useState } from "react";

import type { User } from "../../api";
import { deleteAdminUser, fetchAdminUsers, fetchMe } from "../../api";

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      try {
        // First, fetch current user to check admin status
        const me = await fetchMe();
        if (!isCancelled) {
          setCurrentUser(me);
        }
        
        // Then fetch admin users if user is admin
        if (me.is_admin === 1) {
          try {
            const loadedUsers = await fetchAdminUsers();
            if (!isCancelled) {
              setUsers(loadedUsers);
            }
          } catch (error) {
            if (!isCancelled) {
              setErrorMessage(error instanceof Error ? error.message : "Erreur lors du chargement des utilisateurs");
            }
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

  async function handleDeleteUser(userId: number) {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible."))
      return;
    setErrorMessage(null);
    try {
      await deleteAdminUser(userId);
      setUsers((previousUsers) => previousUsers.filter((user) => user.id !== userId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
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

  if (!currentUser || currentUser.is_admin !== 1) {
    return (
      <div>
        <div className="muted" style={{ marginTop: 16 }}>
          Accès refusé. Cette page est réservée aux administrateurs.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Administration</h1>
          <p className="pageSubtitle">Gère les comptes utilisateurs.</p>
        </div>
      </div>

      {errorMessage ? (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Erreur: {errorMessage}</div>
        </div>
      ) : null}

      {users.length > 0 ? (
        <div style={{ marginTop: "var(--space-8)" }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nom d'utilisateur</th>
                <th>Nom d'affichage</th>
                <th>Email</th>
                <th>Admin</th>
                <th>Créé le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td style={{ fontWeight: 600 }}>{user.username}</td>
                  <td className="muted">{user.display_name || "—"}</td>
                  <td className="muted">{user.email || "—"}</td>
                  <td>{user.is_admin === 1 ? "✅" : "—"}</td>
                  <td className="muted">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    {user.id !== currentUser.id ? (
                      <button
                        className="button button--danger"
                        type="button"
                        onClick={() => void handleDeleteUser(user.id)}
                      >
                        Supprimer
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginTop: "var(--space-8)" }} className="muted">
          Aucun utilisateur trouvé.
        </div>
      )}
    </div>
  );
}
