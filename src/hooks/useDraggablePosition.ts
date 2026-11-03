import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

const STORAGE_PREFIX = "aria.draggablePosition.";
const DRAG_THRESHOLD_PX = 4;
const EDGE_MARGIN_PX = 8;

type Offset = { right: number; bottom: number };

function readStored(storageKey: string): Offset | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Offset>;
    return typeof parsed.right === "number" && typeof parsed.bottom === "number"
      ? { right: parsed.right, bottom: parsed.bottom }
      : null;
  } catch {
    return null;
  }
}

// Lets a `position: fixed` element be dragged anywhere in the viewport. The
// position is kept as an offset from the bottom-right corner (so a window
// resize keeps it near that corner), clamped on screen, and remembered per
// `storageKey`. A drag never fires the element's click; a plain tap still does.
export function useDraggablePosition(storageKey: string, defaultOffset: Offset) {
  const [offset, setOffset] = useState<Offset | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    startOffset: Offset;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  // Applied after mount so the server-rendered default matches first paint.
  useEffect(() => {
    setOffset(readStored(storageKey));
  }, [storageKey]);

  const clamp = useCallback((value: Offset): Offset => {
    const el = ref.current;
    const width = el?.offsetWidth ?? 0;
    const height = el?.offsetHeight ?? 0;
    return {
      right: Math.min(
        Math.max(value.right, EDGE_MARGIN_PX),
        Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX),
      ),
      bottom: Math.min(
        Math.max(value.bottom, EDGE_MARGIN_PX),
        Math.max(EDGE_MARGIN_PX, window.innerHeight - height - EDGE_MARGIN_PX),
      ),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setOffset((current) => (current ? clamp(current) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset ?? defaultOffset,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    state.moved = true;
    setOffset(
      clamp({
        right: state.startOffset.right - dx,
        bottom: state.startOffset.bottom - dy,
      }),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state?.moved) return;
    suppressClick.current = true;
    setOffset((current) => {
      if (current) {
        try {
          localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(current));
        } catch {
          // localStorage no disponible — la posición solo dura la sesión actual.
        }
      }
      return current;
    });
  };

  const onClickCapture = (event: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const position = offset ?? defaultOffset;
  const style: CSSProperties = {
    right: position.right,
    bottom: position.bottom,
    touchAction: "none",
  };

  return {
    ref,
    style,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  };
}
