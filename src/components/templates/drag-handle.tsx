"use client";

import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface DragHandleProps {
  className?: string;
  listeners?: SyntheticListenerMap;
  attributes?: DraggableAttributes;
}

export function DragHandle({ className, listeners, attributes }: DragHandleProps) {
  return (
    <button
      type="button"
      aria-label="Reorder"
      className={cn(
        "flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing hover:bg-gray-100 transition-colors touch-none",
        className
      )}
      {...listeners}
      {...attributes}
    >
      <GripVertical size={14} strokeWidth={1.5} className="text-gray-300" />
    </button>
  );
}
