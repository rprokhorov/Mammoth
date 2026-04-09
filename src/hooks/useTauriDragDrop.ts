import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getDraggingChannelId } from "./useChannelDrag";

type DropHandler = (paths: string[]) => void;

// Single global listener shared across all consumers
let listenerCount = 0;
let unlisten: (() => void) | null = null;
const dropZones: Map<HTMLElement, { onDrop: DropHandler; setHover: (v: boolean) => void }> = new Map();

function isInside(el: HTMLElement, x: number, y: number) {
  const rect = el.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

async function startListener() {
  const un = await getCurrentWebview().onDragDropEvent((event) => {
    // Ignore Tauri file drag events when an internal channel drag is in progress
    if (getDraggingChannelId()) return;
    const payload = event.payload;
    if (payload.type === "over") {
      const { x, y } = payload.position;
      for (const [el, { setHover }] of dropZones) {
        setHover(isInside(el, x, y));
      }
    } else if (payload.type === "drop") {
      const { x, y } = payload.position;
      for (const [, { setHover }] of dropZones) {
        setHover(false);
      }
      const paths = payload.paths ?? [];
      if (paths.length === 0) return;
      // Find the first zone under cursor
      for (const [el, { onDrop }] of dropZones) {
        if (isInside(el, x, y)) {
          onDrop(paths);
          return;
        }
      }
    } else {
      for (const [, { setHover }] of dropZones) {
        setHover(false);
      }
    }
  });
  unlisten = un;
}

function stopListener() {
  unlisten?.();
  unlisten = null;
}

export function useTauriDragDrop(
  ref: React.RefObject<HTMLElement | null>,
  onDrop: DropHandler,
  setHover: (v: boolean) => void,
  enabled = true,
) {
  const onDropRef = useRef(onDrop);
  const setHoverRef = useRef(setHover);
  onDropRef.current = onDrop;
  setHoverRef.current = setHover;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    dropZones.set(el, {
      onDrop: (paths) => onDropRef.current(paths),
      setHover: (v) => setHoverRef.current(v),
    });

    if (listenerCount === 0) {
      startListener();
    }
    listenerCount++;

    return () => {
      dropZones.delete(el);
      listenerCount--;
      if (listenerCount === 0) {
        stopListener();
      }
    };
  }, [ref, enabled]);
}
