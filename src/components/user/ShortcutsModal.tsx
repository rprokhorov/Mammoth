import { useEffect } from "react";

interface ShortcutsModalProps {
  onClose: () => void;
}

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
const mod = isMac ? "Cmd" : "Ctrl";

const SHORTCUTS = [
  {
    category: "Navigation",
    items: [
      { keys: `${mod}+P`, action: "Quick Switcher — open channel or DM" },
      { keys: `${mod}+F`, action: "Search messages" },
      { keys: `${mod}+Shift+T`, action: "Toggle Threads view" },
      { keys: `${mod}+/`, action: "Show keyboard shortcuts" },
      { keys: "Escape", action: "Close panel / modal" },
    ],
  },
  {
    category: "Messages",
    items: [
      { keys: "Enter", action: "Send message" },
      { keys: "Shift+Enter", action: "New line in message" },
    ],
  },
  {
    category: "Tabs",
    items: [
      { keys: `${mod}+T`, action: "Open current channel in new tab" },
      { keys: `${mod}+W`, action: "Close active tab (default tab is protected)" },
      { keys: `${mod}+1–9`, action: "Switch to tab by position" },
    ],
  },
];

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="shortcuts-list">
          {SHORTCUTS.map((group) => (
            <div key={group.category} className="shortcuts-group">
              <h3>{group.category}</h3>
              {group.items.map((item) => (
                <div key={item.keys} className="shortcut-row">
                  <kbd className="shortcut-keys">{item.keys}</kbd>
                  <span className="shortcut-action">{item.action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
