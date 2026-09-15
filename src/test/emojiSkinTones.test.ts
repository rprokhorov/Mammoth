import { describe, it, expect } from "vitest";
import { emojiNameToUnicode, EMOJI_MAP } from "@/components/message/EmojiPicker";

describe("emojiNameToUnicode — skin tone variants", () => {
  it("resolves the reported ok_hand_medium_light_skin_tone reaction", () => {
    expect(emojiNameToUnicode("ok_hand_medium_light_skin_tone")).toBe("\u{1F44C}\u{1F3FC}");
  });

  it("resolves all five tones for a base emoji", () => {
    expect(emojiNameToUnicode("thumbsup_light_skin_tone")).toBe("\u{1F44D}\u{1F3FB}");
    expect(emojiNameToUnicode("thumbsup_medium_light_skin_tone")).toBe("\u{1F44D}\u{1F3FC}");
    expect(emojiNameToUnicode("thumbsup_medium_skin_tone")).toBe("\u{1F44D}\u{1F3FD}");
    expect(emojiNameToUnicode("thumbsup_medium_dark_skin_tone")).toBe("\u{1F44D}\u{1F3FE}");
    expect(emojiNameToUnicode("thumbsup_dark_skin_tone")).toBe("\u{1F44D}\u{1F3FF}");
  });

  it("replaces the variation selector instead of appending after it", () => {
    // raised_hand_with_fingers_splayed is 🖐️ (U+1F590 U+FE0F)
    expect(emojiNameToUnicode("raised_hand_with_fingers_splayed_dark_skin_tone")).toBe(
      "\u{1F590}\u{1F3FF}",
    );
    // point_up is ☝️ (U+261D U+FE0F)
    expect(emojiNameToUnicode("point_up_medium_skin_tone")).toBe("\u{261D}\u{1F3FD}");
  });

  it("inserts the modifier after the person, keeping ZWJ parts intact", () => {
    // health_worker is 🧑‍⚕️ — tone goes on 🧑, before the ZWJ
    expect(emojiNameToUnicode("health_worker_medium_skin_tone")).toBe(
      "\u{1F9D1}\u{1F3FD}\u{200D}\u{2695}\u{FE0F}",
    );
  });

  it("leaves multi-person emoji as a literal name", () => {
    // family 👨‍👩‍👦 needs a per-person tone, which this suffix cannot express
    expect(emojiNameToUnicode("family_dark_skin_tone")).toBe(":family_dark_skin_tone:");
  });

  it("still resolves plain names and unknown names as before", () => {
    expect(emojiNameToUnicode("ok_hand")).toBe("\u{1F44C}");
    expect(emojiNameToUnicode("not_a_real_emoji")).toBe(":not_a_real_emoji:");
  });

  it("does not treat a tone suffix on a non-existent base as valid", () => {
    expect(emojiNameToUnicode("nonsense_light_skin_tone")).toBe(":nonsense_light_skin_tone:");
  });

  it("does not apply tones to emoji that have no modifier base", () => {
    // heart ❤️ is not a modifier base, so the suffixed form stays literal
    expect(emojiNameToUnicode("heart_light_skin_tone")).toBe(":heart_light_skin_tone:");
  });

  it("produces a valid variant for every modifier-base emoji in the map", () => {
    const modifierBase = /\p{Emoji_Modifier_Base}/u;
    const singlePerson = Object.entries(EMOJI_MAP).filter(
      ([, v]) => [...v].filter((c) => modifierBase.test(c)).length === 1,
    );
    expect(singlePerson.length).toBeGreaterThan(90);
    for (const [name] of singlePerson) {
      const result = emojiNameToUnicode(`${name}_medium_skin_tone`);
      expect(result, name).not.toMatch(/^:/);
      expect(result, name).toContain("\u{1F3FD}");
      // no variation selector should sit directly before the modifier
      expect(result, name).not.toContain("\u{FE0F}\u{1F3FD}");
    }
  });
});
