import { useEffect } from "react";

type ShortcutsModalProps = {
  onClose: () => void;
};

type ShortcutGroup = {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
};

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Entraînement (Séries / SRS)",
    shortcuts: [
      { keys: ["→", "Entrée"], description: "Révéler la réponse / Mot suivant" },
      { keys: ["←"], description: "Mot précédent" },
      { keys: ["1"], description: "Réussi" },
      { keys: ["2"], description: "Partiel" },
      { keys: ["3"], description: "Raté" },
    ],
  },
  {
    title: "Phrases / JLPT",
    shortcuts: [
      { keys: ["Ctrl", "Entrée"], description: "Vérifier la réponse" },
      { keys: ["Ctrl", "→"], description: "Phrase / exercice suivant" },
      { keys: ["Escape"], description: "Recommencer" },
    ],
  },
  {
    title: "Dictionnaire",
    shortcuts: [
      { keys: ["Clic"], description: "Retourner une carte" },
      { keys: ["Escape"], description: "Fermer la vue agrandie" },
    ],
  },
  {
    title: "Global",
    shortcuts: [{ keys: ["?"], description: "Afficher cette aide" }],
  },
];

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="wordDetailOverlay"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="shortcutsModal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="wordDetailModal__close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>

        <h2 className="shortcutsModal__title">Raccourcis clavier</h2>

        {shortcutGroups.map((group) => (
          <div key={group.title} className="shortcutsModal__group">
            <h3 className="shortcutsModal__groupTitle">{group.title}</h3>
            <div className="shortcutsModal__list">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.description} className="shortcutsModal__row">
                  <div className="shortcutsModal__keys">
                    {shortcut.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <span className="shortcutsModal__plus">+</span>}
                        <kbd className="shortcutsModal__kbd">{key}</kbd>
                      </span>
                    ))}
                  </div>
                  <div className="shortcutsModal__desc">{shortcut.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
