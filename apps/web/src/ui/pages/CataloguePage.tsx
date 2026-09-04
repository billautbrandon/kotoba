import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  type CatalogEntry,
  type CatalogUserState,
  fetchCatalog,
  queueCatalogBatch,
  queueCatalogEntry,
  unqueueCatalogEntry,
} from "../../api";
import { AudioButton } from "../components/AudioButton";
import { CatalogBadge } from "../components/CatalogBadge";
import { FuriganaText } from "../components/FuriganaText";
import { PlayIcon } from "../components/NavIcons";
import { SearchBar } from "../components/SearchBar";
import { WordExtras } from "../components/WordExtras";
import { srsDuePath } from "../utils/srsBatch";

type CatalogueView = "list" | "grid";
type CatalogueFilter = "all" | "queued" | "available";

type GojuonSection = {
  key: string;
  label: string;
  title: string;
  entries: CatalogEntry[];
};

const GOJUON_ROWS = [
  { key: "a", label: "あ", title: "あ行" },
  { key: "ka", label: "か", title: "か行" },
  { key: "sa", label: "さ", title: "さ行" },
  { key: "ta", label: "た", title: "た行" },
  { key: "na", label: "な", title: "な行" },
  { key: "ha", label: "は", title: "は行" },
  { key: "ma", label: "ま", title: "ま行" },
  { key: "ya", label: "や", title: "や行" },
  { key: "ra", label: "ら", title: "ら行" },
  { key: "wa", label: "わ", title: "わ行" },
] as const;

const SMALL_KANA: Record<string, string> = {
  ぁ: "あ",
  ぃ: "い",
  ぅ: "う",
  ぇ: "え",
  ぉ: "お",
  ゃ: "や",
  ゅ: "ゆ",
  ょ: "よ",
  っ: "つ",
  ゎ: "わ",
};

const ROW_MEMBERS: Record<string, string> = {
  a: "あいうえお",
  ka: "かきくけこがぎぐげご",
  sa: "さしすせそざじずぜぞ",
  ta: "たちつてとだぢづでど",
  na: "なにぬねの",
  ha: "はひふへほばびぶべぼぱぴぷぺぽ",
  ma: "まみむめも",
  ya: "やゆよ",
  ra: "らりるれろ",
  wa: "わをん",
};

function toHiraganaChar(char: string): string {
  const codePoint = char.charCodeAt(0);
  if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
    return String.fromCharCode(codePoint - 0x60);
  }
  return char;
}

function gojuonRowKey(kana: string): string {
  const firstRaw = [...kana.trim()][0] ?? "";
  const firstHiragana = toHiraganaChar(firstRaw);
  const first = SMALL_KANA[firstHiragana] ?? firstHiragana;
  for (const row of GOJUON_ROWS) {
    if (ROW_MEMBERS[row.key].includes(first)) return row.key;
  }
  return "other";
}

function splitMeanings(french: string): string[] {
  return french
    .split(/[;/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function canToggleQueue(entry: CatalogEntry): boolean {
  return entry.state === "idle" || entry.state === "queued";
}

function isInSeries(entry: CatalogEntry): boolean {
  return entry.state === "queued" || entry.state === "learning" || entry.state === "known";
}

function stateLabel(state: CatalogUserState): string {
  if (state === "queued") return "En file";
  if (state === "learning") return "En cours";
  if (state === "known") return "Connu";
  return "";
}

export function CataloguePage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [jlptTagId, setJlptTagId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<CatalogueView>("list");
  const [filter, setFilter] = useState<CatalogueFilter>("all");
  const [openedEntryId, setOpenedEntryId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [collapsedByKey, setCollapsedByKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const payload = await fetchCatalog(debouncedQuery, "N5");
        if (!cancelled) {
          setEntries(payload.entries);
          setQueuedCount(payload.queuedCount);
          setJlptTagId(payload.jlptTagId);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const filteredEntries = useMemo(() => {
    if (filter === "queued") {
      return entries.filter((entry) => entry.state === "queued" || entry.state === "learning");
    }
    if (filter === "available") {
      return entries.filter((entry) => entry.state === "idle");
    }
    return entries;
  }, [entries, filter]);

  const sections = useMemo<GojuonSection[]>(() => {
    const grouped = new Map<string, CatalogEntry[]>();
    for (const entry of filteredEntries) {
      const rowKey = gojuonRowKey(entry.kana);
      const current = grouped.get(rowKey) ?? [];
      current.push(entry);
      grouped.set(rowKey, current);
    }
    const ordered: GojuonSection[] = GOJUON_ROWS.map((row) => ({
      ...row,
      entries: grouped.get(row.key) ?? [],
    })).filter((section) => section.entries.length > 0);
    const otherEntries = grouped.get("other") ?? [];
    if (otherEntries.length > 0) {
      ordered.push({ key: "other", label: "他", title: "Autres", entries: otherEntries });
    }
    return ordered;
  }, [filteredEntries]);

  const openedEntry = useMemo(
    () => entries.find((entry) => entry.id === openedEntryId) ?? null,
    [entries, openedEntryId],
  );

  const seriesPath = jlptTagId
    ? `/train/tag/${jlptTagId}?name=${encodeURIComponent("JLPT N5")}`
    : srsDuePath();

  function applyEntryStates(catalogIds: number[], nextState: CatalogUserState) {
    setEntries((current) =>
      current.map((item) =>
        catalogIds.includes(item.id) && canToggleQueue(item) ? { ...item, state: nextState } : item,
      ),
    );
  }

  async function toggleQueue(entry: CatalogEntry) {
    if (!canToggleQueue(entry) || pendingIds.length > 0) return;
    setPendingIds([entry.id]);
    try {
      const payload =
        entry.state === "queued"
          ? await unqueueCatalogEntry(entry.id)
          : await queueCatalogEntry(entry.id);
      setQueuedCount(payload.queuedCount);
      if (payload.jlptTagId !== undefined) setJlptTagId(payload.jlptTagId ?? null);
      applyEntryStates([entry.id], entry.state === "queued" ? "idle" : "queued");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de modifier la file");
    } finally {
      setPendingIds([]);
    }
  }

  async function toggleSection(section: GojuonSection, action: "queue" | "unqueue") {
    const catalogIds = section.entries
      .filter((entry) => (action === "queue" ? entry.state === "idle" : entry.state === "queued"))
      .map((entry) => entry.id);
    if (catalogIds.length === 0 || pendingIds.length > 0) return;
    setPendingIds(catalogIds);
    try {
      const payload = await queueCatalogBatch(catalogIds, action);
      setQueuedCount(payload.queuedCount);
      setJlptTagId(payload.jlptTagId);
      applyEntryStates(catalogIds, action === "queue" ? "queued" : "idle");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de modifier la file");
    } finally {
      setPendingIds([]);
    }
  }

  function isSectionCollapsed(sectionKey: string): boolean {
    if (debouncedQuery) return false;
    return collapsedByKey[sectionKey] ?? true;
  }

  function toggleSectionCollapsed(sectionKey: string) {
    setCollapsedByKey((previous) => ({
      ...previous,
      [sectionKey]: !(previous[sectionKey] ?? true),
    }));
  }

  function scrollToSection(rowKey: string) {
    setCollapsedByKey((previous) => ({ ...previous, [rowKey]: false }));
    window.requestAnimationFrame(() => {
      document
        .getElementById(`catalogue-row-${rowKey}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="cataloguePage">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Catalogue N5</h1>
          <p className="pageSubtitle">
            Range par ordre japonais, coche tes mots, puis lance une série.
          </p>
        </div>
        <div className="cataloguePage__viewToggle">
          <button
            type="button"
            className={`cataloguePage__viewBtn${view === "list" ? " cataloguePage__viewBtn--active" : ""}`}
            onClick={() => setView("list")}
          >
            Liste
          </button>
          <button
            type="button"
            className={`cataloguePage__viewBtn${view === "grid" ? " cataloguePage__viewBtn--active" : ""}`}
            onClick={() => setView("grid")}
          >
            Grille
          </button>
        </div>
      </div>

      <section className={`catalogueHero${queuedCount > 0 ? "" : " catalogueHero--empty"}`}>
        <div className="catalogueHero__copy">
          <p className="catalogueHero__kicker">
            {queuedCount > 0 ? "Ta série N5" : "Compose ta série"}
          </p>
          <h2 className="catalogueHero__title">
            {queuedCount > 0
              ? `Lancer ${queuedCount} mot${queuedCount > 1 ? "s" : ""}`
              : "Coche les mots que tu veux apprendre"}
          </h2>
          <p className="catalogueHero__text">
            {queuedCount > 0
              ? "Les mots en file passent en premier. Tu les étudies comme une série dédiée."
              : "Clique sur la case pour ajouter. Clique sur le mot pour le comprendre en détail."}
          </p>
        </div>
        {queuedCount > 0 ? (
          <Link className="button button--primary catalogueHero__cta" to={seriesPath}>
            <PlayIcon className="vocabPage__playIcon" />
            Lancer la série
          </Link>
        ) : null}
      </section>

      <SearchBar
        className="catalogueSearch"
        value={query}
        onChange={setQuery}
        placeholder="Chercher un sens, un kanji, un kana…"
        ariaLabel="Chercher dans le catalogue N5"
        countLabel={`${filteredEntries.length} mot${filteredEntries.length > 1 ? "s" : ""}`}
      />

      <div className="catalogueToolbar">
        <div className="catalogueFilters" role="tablist" aria-label="Filtrer le catalogue">
          <button
            type="button"
            className={`catalogueFilters__chip${filter === "all" ? " catalogueFilters__chip--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Tous
          </button>
          <button
            type="button"
            className={`catalogueFilters__chip${filter === "queued" ? " catalogueFilters__chip--active" : ""}`}
            onClick={() => setFilter("queued")}
          >
            En file{queuedCount > 0 ? ` · ${queuedCount}` : ""}
          </button>
          <button
            type="button"
            className={`catalogueFilters__chip${filter === "available" ? " catalogueFilters__chip--active" : ""}`}
            onClick={() => setFilter("available")}
          >
            À découvrir
          </button>
        </div>
        {!debouncedQuery && sections.length > 0 ? (
          <nav className="catalogueJump" aria-label="Aller à une ligne">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                className="catalogueJump__chip"
                onClick={() => scrollToSection(section.key)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      {errorMessage ? <div className="formError">{errorMessage}</div> : null}

      <h2 className="cataloguePage__listTitle">
        {debouncedQuery
          ? `Résultats pour « ${debouncedQuery} »`
          : "Vocabulaire N5, ordre あいうえお"}
      </h2>

      {isLoading ? <div className="muted">Chargement du catalogue…</div> : null}

      {!isLoading && filteredEntries.length === 0 ? (
        <div className="muted">Aucun mot pour ce filtre.</div>
      ) : null}

      {sections.map((section) => {
        const idleCount = section.entries.filter((entry) => entry.state === "idle").length;
        const queuedInSection = section.entries.filter((entry) => entry.state === "queued").length;
        const isSectionPending = section.entries.some((entry) => pendingIds.includes(entry.id));
        const isCollapsed = isSectionCollapsed(section.key);

        return (
          <section
            key={section.key}
            id={`catalogue-row-${section.key}`}
            className={`catalogueSection${isCollapsed ? " catalogueSection--collapsed" : ""}`}
          >
            <header className="catalogueSection__header">
              <button
                type="button"
                className="catalogueSection__toggle"
                onClick={() => toggleSectionCollapsed(section.key)}
                aria-expanded={!isCollapsed}
              >
                <span
                  className={`collapseChevron${isCollapsed ? "" : " collapseChevron--open"}`}
                  aria-hidden="true"
                />
                <span>
                  <span className="catalogueSection__title">{section.title}</span>
                  <span className="catalogueSection__count">
                    {section.entries.length} mot{section.entries.length > 1 ? "s" : ""}
                  </span>
                </span>
              </button>
              <div className="catalogueSection__actions">
                {idleCount > 0 ? (
                  <button
                    type="button"
                    className="catalogueSection__action"
                    disabled={isSectionPending}
                    onClick={() => void toggleSection(section, "queue")}
                  >
                    Tout ajouter
                  </button>
                ) : null}
                {queuedInSection > 0 ? (
                  <button
                    type="button"
                    className="catalogueSection__action catalogueSection__action--ghost"
                    disabled={isSectionPending}
                    onClick={() => void toggleSection(section, "unqueue")}
                  >
                    Tout retirer
                  </button>
                ) : null}
              </div>
            </header>

            {isCollapsed ? null : view === "grid" ? (
              <div className="catalogueGrid">
                {section.entries.map((entry) => (
                  <article
                    key={entry.id}
                    className={`catalogueGrid__card${isInSeries(entry) ? " catalogueGrid__card--on" : ""}`}
                  >
                    <button
                      type="button"
                      className="catalogueGrid__open"
                      onClick={() => setOpenedEntryId(entry.id)}
                    >
                      <CatalogBadge level={entry.jlpt_level} />
                      <div className="catalogueGrid__jp">
                        <FuriganaText kanji={entry.kanji ?? entry.kana} kana={entry.kana} />
                      </div>
                      <div className="catalogueGrid__fr">{entry.french}</div>
                    </button>
                    <button
                      type="button"
                      className={`catalogueSelect${isInSeries(entry) ? " catalogueSelect--on" : ""}`}
                      disabled={pendingIds.includes(entry.id) || !canToggleQueue(entry)}
                      onClick={() => void toggleQueue(entry)}
                      aria-pressed={isInSeries(entry)}
                      aria-label={
                        entry.state === "queued"
                          ? "Retirer de la série"
                          : canToggleQueue(entry)
                            ? "Ajouter à la série"
                            : stateLabel(entry.state)
                      }
                    >
                      {isInSeries(entry) ? "✓" : "+"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <ul className="catalogueList">
                {section.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className={`catalogueList__row${isInSeries(entry) ? " catalogueList__row--on" : ""}`}
                  >
                    <button
                      type="button"
                      className={`catalogueSelect${isInSeries(entry) ? " catalogueSelect--on" : ""}`}
                      disabled={pendingIds.includes(entry.id) || !canToggleQueue(entry)}
                      onClick={() => void toggleQueue(entry)}
                      aria-pressed={isInSeries(entry)}
                      aria-label={
                        entry.state === "queued"
                          ? "Retirer de la série"
                          : canToggleQueue(entry)
                            ? "Ajouter à la série"
                            : stateLabel(entry.state)
                      }
                    >
                      {isInSeries(entry) ? "✓" : ""}
                    </button>
                    <button
                      type="button"
                      className="catalogueList__main"
                      onClick={() => setOpenedEntryId(entry.id)}
                    >
                      <span className="catalogueList__jp">
                        <FuriganaText kanji={entry.kanji ?? entry.kana} kana={entry.kana} />
                      </span>
                      <span className="catalogueList__sense">
                        {entry.sense_context || entry.french}
                      </span>
                    </button>
                    {entry.state !== "idle" ? (
                      <span className="catalogueList__state">{stateLabel(entry.state)}</span>
                    ) : (
                      <CatalogBadge level={entry.jlpt_level} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {queuedCount > 0 ? (
        <div className="catalogueQueueBar">
          <p>
            {queuedCount} mot{queuedCount > 1 ? "s" : ""} dans ta série N5
          </p>
          <Link className="button button--primary" to={seriesPath}>
            Lancer la série
          </Link>
        </div>
      ) : null}

      {openedEntry ? (
        <CatalogueImmersiveCard
          entry={openedEntry}
          isPending={pendingIds.includes(openedEntry.id)}
          onClose={() => setOpenedEntryId(null)}
          onToggle={() => void toggleQueue(openedEntry)}
        />
      ) : null}
    </div>
  );
}

function CatalogueImmersiveCard({
  entry,
  isPending,
  onClose,
  onToggle,
}: {
  entry: CatalogEntry;
  isPending: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const meanings = splitMeanings(entry.french);
  const spokenText = entry.kana || entry.kanji || "";

  return (
    <div
      className="wordDetailOverlay catalogueImmersive"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="wordDetailModal catalogueImmersive__modal"
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

        <div className="catalogueImmersive__top">
          <CatalogBadge level={entry.jlpt_level} />
          {entry.state !== "idle" ? (
            <span className="catalogueList__state">{stateLabel(entry.state)}</span>
          ) : null}
        </div>

        <div className="catalogueImmersive__word">
          <FuriganaText kanji={entry.kanji ?? entry.kana} kana={entry.kana} />
        </div>

        <div className="wordDetailModal__section">
          <div className="wordDetailModal__label">Lecture</div>
          <div className="wordDetailModal__kana">
            {entry.kana}
            <AudioButton text={spokenText} size="large" />
          </div>
          {entry.romaji ? <div className="wordDetailModal__romaji">{entry.romaji}</div> : null}
        </div>

        <div className="wordDetailModal__section">
          <div className="wordDetailModal__label">Sens</div>
          <div className="catalogueImmersive__meanings">
            {meanings.map((meaning) => (
              <span key={meaning} className="catalogueImmersive__meaning">
                {meaning}
              </span>
            ))}
          </div>
          {entry.sense_context ? (
            <p className="catalogueImmersive__context">{entry.sense_context}</p>
          ) : null}
        </div>

        <WordExtras
          jlptLevel={entry.jlpt_level}
          mnemonic={entry.mnemonic}
          breakdown={entry.kanji_breakdown}
          examples={entry.examples}
        />

        <div className="catalogueImmersive__footer">
          {canToggleQueue(entry) ? (
            <button
              type="button"
              className={`button ${entry.state === "queued" ? "" : "button--primary"} catalogueImmersive__cta`}
              disabled={isPending}
              onClick={onToggle}
            >
              {entry.state === "queued" ? "Retirer de la série" : "Ajouter à la série"}
            </button>
          ) : (
            <p className="muted">Ce mot est déjà dans ton vocabulaire.</p>
          )}
        </div>
      </div>
    </div>
  );
}
