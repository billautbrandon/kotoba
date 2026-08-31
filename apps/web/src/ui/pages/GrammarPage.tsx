import { useEffect, useState } from "react";
import { type GrammarNote, deleteGrammarNote, fetchGrammarNotes } from "../../api";

export function GrammarPage() {
  const [notes, setNotes] = useState<GrammarNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchGrammarNotes()
      .then((data) => {
        if (!isCancelled) setNotes(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleDelete(noteId: number) {
    if (!window.confirm("Supprimer cette fiche de grammaire ?")) return;
    try {
      await deleteGrammarNote(noteId);
      setNotes((previous) => previous.filter((note) => note.id !== noteId));
    } catch {
      // ignore
    }
  }

  const filteredNotes = searchQuery
    ? notes.filter((note) => note.topic.toLowerCase().includes(searchQuery.toLowerCase()))
    : notes;

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Mon précis de grammaire</h1>
          <p className="pageSubtitle">
            {notes.length} fiche{notes.length !== 1 ? "s" : ""} de grammaire
          </p>
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <input
          type="text"
          className="input"
          placeholder="Rechercher un sujet..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          style={{ maxWidth: "300px" }}
        />
      </div>

      {isLoading ? (
        <div className="muted">Chargement…</div>
      ) : filteredNotes.length === 0 ? (
        <div className="emptyState">
          <p className="emptyState__title">
            {searchQuery ? "Aucune fiche trouvée" : "Aucune fiche de grammaire"}
          </p>
          <p className="emptyState__text">
            {searchQuery
              ? "Essaie un autre mot-clé."
              : "Les fiches sont créées automatiquement quand tu cliques sur « Comprendre cette erreur » dans tes exercices."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  background: expandedNoteId === note.id ? "var(--color-surface)" : "transparent",
                }}
                onClick={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedNoteId(expandedNoteId === note.id ? null : note.id);
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>{note.topic}</span>
                  <span
                    style={{
                      marginLeft: "var(--space-3)",
                      fontSize: "12px",
                      color: "var(--color-text-soft)",
                    }}
                  >
                    {note.view_count} consultation{note.view_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <span style={{ fontSize: "14px", color: "var(--color-text-soft)" }}>
                  {expandedNoteId === note.id ? "▲" : "▼"}
                </span>
              </div>

              {expandedNoteId === note.id && (
                <div
                  style={{
                    padding: "0 var(--space-4) var(--space-4)",
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      marginTop: "var(--space-3)",
                    }}
                  >
                    {note.content}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: "var(--space-3)",
                    }}
                  >
                    <button
                      type="button"
                      className="button"
                      style={{ fontSize: "12px", padding: "2px 8px" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(note.id);
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
