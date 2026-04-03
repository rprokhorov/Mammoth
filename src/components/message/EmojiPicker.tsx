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
    "grinning", "smiley", "smile", "grin", "laughing", "sweat_smile", "rofl", "joy",
    "slightly_smiling_face", "upside_down_face", "wink", "blush", "innocent",
    "heart_eyes", "kissing_heart", "kissing", "kissing_closed_eyes", "kissing_smiling_eyes",
    "yum", "stuck_out_tongue", "stuck_out_tongue_winking_eye", "stuck_out_tongue_closed_eyes",
    "money_mouth_face", "hugs", "thinking_face", "zipper_mouth_face", "raised_eyebrow",
    "neutral_face", "expressionless", "no_mouth", "smirk", "unamused", "roll_eyes",
    "grimacing", "lying_face", "relieved", "pensive", "sleepy", "drooling_face",
    "sleeping", "mask", "face_with_thermometer", "face_with_head_bandage", "nauseated_face",
    "sneezing_face", "hot_face", "cold_face", "woozy_face", "dizzy_face", "exploding_head",
    "cowboy_hat_face", "partying_face", "sunglasses", "nerd_face", "monocle_face",
    "confused", "worried", "slightly_frowning_face", "frowning_face", "open_mouth",
    "hushed", "astonished", "flushed", "pleading_face", "anguished", "fearful",
    "cold_sweat", "disappointed_relieved", "cry", "sob", "scream", "confounded",
    "persevere", "disappointed", "sweat", "weary", "tired_face", "yawning_face",
    "triumph", "rage", "angry", "skull", "skull_and_crossbones", "clown_face",
    "japanese_ogre", "japanese_goblin", "ghost", "alien", "space_invader", "robot",
    "poop", "thumbsup", "thumbsdown", "+1", "-1",
  ],
  "People": [
    "wave", "raised_back_of_hand", "raised_hand_with_fingers_splayed", "hand", "vulcan_salute",
    "ok_hand", "crossed_fingers", "v", "metal", "call_me_hand", "point_left", "point_right",
    "point_up_2", "point_down", "point_up", "raised_hands", "clap", "pray", "handshake",
    "writing_hand", "nail_care", "selfie", "muscle", "ear", "nose", "eyes", "eye",
    "tongue", "lips", "brain", "footprints", "bust_in_silhouette", "busts_in_silhouette",
    "speaking_head", "baby", "boy", "girl", "adult", "man", "woman", "older_adult",
    "older_man", "older_woman", "man_with_probing_cane", "man_in_manual_wheelchair",
    "man_in_motorized_wheelchair", "runner", "dancer", "man_dancing", "walking",
    "standing_person", "kneeling_person", "person_fencing", "horseback_riding",
    "snowboarder", "skier", "surfer", "rowboat", "swimmer", "person_golfing",
    "construction_worker", "guard", "detective", "health_worker", "farmer",
    "cook", "student", "singer", "artist", "teacher", "factory_worker",
    "technologist", "mechanic", "scientist", "pilot", "astronaut", "firefighter",
    "cop", "superhero", "supervillain", "mage", "fairy", "vampire", "zombie",
    "genie", "merperson", "elf", "santa", "mrs_claus", "angel", "pregnant_woman",
    "family", "couple", "two_men_holding_hands", "two_women_holding_hands",
    "couple_with_heart", "couplekiss", "bow", "person_gesturing_no",
    "person_gesturing_ok", "person_tipping_hand", "person_raising_hand",
    "person_frowning", "person_pouting", "haircut", "massage", "bath",
    "sleeping_accommodation", "people_hugging",
  ],
  "Animals": [
    "dog", "cat", "mouse", "hamster", "rabbit", "fox_face", "bear", "panda_face",
    "koala", "tiger", "lion", "cow", "pig", "pig_nose", "frog", "monkey_face",
    "see_no_evil", "hear_no_evil", "speak_no_evil", "monkey", "chicken", "penguin",
    "bird", "baby_chick", "hatching_chick", "hatched_chick", "duck", "eagle",
    "owl", "bat", "wolf", "boar", "horse", "unicorn", "bee", "bug", "butterfly",
    "snail", "shell", "ladybug", "ant", "mosquito", "cricket", "spider",
    "spider_web", "scorpion", "turtle", "snake", "lizard", "dragon_face", "dragon",
    "sauropod", "t-rex", "whale", "whale2", "dolphin", "fish", "tropical_fish",
    "blowfish", "shark", "octopus", "crab", "lobster", "shrimp", "squid",
    "oyster", "sneezing_face", "deer", "giraffe", "zebra", "gorilla",
    "elephant", "rhino", "hippopotamus", "kangaroo", "badger", "turkey",
    "flamingo", "parrot", "sloth", "otter", "skunk", "mammoth", "feather",
    "cat2", "dog2", "poodle", "rabbit2", "racoon", "chipmunk",
    "hedgehog", "rat", "mouse2", "rooster", "ram", "goat", "sheep",
    "pig2", "ox", "water_buffalo", "cow2", "horse2", "dna",
  ],
  "Food": [
    "apple", "green_apple", "pear", "tangerine", "lemon", "banana", "watermelon",
    "grapes", "strawberry", "melon", "cherries", "peach", "mango", "pineapple",
    "coconut", "kiwi_fruit", "tomato", "eggplant", "avocado", "broccoli",
    "leafy_green", "cucumber", "hot_pepper", "corn", "carrot", "garlic", "onion",
    "potato", "sweet_potato", "croissant", "bagel", "bread", "baguette_bread",
    "pretzel", "cheese", "egg", "cooking", "pancakes", "waffle", "bacon",
    "cut_of_meat", "poultry_leg", "meat_on_bone", "hotdog", "hamburger",
    "fries", "pizza", "sandwich", "stuffed_flatbread", "salad", "shallow_pan_of_food",
    "spaghetti", "ramen", "stew", "curry", "sushi", "bento", "dumpling",
    "fried_shrimp", "rice_ball", "rice", "rice_cracker", "fish_cake", "fortune_cookie",
    "moon_cake", "oden", "dango", "shaved_ice", "ice_cream", "icecream", "pie",
    "cake", "cupcake", "shortcake", "candy", "lollipop", "chocolate_bar",
    "popcorn", "salt", "honey_pot", "coffee", "tea", "milk_glass", "beverage_box",
    "juice_box", "cup_with_straw", "bubble_tea", "beer", "beers", "champagne",
    "wine_glass", "cocktail", "tropical_drink", "clinking_glasses", "tumbler_glass",
    "mate", "ice_cube", "chopsticks", "fork_and_knife_with_plate",
    "fork_and_knife", "spoon", "knife", "bowl_with_spoon", "cup_with_straw",
  ],
  "Travel": [
    "car", "taxi", "bus", "trolleybus", "minibus", "ambulance", "fire_engine",
    "police_car", "oncoming_police_car", "racing_car", "truck", "articulated_lorry",
    "tractor", "kick_scooter", "bike", "motor_scooter", "motorcycle",
    "monorail", "mountain_railway", "steam_locomotive", "railway_car",
    "station", "bullettrain_side", "bullettrain_front", "train2", "train",
    "metro", "light_rail", "tram", "busstop", "vertical_traffic_light",
    "traffic_light", "construction", "anchor", "boat", "canoe", "speedboat",
    "ship", "ferry", "motor_boat", "airplane", "small_airplane", "seat",
    "helicopter", "suspension_railway", "mountain_cableway", "aerial_tramway",
    "rocket", "flying_saucer", "parachute", "luggage", "tent", "canoe",
    "earth_africa", "earth_americas", "earth_asia", "globe_with_meridians",
    "world_map", "japan", "compass", "mountain_snow", "mountain", "volcano",
    "mount_fuji", "camping", "beach_umbrella", "desert", "desert_island",
    "national_park", "stadium", "classical_building", "building_construction",
    "houses", "derelict_house", "house", "house_with_garden", "office",
    "post_office", "european_post_office", "hospital", "bank", "hotel",
    "convenience_store", "school", "love_hotel", "wedding", "european_castle",
    "japanese_castle", "city_sunrise", "city_sunset", "cityscape",
    "night_with_stars", "bridge_at_night", "foggy", "sunrise_over_mountains",
    "sunrise", "milky_way", "stars", "sparkles", "star", "star2",
    "dizzy", "boom", "collision", "rainbow", "partly_sunny", "cloud",
    "snowflake", "snowman", "snowman_with_snow", "zap", "fire", "droplet",
    "ocean", "sunny", "full_moon", "crescent_moon",
  ],
  "Objects": [
    "eyeglasses", "dark_sunglasses", "goggles", "lab_coat", "safety_vest",
    "necktie", "shirt", "jeans", "scarf", "gloves", "coat", "socks",
    "dress", "kimono", "sari", "shorts", "bikini", "womans_clothes",
    "purse", "handbag", "pouch", "shopping", "school_satchel", "luggage",
    "mans_shoe", "athletic_shoe", "hiking_boot", "flat_shoe", "high_heel",
    "sandal", "ballet_shoes", "boot", "crown", "womans_hat", "tophat",
    "mortar_board", "billed_cap", "helmet_with_white_cross", "prayer_beads",
    "lipstick", "ring", "gem", "mute", "loudspeaker", "mega", "postal_horn",
    "bell", "no_bell", "musical_score", "musical_note", "notes",
    "microphone", "headphones", "radio", "saxophone", "accordion", "guitar",
    "musical_keyboard", "trumpet", "violin", "banjo", "drum",
    "iphone", "calling", "phone", "telephone_receiver", "pager",
    "fax", "battery", "electric_plug", "computer", "desktop_computer",
    "printer", "keyboard", "computer_mouse", "trackball", "minidisc",
    "floppy_disk", "cd", "dvd", "abacus", "movie_camera", "film_frames",
    "film_projector", "clapper", "tv", "camera", "camera_flash",
    "video_camera", "vhs", "mag", "mag_right", "candle", "bulb",
    "flashlight", "izakaya_lantern", "diya_lamp", "notebook_with_decorative_cover",
    "closed_book", "books", "open_book", "green_book", "blue_book",
    "orange_book", "notebook", "ledger", "card_index", "chart_with_upwards_trend",
    "chart_with_downwards_trend", "bar_chart", "spiral_notepad", "calendar",
    "date", "card_index_dividers", "file_cabinet", "wastebasket", "card_file_box",
    "ballot_box_with_ballot", "file_folder", "open_file_folder",
    "scissors", "paperclip", "paperclips", "straight_ruler", "triangular_ruler",
    "pushpin", "round_pushpin", "hammer", "axe", "pick", "hammer_and_pick",
    "hammer_and_wrench", "dagger", "sword", "gun", "bow_and_arrow",
    "shield", "wrench", "nut_and_bolt", "gear", "clamp", "link",
    "chains", "hook", "toolbox", "magnet", "ladder", "alembic",
    "test_tube", "petri_dish", "microscope", "telescope", "satellite",
    "syringe", "drop_of_blood", "pill", "adhesive_bandage", "stethoscope",
    "door", "elevator", "mirror", "window", "couch_and_lamp", "chair",
    "toilet", "plunger", "shower", "bathtub", "razor", "lotion_bottle",
    "safety_pin", "broom", "basket", "roll_of_paper", "bucket",
    "soap", "toothbrush", "sponge", "squeeze_bottle", "thread", "yarn",
    "knot", "nazar_amulet",
  ],
  "Symbols": [
    "white_check_mark", "heavy_check_mark", "ballot_box_with_check", "x",
    "heavy_multiplication_x", "heavy_plus_sign", "heavy_minus_sign",
    "heavy_division_sign", "curly_loop", "loop", "question", "grey_question",
    "grey_exclamation", "exclamation", "bangbang", "interrobang", "warning",
    "no_entry", "stop_sign", "forbidden", "no_pedestrians", "no_bicycles",
    "no_smoking", "underage", "radioactive", "biohazard", "arrow_up",
    "arrow_down", "arrow_left", "arrow_right", "arrow_upper_right",
    "arrow_lower_right", "arrow_lower_left", "arrow_upper_left",
    "arrow_up_down", "left_right_arrow", "arrows_counterclockwise",
    "arrow_right_hook", "leftwards_arrow_with_hook", "arrow_heading_up",
    "arrow_heading_down", "twisted_rightwards_arrows", "repeat",
    "repeat_one", "arrows_clockwise", "fast_forward", "rewind",
    "fast_reverse_button", "fast_up_button", "fast_down_button",
    "next_track_button", "last_track_button", "end", "soon", "on",
    "top", "back", "new", "free", "up", "cool", "sos", "information_source",
    "abc", "ab", "cl", "atm", "sos", "parking", "vs", "u6307", "u6708",
    "recycle", "fleur_de_lis", "beginner", "trident", "eight_pointed_black_star",
    "sparkle", "copyright", "registered", "tm", "hash", "asterisk",
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "keycap_ten", "capital_abcd", "symbols", "sos",
    "red_circle", "orange_circle", "yellow_circle", "green_circle",
    "blue_circle", "purple_circle", "brown_circle", "black_circle", "white_circle",
    "red_square", "orange_square", "yellow_square", "green_square",
    "blue_square", "purple_square", "brown_square", "black_large_square",
    "white_large_square", "black_medium_square", "white_medium_square",
    "black_small_square", "white_small_square", "black_medium_small_square",
    "white_medium_small_square", "large_blue_diamond", "large_orange_diamond",
    "small_blue_diamond", "small_orange_diamond",
    "heart", "orange_heart", "yellow_heart", "green_heart", "blue_heart",
    "purple_heart", "brown_heart", "black_heart", "broken_heart",
    "two_hearts", "revolving_hearts", "heartbeat", "sparkling_heart",
    "heartpulse", "cupid", "gift_heart", "heart_decoration",
    "peace_symbol", "cross", "star_and_crescent", "star_of_david",
    "eight_spoked_asterisk", "white_flower", "dotted_six_pointed_star",
    "yin_yang", "wheel_of_dharma", "orthodox_cross",
  ],
};

// Emoji name to unicode mapping
export const EMOJI_MAP: Record<string, string> = {
  // Smileys & Emotion
  grinning: "😀", smiley: "😃", smile: "😄", grin: "😁", laughing: "😆",
  sweat_smile: "😅", rofl: "🤣", joy: "😂", slightly_smiling_face: "🙂",
  upside_down_face: "🙃", wink: "😉", blush: "😊", innocent: "😇",
  heart_eyes: "😍", kissing_heart: "😘", kissing: "😗", kissing_closed_eyes: "😚",
  kissing_smiling_eyes: "😙", yum: "😋", stuck_out_tongue: "😛",
  stuck_out_tongue_winking_eye: "😜", stuck_out_tongue_closed_eyes: "😝",
  money_mouth_face: "🤑", hugs: "🤗", thinking_face: "🤔",
  zipper_mouth_face: "🤐", raised_eyebrow: "🤨", neutral_face: "😐",
  expressionless: "😑", no_mouth: "😶", smirk: "😏", unamused: "😒",
  roll_eyes: "🙄", grimacing: "😬", lying_face: "🤥", relieved: "😌",
  pensive: "😔", sleepy: "😪", drooling_face: "🤤", sleeping: "😴",
  mask: "😷", face_with_thermometer: "🤒", face_with_head_bandage: "🤕",
  nauseated_face: "🤢", sneezing_face: "🤧", hot_face: "🥵", cold_face: "🥶",
  woozy_face: "🥴", dizzy_face: "😵", exploding_head: "🤯",
  cowboy_hat_face: "🤠", partying_face: "🥳", sunglasses: "😎",
  nerd_face: "🤓", monocle_face: "🧐", confused: "😕", worried: "😟",
  slightly_frowning_face: "🙁", frowning_face: "☹️", open_mouth: "😮",
  hushed: "😯", astonished: "😲", flushed: "😳", pleading_face: "🥺",
  anguished: "😧", fearful: "😨", cold_sweat: "😰",
  disappointed_relieved: "😥", cry: "😢", sob: "😭", scream: "😱",
  confounded: "😖", persevere: "😣", disappointed: "😞", sweat: "😓",
  weary: "😩", tired_face: "😫", yawning_face: "🥱", triumph: "😤",
  rage: "😡", angry: "😠", skull: "💀", skull_and_crossbones: "☠️",
  clown_face: "🤡", japanese_ogre: "👹", japanese_goblin: "👺",
  ghost: "👻", alien: "👽", space_invader: "👾", robot: "🤖",
  poop: "💩", thumbsup: "👍", thumbsdown: "👎", "+1": "👍", "-1": "👎",
  "100": "💯", fire: "🔥",
  // People & Hands
  wave: "👋", raised_back_of_hand: "🤚", raised_hand_with_fingers_splayed: "🖐️",
  hand: "✋", vulcan_salute: "🖖", ok_hand: "👌", crossed_fingers: "🤞",
  v: "✌️", metal: "🤘", call_me_hand: "🤙", point_left: "👈",
  point_right: "👉", point_up_2: "👆", point_down: "👇", point_up: "☝️",
  raised_hands: "🙌", clap: "👏", pray: "🙏", handshake: "🤝",
  writing_hand: "✍️", nail_care: "💅", selfie: "🤳", muscle: "💪",
  ear: "👂", nose: "👃", eyes: "👀", eye: "👁️", tongue: "👅",
  lips: "👄", brain: "🧠", footprints: "👣",
  bust_in_silhouette: "👤", busts_in_silhouette: "👥",
  speaking_head: "🗣️", adult: "🧑", older_adult: "🧓",
  baby: "👶", boy: "👦", girl: "👧", man: "👨", woman: "👩",
  older_man: "👴", older_woman: "👵", family: "👨‍👩‍👦",
  couple: "👫", two_men_holding_hands: "👬", two_women_holding_hands: "👭",
  couple_with_heart: "💑", couplekiss: "💏", bow: "🙇",
  person_frowning: "🙍", person_pouting: "🙎",
  person_gesturing_no: "🙅", person_gesturing_ok: "🙆",
  person_tipping_hand: "💁", person_raising_hand: "🙋",
  haircut: "💇", massage: "💆", bath: "🛀",
  sleeping_accommodation: "🛌", people_hugging: "🫂",
  pregnant_woman: "🤰", mrs_claus: "🤶",
  construction_worker: "👷", guard: "💂", cop: "👮", santa: "🎅", angel: "👼",
  detective: "🕵️", health_worker: "🧑‍⚕️", farmer: "🧑‍🌾",
  cook: "🧑‍🍳", student: "🧑‍🎓", singer: "🧑‍🎤", artist: "🧑‍🎨",
  teacher: "🧑‍🏫", factory_worker: "🧑‍🏭", technologist: "🧑‍💻",
  mechanic: "🧑‍🔧", scientist: "🧑‍🔬", pilot: "🧑‍✈️",
  astronaut: "🧑‍🚀", firefighter: "🧑‍🚒",
  superhero: "🦸", supervillain: "🦹", mage: "🧙", fairy: "🧚",
  vampire: "🧛", zombie: "🧟", genie: "🧞", merperson: "🧜", elf: "🧝",
  man_with_probing_cane: "🧑‍🦯", man_in_manual_wheelchair: "🧑‍🦽",
  man_in_motorized_wheelchair: "🧑‍🦼",
  standing_person: "🧍", kneeling_person: "🧎", person_fencing: "🤺",
  runner: "🏃", dancer: "💃", man_dancing: "🕺", walking: "🚶",
  snowboarder: "🏂", skier: "⛷️", surfer: "🏄", swimmer: "🏊",
  person_golfing: "🏌️", horseback_riding: "🏇", rowboat: "🚣",
  // Animals
  dog: "🐶", cat: "🐱", mouse: "🐭", hamster: "🐹", rabbit: "🐰",
  fox_face: "🦊", bear: "🐻", panda_face: "🐼", koala: "🐨", tiger: "🐯",
  lion: "🦁", cow: "🐮", pig: "🐷", pig_nose: "🐽", frog: "🐸",
  monkey_face: "🐵", see_no_evil: "🙈", hear_no_evil: "🙉",
  speak_no_evil: "🙊", monkey: "🐒", chicken: "🐔", penguin: "🐧",
  bird: "🐦", baby_chick: "🐤", hatching_chick: "🐣", hatched_chick: "🐥",
  duck: "🦆", eagle: "🦅", owl: "🦉", bat: "🦇", wolf: "🐺",
  boar: "🐗", horse: "🐴", unicorn: "🦄", bee: "🐝", bug: "🐛",
  butterfly: "🦋", snail: "🐌", shell: "🐚", ladybug: "🐞", ant: "🐜",
  mosquito: "🦟", cricket: "🦗", spider: "🕷️", spider_web: "🕸️",
  scorpion: "🦂", turtle: "🐢", snake: "🐍", lizard: "🦎",
  dragon_face: "🐲", dragon: "🐉", sauropod: "🦕", "t-rex": "🦖",
  whale: "🐳", whale2: "🐋", dolphin: "🐬", fish: "🐟",
  tropical_fish: "🐠", blowfish: "🐡", shark: "🦈", octopus: "🐙",
  crab: "🦀", lobster: "🦞", shrimp: "🦐", squid: "🦑", oyster: "🦪",
  deer: "🦌", giraffe: "🦒", zebra: "🦓", gorilla: "🦍",
  elephant: "🐘", rhino: "🦏", hippopotamus: "🦛", kangaroo: "🦘",
  badger: "🦡", turkey: "🦃", flamingo: "🦩", parrot: "🦜",
  sloth: "🦥", otter: "🦦", skunk: "🦨", mammoth: "🦣",
  feather: "🪶", cat2: "🐈", dog2: "🐕", poodle: "🐩",
  rabbit2: "🐇", chipmunk: "🐿️", hedgehog: "🦔", rat: "🐀",
  mouse2: "🐁", rooster: "🐓", ram: "🐏", goat: "🐐", sheep: "🐑",
  pig2: "🐖", ox: "🐂", water_buffalo: "🐃", cow2: "🐄", horse2: "🐎",
  racoon: "🦝",
  // Food & Drink
  apple: "🍎", green_apple: "🍏", pear: "🍐", tangerine: "🍊",
  lemon: "🍋", banana: "🍌", watermelon: "🍉", grapes: "🍇",
  strawberry: "🍓", melon: "🍈", cherries: "🍒", peach: "🍑",
  mango: "🥭", pineapple: "🍍", coconut: "🥥", kiwi_fruit: "🥝",
  tomato: "🍅", eggplant: "🍆", avocado: "🥑", broccoli: "🥦",
  leafy_green: "🥬", cucumber: "🥒", hot_pepper: "🌶️", corn: "🌽",
  carrot: "🥕", garlic: "🧄", onion: "🧅", potato: "🥔",
  sweet_potato: "🍠", croissant: "🥐", bagel: "🥯", bread: "🍞",
  baguette_bread: "🥖", pretzel: "🥨", cheese: "🧀", egg: "🥚",
  cooking: "🍳", pancakes: "🥞", waffle: "🧇", bacon: "🥓",
  cut_of_meat: "🥩", poultry_leg: "🍗", meat_on_bone: "🍖",
  hotdog: "🌭", hamburger: "🍔", fries: "🍟", pizza: "🍕",
  sandwich: "🥪", stuffed_flatbread: "🥙", salad: "🥗",
  shallow_pan_of_food: "🥘", spaghetti: "🍝", ramen: "🍜", stew: "🍲",
  curry: "🍛", sushi: "🍣", bento: "🍱", dumpling: "🥟",
  fried_shrimp: "🍤", rice_ball: "🍙", rice: "🍚",
  rice_cracker: "🍘", fish_cake: "🍥", fortune_cookie: "🥠",
  moon_cake: "🥮", oden: "🍢", dango: "🍡", shaved_ice: "🍧",
  ice_cream: "🍨", icecream: "🍦", pie: "🥧", cake: "🎂",
  cupcake: "🧁", shortcake: "🍰", candy: "🍬", lollipop: "🍭",
  chocolate_bar: "🍫", popcorn: "🍿", salt: "🧂", honey_pot: "🍯",
  coffee: "☕", tea: "🍵", milk_glass: "🥛", beverage_box: "🧃",
  cup_with_straw: "🥤", bubble_tea: "🧋",
  beer: "🍺", beers: "🍻", champagne: "🍾", wine_glass: "🍷",
  cocktail: "🍸", tropical_drink: "🍹", clinking_glasses: "🥂",
  tumbler_glass: "🥃", mate: "🧉", ice_cube: "🧊",
  chopsticks: "🥢", fork_and_knife_with_plate: "🍽️",
  fork_and_knife: "🍴", spoon: "🥄", knife: "🔪", bowl_with_spoon: "🥣",
  // Travel & Places
  car: "🚗", taxi: "🚕", bus: "🚌", trolleybus: "🚎", minibus: "🚐",
  ambulance: "🚑", fire_engine: "🚒", police_car: "🚓",
  oncoming_police_car: "🚔", racing_car: "🏎️", truck: "🚚",
  articulated_lorry: "🚛", tractor: "🚜", kick_scooter: "🛴",
  bike: "🚲", motor_scooter: "🛵", motorcycle: "🏍️",
  monorail: "🚝", mountain_railway: "🚞", steam_locomotive: "🚂",
  railway_car: "🚃", station: "🚉", bullettrain_side: "🚄",
  bullettrain_front: "🚅", train2: "🚆", train: "🚋", metro: "🚇",
  light_rail: "🚈", tram: "🚊", busstop: "🚏",
  vertical_traffic_light: "🚦", traffic_light: "🚥",
  construction: "🚧", anchor: "⚓", boat: "⛵", speedboat: "🚤",
  ship: "🚢", ferry: "⛴️", motor_boat: "🛥️", airplane: "✈️",
  small_airplane: "🛩️", seat: "💺", helicopter: "🚁",
  suspension_railway: "🚟", mountain_cableway: "🚠",
  aerial_tramway: "🚡", rocket: "🚀", flying_saucer: "🛸",
  parachute: "🪂", luggage: "🧳", tent: "⛺",
  earth_africa: "🌍", earth_americas: "🌎", earth_asia: "🌏",
  globe_with_meridians: "🌐", world_map: "🗺️", japan: "🗾",
  compass: "🧭", mountain_snow: "🏔️", mountain: "⛰️",
  volcano: "🌋", mount_fuji: "🗻", camping: "🏕️",
  beach_umbrella: "🏖️", desert: "🏜️", desert_island: "🏝️",
  national_park: "🏞️", stadium: "🏟️", classical_building: "🏛️",
  building_construction: "🏗️", houses: "🏘️",
  derelict_house: "🏚️", house: "🏠", house_with_garden: "🏡",
  office: "🏢", post_office: "🏣", european_post_office: "🏤",
  hospital: "🏥", bank: "🏦", hotel: "🏨",
  convenience_store: "🏪", school: "🏫", love_hotel: "🏩",
  wedding: "💒", european_castle: "🏰", japanese_castle: "🏯",
  city_sunrise: "🌇", city_sunset: "🌆", cityscape: "🏙️",
  night_with_stars: "🌃", bridge_at_night: "🌉", foggy: "🌁",
  sunrise_over_mountains: "🌄", sunrise: "🌅", milky_way: "🌌",
  stars: "🌟", sparkles: "✨", star: "⭐", star2: "🌟",
  dizzy: "💫", boom: "💥", collision: "💥", rainbow: "🌈",
  partly_sunny: "⛅", cloud: "☁️", snowflake: "❄️",
  snowman: "⛄", snowman_with_snow: "☃️", zap: "⚡",
  droplet: "💧", ocean: "🌊", sunny: "☀️",
  full_moon: "🌕", crescent_moon: "🌙",
  // Objects
  eyeglasses: "👓", dark_sunglasses: "🕶️", goggles: "🥽",
  lab_coat: "🥼", safety_vest: "🦺", necktie: "👔", shirt: "👕",
  jeans: "👖", scarf: "🧣", gloves: "🧤", coat: "🧥", socks: "🧦",
  dress: "👗", kimono: "👘", sari: "🥻", shorts: "🩳",
  bikini: "👙", womans_clothes: "👚", purse: "👛", handbag: "👜",
  pouch: "👝", shopping: "🛍️", school_satchel: "🎒",
  mans_shoe: "👞", athletic_shoe: "👟", hiking_boot: "🥾",
  flat_shoe: "🥿", high_heel: "👠", sandal: "👡",
  ballet_shoes: "🩰", boot: "👢", crown: "👑", womans_hat: "👒",
  tophat: "🎩", mortar_board: "🎓", billed_cap: "🧢",
  prayer_beads: "📿", lipstick: "💄", ring: "💍", gem: "💎",
  mute: "🔇", loudspeaker: "📢", mega: "📣", postal_horn: "📯",
  bell: "🔔", no_bell: "🔕", musical_score: "🎼",
  musical_note: "🎵", notes: "🎶", microphone: "🎤",
  headphones: "🎧", radio: "📻", saxophone: "🎷",
  accordion: "🪗", guitar: "🎸", musical_keyboard: "🎹",
  trumpet: "🎺", violin: "🎻", banjo: "🪕", drum: "🥁",
  iphone: "📱", calling: "📲", phone: "📞",
  telephone_receiver: "📟", pager: "📟", fax: "📠",
  battery: "🔋", electric_plug: "🔌", computer: "💻",
  desktop_computer: "🖥️", printer: "🖨️", keyboard: "⌨️",
  computer_mouse: "🖱️", trackball: "🖲️", minidisc: "💽",
  floppy_disk: "💾", cd: "💿", dvd: "📀", abacus: "🧮",
  movie_camera: "🎥", film_frames: "🎞️", film_projector: "📽️",
  clapper: "🎬", tv: "📺", camera: "📷", camera_flash: "📸",
  video_camera: "📹", vhs: "📼", mag: "🔍", mag_right: "🔎",
  candle: "🕯️", bulb: "💡", flashlight: "🔦",
  izakaya_lantern: "🏮", diya_lamp: "🪔",
  notebook_with_decorative_cover: "📔", closed_book: "📕",
  books: "📚", open_book: "📖", green_book: "📗",
  blue_book: "📘", orange_book: "📙", notebook: "📓",
  ledger: "📒", card_index: "📇", chart_with_upwards_trend: "📈",
  chart_with_downwards_trend: "📉", bar_chart: "📊",
  spiral_notepad: "🗒️", calendar: "📅", date: "📅",
  card_index_dividers: "🗂️", file_cabinet: "🗄️",
  wastebasket: "🗑️", card_file_box: "🗃️",
  ballot_box_with_ballot: "🗳️", file_folder: "📁",
  open_file_folder: "📂", scissors: "✂️", paperclip: "📎",
  paperclips: "🖇️", straight_ruler: "📏",
  triangular_ruler: "📐", pushpin: "📌", round_pushpin: "📍",
  hammer: "🔨", axe: "🪓", pick: "⛏️", hammer_and_pick: "⚒️",
  hammer_and_wrench: "🛠️", dagger: "🗡️", sword: "⚔️",
  gun: "🔫", bow_and_arrow: "🏹", shield: "🛡️", wrench: "🔧",
  nut_and_bolt: "🔩", gear: "⚙️", clamp: "🗜️", link: "🔗",
  chains: "⛓️", hook: "🪝", toolbox: "🧰", magnet: "🧲",
  ladder: "🪜", alembic: "⚗️", test_tube: "🧪",
  petri_dish: "🧫", microscope: "🔬", telescope: "🔭",
  satellite: "📡", syringe: "💉", drop_of_blood: "🩸",
  pill: "💊", adhesive_bandage: "🩹", stethoscope: "🩺",
  door: "🚪", elevator: "🛗", mirror: "🪞", window: "🪟",
  couch_and_lamp: "🛋️", chair: "🪑", toilet: "🚽",
  plunger: "🪠", shower: "🚿", bathtub: "🛁", razor: "🪒",
  lotion_bottle: "🧴", safety_pin: "🧷", broom: "🧹",
  basket: "🧺", roll_of_paper: "🧻", bucket: "🪣",
  soap: "🧼", toothbrush: "🪥", sponge: "🧽",
  squeeze_bottle: "🧴", thread: "🧵", yarn: "🧶",
  knot: "🪢", nazar_amulet: "🧿",
  // Symbols
  white_check_mark: "✅", heavy_check_mark: "✔️",
  ballot_box_with_check: "☑️", x: "❌",
  heavy_multiplication_x: "✖️", heavy_plus_sign: "➕",
  heavy_minus_sign: "➖", heavy_division_sign: "➗",
  curly_loop: "➰", loop: "➿", question: "❓",
  grey_question: "❔", grey_exclamation: "❕",
  exclamation: "❗", bangbang: "‼️", interrobang: "⁉️",
  warning: "⚠️", no_entry: "⛔", stop_sign: "🛑",
  forbidden: "🚫", no_pedestrians: "🚷", no_bicycles: "🚳",
  no_smoking: "🚭", underage: "🔞", radioactive: "☢️",
  biohazard: "☣️", arrow_up: "⬆️", arrow_down: "⬇️",
  arrow_left: "⬅️", arrow_right: "➡️",
  arrow_upper_right: "↗️", arrow_lower_right: "↘️",
  arrow_lower_left: "↙️", arrow_upper_left: "↖️",
  arrow_up_down: "↕️", left_right_arrow: "↔️",
  arrows_counterclockwise: "🔄", arrow_right_hook: "↪️",
  leftwards_arrow_with_hook: "↩️", arrow_heading_up: "⤴️",
  arrow_heading_down: "⤵️", twisted_rightwards_arrows: "🔀",
  repeat: "🔁", repeat_one: "🔂", arrows_clockwise: "🔃",
  fast_forward: "⏩", rewind: "⏪", fast_reverse_button: "⏪",
  fast_up_button: "⏫", fast_down_button: "⏬",
  next_track_button: "⏭️", last_track_button: "⏮️",
  end: "🔚", soon: "🔜", on: "🔛", top: "🔝", back: "🔙",
  new: "🆕", free: "🆓", up: "🆙", cool: "🆒", sos: "🆘",
  information_source: "ℹ️", abc: "🔤", ab: "🆎", cl: "🆑",
  atm: "🏧", parking: "🅿️", vs: "🆚", recycle: "♻️",
  fleur_de_lis: "⚜️", beginner: "🔰", trident: "🔱",
  eight_pointed_black_star: "✴️", sparkle: "❇️",
  copyright: "©️", registered: "®️", tm: "™️",
  hash: "#️⃣", asterisk: "*️⃣",
  zero: "0️⃣", one: "1️⃣", two: "2️⃣", three: "3️⃣",
  four: "4️⃣", five: "5️⃣", six: "6️⃣", seven: "7️⃣",
  eight: "8️⃣", nine: "9️⃣", keycap_ten: "🔟",
  capital_abcd: "🔠", symbols: "🔣",
  red_circle: "🔴", orange_circle: "🟠", yellow_circle: "🟡",
  green_circle: "🟢", blue_circle: "🔵", purple_circle: "🟣",
  brown_circle: "🟤", black_circle: "⚫", white_circle: "⚪",
  red_square: "🟥", orange_square: "🟧", yellow_square: "🟨",
  green_square: "🟩", blue_square: "🟦", purple_square: "🟪",
  brown_square: "🟫", black_large_square: "⬛",
  white_large_square: "⬜", black_medium_square: "◼️",
  white_medium_square: "◻️", black_small_square: "▪️",
  white_small_square: "▫️", black_medium_small_square: "◾",
  white_medium_small_square: "◽", large_blue_diamond: "🔷",
  large_orange_diamond: "🔶", small_blue_diamond: "🔹",
  small_orange_diamond: "🔸",
  heart: "❤️", orange_heart: "🧡", yellow_heart: "💛",
  green_heart: "💚", blue_heart: "💙", purple_heart: "💜",
  brown_heart: "🤎", black_heart: "🖤", broken_heart: "💔",
  two_hearts: "💕", revolving_hearts: "💞", heartbeat: "💓",
  sparkling_heart: "💖", heartpulse: "💗", cupid: "💘",
  gift_heart: "💝", heart_decoration: "💟",
  peace_symbol: "☮️", cross: "✝️", star_and_crescent: "☪️",
  star_of_david: "✡️", eight_spoked_asterisk: "✳️",
  white_flower: "💮", yin_yang: "☯️",
  wheel_of_dharma: "☸️", orthodox_cross: "☦️",
  tada: "🎉", infinity: "♾️",
  // Misc
  email: "📧", clock: "🕐", hourglass: "⌛", lock: "🔒",
  unlock: "🔓", key: "🔑", label: "🏷️", bookmark: "🔖",
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

const CAT_ICONS: Record<string, string> = {
  "Smileys": "😀",
  "People": "👋",
  "Animals": "🐶",
  "Food": "🍕",
  "Travel": "✈️",
  "Objects": "💡",
  "Symbols": "❤️",
};

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
              title={cat}
            >
              {CAT_ICONS[cat] ?? cat.charAt(0)}
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
        {filteredStandard.filter((name) => name in EMOJI_MAP).map((name) => (
          <button key={name} className="emoji-btn" onClick={() => onSelect(name)} title={`:${name}:`}>
            {EMOJI_MAP[name]}
          </button>
        ))}
        {(isCustomTab || search) && filteredCustom.map((e) => (
          <CustomEmojiBtn key={e.id} id={e.id} name={e.name} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
