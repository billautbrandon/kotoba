import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";

import type { ConstructionBlock } from "../../api";

type SentenceBuilderProps = {
  blocks: ConstructionBlock[];
  separator: string;
  disabled: boolean;
  onChange: (orderedIndices: number[]) => void;
  resetKey: string | number;
};

const POOL_ZONE_ID = "construction-pool";
const ANSWER_ZONE_ID = "construction-answer";

function buildBlockId(originalIndex: number): string {
  return `block-${originalIndex}`;
}

function parseBlockId(blockId: string): number {
  return Number(blockId.replace("block-", ""));
}

function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[swapIndex]] = [indices[swapIndex], indices[i]];
  }
  return indices;
}

export function joinBlocks(
  blocks: ConstructionBlock[],
  orderedIndices: number[],
  separator: string,
): string {
  return orderedIndices
    .map((originalIndex) => blocks[originalIndex]?.text ?? "")
    .filter((text) => text.length > 0)
    .join(separator);
}

function BlockContent({ block }: { block: ConstructionBlock }) {
  if (block.furigana) {
    return (
      <ruby className="constructionBlock__ruby">
        {block.text}
        <rt className="constructionBlock__furigana">{block.furigana}</rt>
      </ruby>
    );
  }
  return <span className="constructionBlock__main">{block.text}</span>;
}

type BlockChipProps = {
  blockId: string;
  block: ConstructionBlock;
  variant: "pool" | "answer";
  disabled: boolean;
  onClick: () => void;
};

function BlockChip({ blockId, block, variant, disabled, onClick }: BlockChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockId,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={`constructionBlock constructionBlock--${variant} ${
        isDragging ? "constructionBlock--ghost" : ""
      }`}
      disabled={disabled}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <BlockContent block={block} />
    </button>
  );
}

type DropZoneProps = {
  zoneId: string;
  variant: "pool" | "answer";
  blockIds: string[];
  blocks: ConstructionBlock[];
  disabled: boolean;
  emptyLabel: string;
  onBlockClick: (blockId: string) => void;
};

function DropZone({
  zoneId,
  variant,
  blockIds,
  blocks,
  disabled,
  emptyLabel,
  onBlockClick,
}: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId, disabled });

  return (
    <div
      ref={setNodeRef}
      className={`sentenceBuilder__zone sentenceBuilder__zone--${variant} ${
        isOver ? "sentenceBuilder__zone--over" : ""
      }`}
    >
      <SortableContext items={blockIds} strategy={rectSortingStrategy}>
        {blockIds.length === 0 ? (
          <span className="sentenceBuilder__empty">{emptyLabel}</span>
        ) : (
          blockIds.map((blockId) => {
            const originalIndex = parseBlockId(blockId);
            const block = blocks[originalIndex];
            if (!block) return null;
            return (
              <BlockChip
                key={blockId}
                blockId={blockId}
                block={block}
                variant={variant}
                disabled={disabled}
                onClick={() => onBlockClick(blockId)}
              />
            );
          })
        )}
      </SortableContext>
    </div>
  );
}

export function SentenceBuilder({
  blocks,
  separator,
  disabled,
  onChange,
  resetKey,
}: SentenceBuilderProps) {
  const [poolBlockIds, setPoolBlockIds] = useState<string[]>(() =>
    shuffleIndices(blocks.length).map(buildBlockId),
  );
  const [answerBlockIds, setAnswerBlockIds] = useState<string[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const previousResetKey = useRef(resetKey);
  if (previousResetKey.current !== resetKey) {
    previousResetKey.current = resetKey;
    setPoolBlockIds(shuffleIndices(blocks.length).map(buildBlockId));
    setAnswerBlockIds([]);
    setActiveBlockId(null);
  }

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const orderedIndices = answerBlockIds.map(parseBlockId);
    onChangeRef.current(orderedIndices);
  }, [answerBlockIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findContainer(blockId: string): "pool" | "answer" | null {
    if (poolBlockIds.includes(blockId)) return "pool";
    if (answerBlockIds.includes(blockId)) return "answer";
    return null;
  }

  function handleBlockClick(blockId: string) {
    if (disabled) return;
    const container = findContainer(blockId);
    if (container === "pool") {
      setPoolBlockIds((previous) => previous.filter((id) => id !== blockId));
      setAnswerBlockIds((previous) => [...previous, blockId]);
    } else if (container === "answer") {
      setAnswerBlockIds((previous) => previous.filter((id) => id !== blockId));
      setPoolBlockIds((previous) => [...previous, blockId]);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveBlockId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveBlockId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveBlockId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourceContainer = findContainer(activeId);
    if (!sourceContainer) return;

    let targetContainer: "pool" | "answer" | null = null;
    if (overId === POOL_ZONE_ID) targetContainer = "pool";
    else if (overId === ANSWER_ZONE_ID) targetContainer = "answer";
    else targetContainer = findContainer(overId);
    if (!targetContainer) return;

    if (sourceContainer === targetContainer) {
      const setter = sourceContainer === "pool" ? setPoolBlockIds : setAnswerBlockIds;
      setter((previous) => {
        const oldIndex = previous.indexOf(activeId);
        const newIndex = previous.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1) return previous;
        return arrayMove(previous, oldIndex, newIndex);
      });
      return;
    }

    if (sourceContainer === "pool" && targetContainer === "answer") {
      setPoolBlockIds((previous) => previous.filter((id) => id !== activeId));
      setAnswerBlockIds((previous) => {
        const overIndex = previous.indexOf(overId);
        if (overIndex === -1) return [...previous, activeId];
        const next = [...previous];
        next.splice(overIndex, 0, activeId);
        return next;
      });
    } else {
      setAnswerBlockIds((previous) => previous.filter((id) => id !== activeId));
      setPoolBlockIds((previous) => {
        const overIndex = previous.indexOf(overId);
        if (overIndex === -1) return [...previous, activeId];
        const next = [...previous];
        next.splice(overIndex, 0, activeId);
        return next;
      });
    }
  }

  const previewSentence = joinBlocks(blocks, answerBlockIds.map(parseBlockId), separator);

  const activeBlock = activeBlockId !== null ? (blocks[parseBlockId(activeBlockId)] ?? null) : null;
  const activeBlockVariant: "pool" | "answer" =
    activeBlockId !== null && answerBlockIds.includes(activeBlockId) ? "answer" : "pool";

  return (
    <div className="sentenceBuilder">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="sentenceBuilder__answerLabel">Ta phrase</div>
        <DropZone
          zoneId={ANSWER_ZONE_ID}
          variant="answer"
          blockIds={answerBlockIds}
          blocks={blocks}
          disabled={disabled}
          emptyLabel="Glisse ou clique sur les blocs pour reconstruire la phrase…"
          onBlockClick={handleBlockClick}
        />
        <div className="sentenceBuilder__preview">{previewSentence || "—"}</div>

        <div className="sentenceBuilder__poolLabel">Blocs disponibles</div>
        <DropZone
          zoneId={POOL_ZONE_ID}
          variant="pool"
          blockIds={poolBlockIds}
          blocks={blocks}
          disabled={disabled}
          emptyLabel="Tous les blocs ont été placés."
          onBlockClick={handleBlockClick}
        />

        <DragOverlay dropAnimation={null}>
          {activeBlock ? (
            <div
              className={`constructionBlock constructionBlock--${activeBlockVariant} constructionBlock--overlay`}
            >
              <BlockContent block={activeBlock} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
