import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  JOURNAL_BODY_MAX_LENGTH,
  type JournalEntry,
  type JournalReview,
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntries,
  reviewJournalEntry,
} from "../../api";
import { VoiceButton } from "../components/VoiceButton";

type JournalDayGroup = {
  dayKey: string;
  label: string;
  entries: JournalEntry[];
};

function parseUtcTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  return new Date(`${trimmed.replace(" ", "T")}Z`);
}

function formatJournalTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseUtcTimestamp(value));
}

function formatJournalStamp(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseUtcTimestamp(value));
}

function groupEntriesByDay(entries: JournalEntry[]): JournalDayGroup[] {
  const groups: JournalDayGroup[] = [];
  const groupByDayKey = new Map<string, JournalDayGroup>();
  const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  for (const entry of entries) {
    const createdAt = parseUtcTimestamp(entry.created_at);
    const dayKey = [
      createdAt.getFullYear(),
      String(createdAt.getMonth() + 1).padStart(2, "0"),
      String(createdAt.getDate()).padStart(2, "0"),
    ].join("-");
    const existingGroup = groupByDayKey.get(dayKey);
    if (existingGroup) {
      existingGroup.entries.push(entry);
      continue;
    }
    const group: JournalDayGroup = {
      dayKey,
      label: dayFormatter.format(createdAt),
      entries: [entry],
    };
    groupByDayKey.set(dayKey, group);
    groups.push(group);
  }

  return groups;
}

function JournalReviewBody({
  review,
  showStamp,
}: {
  review: JournalReview;
  showStamp: boolean;
}) {
  return (
    <>
      {showStamp ? (
        <p className="journalReview__meta">{formatJournalStamp(review.created_at)}</p>
      ) : null}
      <p className="journalReview__section">
        <span className="journalReview__label">Traduction</span>
        {review.payload.translation}
      </p>
      <p className="journalReview__section">
        <span className="journalReview__label">Version corrigée</span>
        <span className="journalReview__corrected">{review.payload.correctedText}</span>
      </p>
      <p className="journalReview__section">
        <span className="journalReview__label">Vocabulaire</span>
        {review.payload.vocabulary}
      </p>
      <p className="journalReview__section">
        <span className="journalReview__label">Formulation</span>
        {review.payload.formulation}
      </p>
      <p className="journalReview__section">
        <span className="journalReview__label">Bilan</span>
        {review.payload.summary}
      </p>
    </>
  );
}

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [reviewingEntryId, setReviewingEntryId] = useState<number | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [cardError, setCardError] = useState<{ entryId: number; message: string } | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchJournalEntries()
      .then((loadedEntries) => {
        if (isCancelled) return;
        setEntries(loadedEntries);
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        const message =
          error instanceof Error ? error.message : "Impossible de charger le journal.";
        setLoadError(message);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || isSaving) return;
    setIsSaving(true);
    setComposerError(null);
    try {
      const createdEntry = await createJournalEntry(body);
      setEntries((previous) => [createdEntry, ...previous]);
      setDraft("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Impossible d'enregistrer la carte.";
      setComposerError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(entryId: number) {
    if (deletingEntryId !== null) return;
    if (!window.confirm("Supprimer cette carte et ses relectures ?")) return;
    setDeletingEntryId(entryId);
    setCardError(null);
    try {
      await deleteJournalEntry(entryId);
      setEntries((previous) => previous.filter((entry) => entry.id !== entryId));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Impossible de supprimer la carte.";
      setCardError({ entryId, message });
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function handleReview(entryId: number) {
    if (reviewingEntryId !== null) return;
    setReviewingEntryId(entryId);
    setCardError(null);
    try {
      const result = await reviewJournalEntry(entryId);
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === entryId ? { ...entry, reviews: [result.review, ...entry.reviews] } : entry,
        ),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "La relecture a échoué.";
      setCardError({ entryId, message });
    } finally {
      setReviewingEntryId(null);
    }
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    const spokenText = text.trim();
    if (!spokenText) return;
    setDraft((previous) => {
      const needsSpace = previous.length > 0 && !previous.endsWith(" ") && !previous.endsWith("\n");
      const separator = needsSpace ? " " : "";
      return `${previous}${separator}${spokenText}`.slice(0, JOURNAL_BODY_MAX_LENGTH);
    });
  }, []);

  const dayGroups = groupEntriesByDay(entries);
  const trimmedDraft = draft.trim();

  return (
    <div className="journalPage">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Journal</h1>
          <p className="pageSubtitle">
            Écris ou dicte, en japonais ou en romaji. Enregistre une carte, puis demande une
            relecture.
          </p>
        </div>
      </div>

      <form className="journalComposer" onSubmit={handleSubmit}>
        <label className="journalComposer__label" htmlFor="journal-draft">
          Texte du jour
        </label>
        <textarea
          id="journal-draft"
          className="textarea journalComposer__input"
          value={draft}
          maxLength={JOURNAL_BODY_MAX_LENGTH}
          placeholder="Écris ou dicte autant que tu veux, en japonais ou en romaji…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="journalComposer__footer">
          <span className="journalComposer__count">
            {draft.length} / {JOURNAL_BODY_MAX_LENGTH}
          </span>
          <div className="journalComposer__actions">
            <VoiceButton
              onTranscript={handleVoiceTranscript}
              lang="ja-JP"
              continuous
              disabled={isSaving}
            />
            <button
              className="button button--primary"
              type="submit"
              disabled={isSaving || trimmedDraft.length === 0}
            >
              {isSaving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
        {composerError ? <p className="formError">{composerError}</p> : null}
      </form>

      {isLoading ? (
        <div className="muted">Chargement…</div>
      ) : loadError ? (
        <div className="formError">{loadError}</div>
      ) : dayGroups.length === 0 ? (
        <div className="emptyState">
          <p className="emptyState__title">Aucune carte</p>
          <p className="emptyState__text">
            Le journal commence avec le premier texte que tu enregistres.
          </p>
        </div>
      ) : (
        <div className="journalDays">
          {dayGroups.map((group) => (
            <section key={group.dayKey} className="journalDay" aria-label={group.label}>
              <h2 className="journalDay__title">{group.label}</h2>
              <div className="journalDay__cards">
                {group.entries.map((entry) => {
                  const latestReview = entry.reviews[0];
                  const olderReviews = entry.reviews.slice(1);
                  const isReviewing = reviewingEntryId === entry.id;
                  const isDeleting = deletingEntryId === entry.id;
                  return (
                    <article key={entry.id} className="journalCard">
                      <header className="journalCard__header">
                        <time className="journalCard__time" dateTime={entry.created_at}>
                          {formatJournalTime(entry.created_at)}
                        </time>
                        <button
                          type="button"
                          className="button button--ghost journalCard__delete"
                          disabled={isDeleting || isReviewing}
                          onClick={() => handleDelete(entry.id)}
                        >
                          {isDeleting ? "Suppression…" : "Supprimer"}
                        </button>
                      </header>
                      <p className="journalCard__body">{entry.body}</p>
                      <div className="journalCard__actions">
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={reviewingEntryId !== null || isDeleting}
                          onClick={() => handleReview(entry.id)}
                        >
                          {isReviewing ? "Relecture…" : "Corriger avec l'IA"}
                        </button>
                      </div>
                      {cardError?.entryId === entry.id ? (
                        <p className="formError">{cardError.message}</p>
                      ) : null}
                      {latestReview ? (
                        <div className="journalReviews">
                          <div className="journalReview">
                            <JournalReviewBody review={latestReview} showStamp />
                          </div>
                          {olderReviews.map((review) => (
                            <details key={review.id} className="journalReview journalReview--past">
                              <summary className="journalReview__toggle">
                                Relecture du {formatJournalStamp(review.created_at)}
                              </summary>
                              <JournalReviewBody review={review} showStamp={false} />
                            </details>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
