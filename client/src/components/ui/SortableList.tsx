import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
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

import { cn } from "@/lib/utils";

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Called with the source and destination indices after a drag (compatible with RHF `move`). */
  onReorder: (oldIndex: number, newIndex: number) => void;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
}

/**
 * Reusable vertical drag-to-reorder list. Encapsulates DndContext + SortableContext
 * (pointer + keyboard sensors, vertical-axis modifier) and renders each item via a
 * render-prop that receives a labeled drag handle. One implementation, many call sites.
 * DndContext/SortableContext render no DOM nodes, so each item's wrapper is a direct
 * child of wherever <SortableList> is placed (parent `space-y-*` spacing is preserved).
 */
export function SortableList<T>({ items, getId, onReorder, children }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);

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
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableItem key={getId(item)} id={getId(item)}>
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

function SortableItem({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: prefersReducedMotion() ? undefined : transition,
  };
  const handle = (
    <button
      type="button"
      aria-label="Drag to reorder"
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
