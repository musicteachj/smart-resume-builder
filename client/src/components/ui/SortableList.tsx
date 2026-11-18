import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type Modifier,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { capitalize, cn } from "@/lib/utils";

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Called with the source and destination indices after a drag (compatible with RHF `move`). */
  onReorder: (oldIndex: number, newIndex: number) => void;
  /** What each item is called in its handle's label and in screen-reader announcements
   * (e.g. "Summary", "position 2"). Defaults to "item N". */
  itemLabel?: (item: T, index: number) => string;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
}

/**
 * Reusable vertical drag-to-reorder list. Encapsulates DndContext + SortableContext
 * (pointer + keyboard sensors, vertical-axis modifier) and renders each item via a
 * render-prop that receives a labeled drag handle. One implementation, many call sites.
 * DndContext/SortableContext render no DOM nodes, so each item's wrapper is a direct
 * child of wherever <SortableList> is placed (parent `space-y-*` spacing is preserved).
 * Keyboard: focus a handle, Space to pick up, arrows to move, Space to drop, Esc to cancel.
 */
/**
 * Keyboard moves go one slot per arrow press, whatever the item heights. The library's
 * `sortableKeyboardCoordinates` lines the dragged item's edge up with the next item's edge, so
 * a short item (the Summary section) moved past a tall one (Work experience) ends up with its
 * center nearer the slot after, and `closestCenter` skipped a slot on a single press. Here the
 * dragged item's center moves to the center of the next slot instead. Droppable rects are the
 * items' resting positions, so repeated presses walk the list one slot at a time.
 */
const oneSlotKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const step = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
  if (step === 0) return sortableKeyboardCoordinates(event, args);
  event.preventDefault();

  const { active, collisionRect, droppableRects, droppableContainers, over } = args.context;
  if (!active || !collisionRect) return undefined;
  const slots = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ id: container.id, rect }] : [];
    })
    .sort((a, b) => a.rect.top - b.rect.top);
  const current = slots.findIndex((slot) => slot.id === (over?.id ?? active.id));
  const target = slots[current + step];
  if (current === -1 || !target) return undefined;

  const center = (rect: { top: number; height: number }) => rect.top + rect.height / 2;
  return {
    x: args.currentCoordinates.x,
    y: args.currentCoordinates.y + center(target.rect) - center(collisionRect),
  };
};

/**
 * Keep a mouse or touch drag inside the list, but not a keyboard drag: the one-slot getter
 * centers a moved item on the last slot, and clamping a taller item to the list's bottom edge
 * would pull its center back over the slot before, so the last slot could never be reached.
 */
const restrictPointerToParent: Modifier = (args) =>
  args.activatorEvent instanceof KeyboardEvent ? args.transform : restrictToParentElement(args);

export function SortableList<T>({
  items,
  getId,
  onReorder,
  itemLabel = (_item, index) => `item ${index + 1}`,
  children,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: oneSlotKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const labels = new Map(items.map((item, index) => [ids[index], itemLabel(item, index)]));

  // The library's default announcements read out raw ids (UUIDs here); say the item's
  // name and its position instead.
  const nameOf = (id: string | number) => labels.get(String(id)) ?? "item";
  const positionOf = (id: string | number) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      capitalize(
        over ? `${nameOf(active.id)} is over ${positionOf(over.id)}.` : `${nameOf(active.id)} is not over a position.`,
      ),
    onDragEnd: ({ active, over }) =>
      over ? `Dropped ${nameOf(active.id)} at ${positionOf(over.id)}.` : `Dropped ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Canceled. ${capitalize(nameOf(active.id))} stayed at ${positionOf(active.id)}.`,
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictPointerToParent]}
      accessibility={{ announcements }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableItem key={ids[index]} id={ids[index]} label={labels.get(ids[index]) ?? ""}>
            {(handle) => children(item, handle, index)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

/** Respect prefers-reduced-motion: drop the transform transition when the user opts out. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function SortableItem({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    // Translate only: dnd-kit scales the dragged item to the item it's over, which
    // stretches it when the list's items differ in height (sections, entries).
    transform: CSS.Translate.toString(transform),
    transition: prefersReducedMotion() ? undefined : transition,
  };
  const handle = (
    <button
      type="button"
      aria-label={`Reorder ${label}`}
      className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative z-10 opacity-80")}>
      {children(handle)}
    </div>
  );
}
