type NavIconProps = {
  className?: string;
};

export function HomeNavIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className ?? "sidebar__icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>Accueil</title>
      <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5.2v-6.2H9.2V21H5a1 1 0 0 1-1-1v-8.8Z" />
    </svg>
  );
}

export function VocabNavIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className ?? "sidebar__icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>Vocabulaire</title>
      <path d="M5 5h6a3 3 0 0 1 3 3v12l-3-1.5L8 20V8a3 3 0 0 1 3-3" />
      <path d="M19 5h-6a3 3 0 0 0-3 3v12l3-1.5 3 1.5V8a3 3 0 0 0-3-3" />
    </svg>
  );
}

export function SrsNavIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className ?? "sidebar__icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>SRS</title>
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <path d="M8 9.5h8M8 12.5h5.5" />
    </svg>
  );
}

export function PracticeNavIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className ?? "sidebar__icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>Pratique</title>
      <path d="M8 20V7.5A3.5 3.5 0 0 1 11.5 4H20v12.5H11.2A3.2 3.2 0 0 0 8 19.7" />
      <path d="M8 20H4.8A1.8 1.8 0 0 1 3 18.2V8.5" />
    </svg>
  );
}

export function ReadingNavIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className ?? "sidebar__icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>Lecture</title>
      <path d="M4.5 6.5c2.4-1.2 4.7-1.2 7.5 0v12c-2.8-1.2-5.1-1.2-7.5 0v-12Z" />
      <path d="M12 6.5c2.8-1.2 5.1-1.2 7.5 0v12c-2.4-1.2-4.7-1.2-7.5 0v-12Z" />
    </svg>
  );
}

export function PlayIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <title>Lancer</title>
      <path d="M8.5 5.8v12.4L19 12 8.5 5.8Z" />
    </svg>
  );
}
