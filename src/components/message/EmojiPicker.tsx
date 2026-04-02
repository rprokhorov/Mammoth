import { useState, useRef, useEffect, memo } from "react";
import { useCustomEmojiStore } from "@/stores/customEmojiStore";
import { useCustomEmojiImage } from "@/hooks/useCustomEmojiImage";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Optional ref to the trigger button — clicks on it won't trigger onClose */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "Smileys": [
    "thumbsup", "thumbsdown", "heart", "smile", "laughing", "wink",
    "grinning", "joy", "rofl", "blush", "thinking_face", "neutral_face",
    "expressionless", "roll_eyes", "disappointed", "worried", "angry",
    "cry", "sob", "scream", "flushed", "dizzy_face", "sunglasses",
    "nerd_face", "clown_face", "100", "fire", "star", "sparkles",
    "tada", "clap", "wave", "raised_hands", "pray", "muscle",
  ],
  "Objects": [
    "rocket", "airplane", "car", "hammer", "wrench", "gear",
    "bulb", "computer", "keyboard", "phone", "email", "calendar",
    "clock", "hourglass", "lock", "unlock", "key", "link",
    "pushpin", "paperclip", "scissors", "bookmark", "label", "mega",
  ],
  "Symbols": [
    "white_check_mark", "heavy_check_mark", "x", "heavy_multiplication_x",
    "exclamation", "question", "warning", "no_entry", "stop_sign",
    "arrow_up", "arrow_down", "arrow_left", "arrow_right",
    "heavy_plus_sign", "heavy_minus_sign", "heavy_division_sign",
    "recycle", "infinity", "copyright", "registered",
  ],
};

// Simple emoji name to unicode mapping for common emojis
export const EMOJI_MAP: Record<string, string> = {
  thumbsup: "\uD83D\uDC4D", thumbsdown: "\uD83D\uDC4E", heart: "\u2764\uFE0F",
  smile: "\uD83D\uDE04", laughing: "\uD83D\uDE06", wink: "\uD83D\uDE09",
  grinning: "\uD83D\uDE00", joy: "\uD83D\uDE02", rofl: "\uD83E\uDD23",
  blush: "\uD83D\uDE0A", thinking_face: "\uD83E\uDD14", neutral_face: "\uD83D\uDE10",
  expressionless: "\uD83D\uDE11", roll_eyes: "\uD83D\uDE44", disappointed: "\uD83D\uDE1E",
  worried: "\uD83D\uDE1F", angry: "\uD83D\uDE20", cry: "\uD83D\uDE22",
  sob: "\uD83D\uDE2D", scream: "\uD83D\uDE31", flushed: "\uD83D\uDE33",
  dizzy_face: "\uD83D\uDE35", sunglasses: "\uD83D\uDE0E", nerd_face: "\uD83E\uDD13",
  clown_face: "\uD83E\uDD21", "100": "\uD83D\uDCAF", fire: "\uD83D\uDD25",
  star: "\u2B50", sparkles: "\u2728", tada: "\uD83C\uDF89", clap: "\uD83D\uDC4F",
  wave: "\uD83D\uDC4B", raised_hands: "\uD83D\uDE4C", pray: "\uD83D\uDE4F",
  muscle: "\uD83D\uDCAA", rocket: "\uD83D\uDE80", airplane: "\u2708\uFE0F",
  car: "\uD83D\uDE97", hammer: "\uD83D\uDD28", wrench: "\uD83D\uDD27",
  gear: "\u2699\uFE0F", bulb: "\uD83D\uDCA1", computer: "\uD83D\uDCBB",
  keyboard: "\u2328\uFE0F", phone: "\uD83D\uDCF1", email: "\uD83D\uDCE7",
  calendar: "\uD83D\uDCC5", clock: "\uD83D\uDD50", hourglass: "\u231B",
  lock: "\uD83D\uDD12", unlock: "\uD83D\uDD13", key: "\uD83D\uDD11",
  link: "\uD83D\uDD17", pushpin: "\uD83D\uDCCC", paperclip: "\uD83D\uDCCE",
  scissors: "\u2702\uFE0F", bookmark: "\uD83D\uDD16", label: "\uD83C\uDFF7\uFE0F",
  mega: "\uD83D\uDCE3", white_check_mark: "\u2705", heavy_check_mark: "\u2714\uFE0F",
  x: "\u274C", heavy_multiplication_x: "\u2716\uFE0F", exclamation: "\u2757",
  question: "\u2753", warning: "\u26A0\uFE0F", no_entry: "\u26D4",
  stop_sign: "\uD83D\uDED1", arrow_up: "\u2B06\uFE0F", arrow_down: "\u2B07\uFE0F",
  arrow_left: "\u2B05\uFE0F", arrow_right: "\u27A1\uFE0F",
  heavy_plus_sign: "\u2795", heavy_minus_sign: "\u2796",
  heavy_division_sign: "\u2797", recycle: "\u267B\uFE0F",
  infinity: "\u267E\uFE0F", copyright: "\u00A9\uFE0F", registered: "\u00AE\uFE0F",
};

export function emojiNameToUnicode(name: string): string {
  return EMOJI_MAP[name] || `:${name}:`;
}

const CustomEmojiBtn = memo(function CustomEmojiBtn({
  id, name, onSelect,
}: { id: string; name: string; onSelect: (name: string) => void }) {
  const url = useCustomEmojiImage(id);
  return (
    <button className="emoji-btn custom-emoji-btn" onClick={() => onSelect(name)} title={`:${name}:`}>
      {url
        ? <img src={url} alt={name} style={{ width: 22, height: 22, objectFit: "contain" }} />
        : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>…</span>
      }
    </button>
  );
});

export function EmojiPicker({ onSelect, onClose, triggerRef }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Smileys");
  const pickerRef = useRef<HTMLDivElement>(null);
  const customEmojis = useCustomEmojiStore((s) => s.emojis);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef?.current?.contains(target)) return;
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, triggerRef]);

  const isCustomTab = activeCategory === "__custom__";

  const filteredStandard = search
    ? Object.values(EMOJI_CATEGORIES).flat().filter((n) => n.includes(search.toLowerCase()))
    : (!isCustomTab ? EMOJI_CATEGORIES[activeCategory] || [] : []);

  const filteredCustom = search
    ? customEmojis.filter((e) => e.name.includes(search.toLowerCase()))
    : (isCustomTab ? customEmojis : []);

  return (
    <div className="emoji-picker" ref={pickerRef}>
      <div className="emoji-picker-search">
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {!search && (
        <div className="emoji-picker-categories">
          {Object.keys(EMOJI_CATEGORIES).map((cat) => (
            <button
              key={cat}
              className={`emoji-cat-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat.charAt(0)}
            </button>
          ))}
          {customEmojis.length > 0 && (
            <button
              className={`emoji-cat-btn ${activeCategory === "__custom__" ? "active" : ""}`}
              onClick={() => setActiveCategory("__custom__")}
              title="Custom"
            >
              ★
            </button>
          )}
        </div>
      )}

      <div className="emoji-picker-grid">
        {filteredStandard.map((name) => (
          <button key={name} className="emoji-btn" onClick={() => onSelect(name)} title={`:${name}:`}>
            {EMOJI_MAP[name] || `:${name}:`}
          </button>
        ))}
        {(isCustomTab || search) && filteredCustom.map((e) => (
          <CustomEmojiBtn key={e.id} id={e.id} name={e.name} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
