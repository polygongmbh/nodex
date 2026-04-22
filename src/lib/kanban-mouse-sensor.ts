import { useCallback, useEffect, useRef } from "react";
import type { FluidDragActions, PreDragActions, SensorAPI } from "@hello-pangea/dnd";

/**
 * A replacement for @hello-pangea/dnd's default useMouseSensor that does NOT
 * call event.preventDefault() on mousedown. This allows text selection on
 * draggable kanban cards while keeping the whole card as the drag handle.
 *
 * The drag still initiates normally — preventDefault is deferred until after
 * the sloppy-click threshold (5px) is exceeded, at which point the browser's
 * text-selection behaviour is already superseded by the drag.
 */

const PRIMARY_BUTTON = 0;
const DRAG_THRESHOLD_PX = 50;

type Phase =
  | { type: "IDLE" }
  | { type: "PENDING"; point: { x: number; y: number }; actions: PreDragActions }
  | { type: "DRAGGING"; actions: FluidDragActions };

function exceeded(origin: { x: number; y: number }, current: { x: number; y: number }) {
  return (
    Math.abs(current.x - origin.x) >= DRAG_THRESHOLD_PX ||
    Math.abs(current.y - origin.y) >= DRAG_THRESHOLD_PX
  );
}

export function useSelectableMouseSensor(api: SensorAPI): void {
  const phaseRef = useRef<Phase>({ type: "IDLE" });
  const cleanupRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    phaseRef.current = { type: "IDLE" };
  }, []);

  const cancel = useCallback(() => {
    const phase = phaseRef.current;
    stop();
    if (phase.type === "PENDING") phase.actions.abort();
    else if (phase.type === "DRAGGING") phase.actions.cancel({ shouldBlockNextClick: true });
  }, [stop]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const phase = phaseRef.current;
    if (phase.type === "IDLE") return;

    const point = { x: e.clientX, y: e.clientY };

    if (phase.type === "DRAGGING") {
      e.preventDefault();
      phase.actions.move(point);
      return;
    }

    // PENDING: check if threshold exceeded before starting drag
    if (!exceeded(phase.point, point)) return;
    e.preventDefault();
    const actions = phase.actions.fluidLift(point);
    phaseRef.current = { type: "DRAGGING", actions };
  }, []);

  const onMouseUp = useCallback((e: MouseEvent) => {
    const phase = phaseRef.current;
    if (phase.type === "PENDING") {
      cancel();
      return;
    }
    if (phase.type === "DRAGGING") {
      e.preventDefault();
      phase.actions.drop({ shouldBlockNextClick: true });
      stop();
    }
  }, [cancel, stop]);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") cancel();
  }, [cancel]);

  const onScroll = useCallback(() => {
    if (phaseRef.current.type === "PENDING") cancel();
  }, [cancel]);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== PRIMARY_BUTTON) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    const draggableId = api.findClosestDraggableId(e);
    if (!draggableId) return;

    const actions = api.tryGetLock(draggableId, cancel, { sourceEvent: e });
    if (!actions) return;

    // KEY DIFFERENCE from the default sensor: we do NOT call e.preventDefault() here.
    // This lets the browser start text selection on a plain click/click-drag.
    // The drag itself starts only after the mouse moves past DRAG_THRESHOLD_PX.

    phaseRef.current = {
      type: "PENDING",
      point: { x: e.clientX, y: e.clientY },
      actions,
    };

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("mousemove", onMouseMove, opts);
    window.addEventListener("mouseup", onMouseUp, opts);
    window.addEventListener("keydown", onKeyDown, opts);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", cancel);

    cleanupRef.current = () => {
      window.removeEventListener("mousemove", onMouseMove, opts);
      window.removeEventListener("mouseup", onMouseUp, opts);
      window.removeEventListener("keydown", onKeyDown, opts);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", cancel);
    };
  }, [api, cancel, onMouseMove, onMouseUp, onKeyDown, onScroll]);

  useEffect(() => {
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("mousedown", onMouseDown, opts);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, opts);
      cancel();
    };
  }, [onMouseDown, cancel]);
}
