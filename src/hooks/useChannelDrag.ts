// Global singleton for custom channel drag (bypasses Tauri's HTML5 DnD interception)
let draggingChannelId: string | null = null;
const overListeners: Array<(over: boolean) => void> = [];
const endListeners: Array<(channelId: string, x: number, y: number) => void> = [];

export function getDraggingChannelId() {
  return draggingChannelId;
}

export function startChannelDrag(channelId: string, _channelName: string) {
  draggingChannelId = channelId;
}

export function endChannelDrag(x: number, y: number) {
  const id = draggingChannelId;
  draggingChannelId = null;
  overListeners.forEach((fn) => fn(false));
  if (id) endListeners.forEach((fn) => fn(id, x, y));
}

export function setDragOver(over: boolean) {
  overListeners.forEach((fn) => fn(over));
}

export function onDragOver(fn: (over: boolean) => void) {
  overListeners.push(fn);
  return () => { const i = overListeners.indexOf(fn); if (i >= 0) overListeners.splice(i, 1); };
}

export function onDragEnd(fn: (channelId: string, x: number, y: number) => void) {
  endListeners.push(fn);
  return () => { const i = endListeners.indexOf(fn); if (i >= 0) endListeners.splice(i, 1); };
}

// Ghost element shown while dragging
let ghostEl: HTMLDivElement | null = null;

export function createGhost(name: string) {
  ghostEl = document.createElement("div");
  ghostEl.textContent = name;
  ghostEl.style.cssText = `
    position: fixed; pointer-events: none; z-index: 99999;
    background: var(--bg-secondary, #1e1e2e); border: 1px solid var(--accent, #2389d7);
    color: var(--text, #cdd6f4); border-radius: 6px; padding: 4px 10px;
    font-size: 13px; white-space: nowrap; opacity: 0.9; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    transform: translate(-50%, -50%);
  `;
  document.body.appendChild(ghostEl);
}

export function moveGhost(x: number, y: number) {
  if (ghostEl) { ghostEl.style.left = x + "px"; ghostEl.style.top = y + "px"; }
}

export function removeGhost() {
  ghostEl?.remove(); ghostEl = null;
}
