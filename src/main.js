const backgroundImageUrl = new URL(
  "./assets/LobbyBackground.png",
  import.meta.url
).href;

const supportsImportMetaGlob =
  typeof import.meta !== "undefined" && typeof import.meta.glob === "function";

function tryCreateAssetManifest() {
  if (!supportsImportMetaGlob) {
    return null;
  }

  try {
    return import.meta.glob("./assets/*.{png,PNG}", {
      eager: true,
      import: "default"
    });
  } catch (error) {
    console.warn(
      "import.meta.glob is unavailable in this environment. Falling back to dynamic loading.",
      error
    );
    return null;
  }
}

const assetManifest = tryCreateAssetManifest();

const audioManifest = supportsImportMetaGlob
  ? import.meta.glob("./assets/audio/*.{wav,mp3,ogg}", {
      eager: true,
      import: "default"
    })
  : null;

const baseCanvasWidth = 960;
const baseCanvasHeight = 540;

function createFrameScheduler(callback) {
  let handle = null;
  let latestArgs = null;

  const run = () => {
    handle = null;
    const args = latestArgs ?? [];
    latestArgs = null;
    callback(...args);
  };

  return (...args) => {
    latestArgs = args;
    if (handle !== null) {
      return;
    }

    if (typeof window !== "undefined") {
      if (typeof window.requestAnimationFrame === "function") {
        handle = window.requestAnimationFrame(run);
        return;
      }
      handle = window.setTimeout(run, 16);
      return;
    }

    callback(...args);
  };
}

function createEmptySprite() {
  return {
    image: null,
    isReady: () => false
  };
}

function createSpriteState(assetPath) {
  const image = new Image();
  let ready = false;
  let warned = false;

  const markReady = () => {
    ready = true;
  };
  const handleError = () => {
    ready = false;
    if (!warned) {
      console.warn(
        `Failed to load sprite asset at ${assetPath}. Falling back to canvas drawing.`
      );
      warned = true;
    }
  };

  image.addEventListener("load", markReady);
  image.addEventListener("error", handleError);

  return {
    image,
    markReady,
    handleError,
    setSource(source) {
      if (!source) {
        handleError();
        return;
      }

      image.src = source;
      if (image.complete && image.naturalWidth > 0) {
        markReady();
      }
    },
    isReady: () => ready
  };
}

function createOptionalSprite(assetPath) {
  if (assetManifest) {
    const source = assetManifest[assetPath];
    if (!source) {
      return createEmptySprite();
    }

    const spriteState = createSpriteState(assetPath);
    spriteState.setSource(source);
    return {
      image: spriteState.image,
      isReady: spriteState.isReady
    };
  }

  return createOptionalSpriteWithoutManifest(assetPath);
}

function createOptionalSpriteWithoutManifest(assetPath) {
  let resolvedUrl;
  try {
    resolvedUrl = new URL(assetPath, import.meta.url).href;
  } catch (error) {
    console.warn(`Failed to resolve sprite asset at ${assetPath}`, error);
    return createEmptySprite();
  }

  const spriteState = createSpriteState(assetPath);

  spriteState.setSource(resolvedUrl);

  return {
    image: spriteState.image,
    isReady: spriteState.isReady
  };
}

function createSilentAudioHandle() {
  return {
    play() {},
    stop() {},
    setVolume() {},
    isReady: () => false,
    element: null
  };
}

function resolveAudioSource(assetPath) {
  if (audioManifest) {
    return audioManifest[assetPath] ?? null;
  }

  try {
    return new URL(assetPath, import.meta.url).href;
  } catch (error) {
    console.warn(`Failed to resolve audio asset at ${assetPath}`, error);
    return null;
  }
}

function createOptionalAudio(assetPath, options = {}) {
  const settings = {
    loop: false,
    volume: 1,
    playbackRate: 1,
    ...options
  };

  if (typeof Audio === "undefined") {
    return createSilentAudioHandle();
  }

  const element = new Audio();
  let warned = false;
  let ready = false;

  const source = resolveAudioSource(assetPath);
  if (!source) {
    console.info(
      `Audio asset missing for ${assetPath}. Place the file in src/assets/audio or update the sound mapping if you want this sound.`
    );
    warned = true;
    return createSilentAudioHandle();
  }

  element.loop = Boolean(settings.loop);
  element.volume = Math.min(Math.max(settings.volume ?? 1, 0), 1);
  element.playbackRate = settings.playbackRate ?? 1;

  const markReady = () => {
    ready = true;
  };
  const handleError = () => {
    ready = false;
    if (!warned) {
      console.warn(
        `Failed to load audio asset at ${assetPath}. Add the matching file in src/assets/audio to enable this sound.`
      );
      warned = true;
    }
  };

  element.addEventListener("canplaythrough", markReady, { once: true });
  element.addEventListener("error", handleError);

  element.src = source;
  if (element.readyState >= 2) {
    markReady();
  }

  const play = ({ restart = true } = {}) => {
    if (!ready && element.readyState < 2) {
      // Allow the browser to finish buffering; playback will begin once ready.
    }

    if (restart) {
      try {
        element.currentTime = 0;
      } catch (error) {
        // Some browsers may throw if the media has not started loading yet.
      }
    }

    const attempt = element.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        /* Autoplay restrictions can reject the promise. */
      });
    }
  };

  const stop = () => {
    element.pause();
    try {
      element.currentTime = 0;
    } catch (error) {
      // Ignore errors while resetting the playback position.
    }
  };

  return {
    play,
    stop,
    setVolume(value) {
      element.volume = Math.min(Math.max(value, 0), 1);
    },
    isReady: () => ready,
    element
  };
}

function createAudioManager() {
  const soundMap = {
    // Drop .wav (or .mp3/.ogg) files into src/assets/audio using these paths
    // or update the mapping below to match your filenames.
    background: { path: "./assets/audio/background.wav", loop: true, volume: 0.48 },
    jump: { path: "./assets/audio/jump.wav", volume: 0.55 },
    crystal: { path: "./assets/audio/crystal.wav", volume: 0.62 },
    chestOpen: { path: "./assets/audio/chest.wav", volume: 0.6 },
    fountain: { path: "./assets/audio/fountain.wav", volume: 0.6 },
    dialogue: { path: "./assets/audio/dialogue.wav", volume: 0.45 },
    portalCharge: { path: "./assets/audio/portal-charge.wav", volume: 0.65 },
    portalActivate: { path: "./assets/audio/portal-activate.wav", volume: 0.7 },
    portalComplete: { path: "./assets/audio/portal-complete.wav", volume: 0.7 },
    levelUp: { path: "./assets/audio/level-up.wav", volume: 0.68 }
  };

  const loadedSounds = new Map();
  const audioSupported = typeof Audio !== "undefined";
  let unlocked = !audioSupported;
  let pendingBackground = false;
  const unlockListeners = new Set();

  const ensureSound = (key) => {
    if (loadedSounds.has(key)) {
      return loadedSounds.get(key);
    }
    const config = soundMap[key];
    if (!config) {
      return null;
    }
    const handle = createOptionalAudio(config.path, config);
    loadedSounds.set(key, handle);
    return handle;
  };

  const notifyUnlock = () => {
    for (const listener of unlockListeners) {
      try {
        listener();
      } catch (error) {
        console.error("Audio unlock listener failed", error);
      }
    }
  };

  const playBackground = ({ restart = false } = {}) => {
    if (!unlocked) {
      pendingBackground = true;
      ensureSound("background");
      return;
    }

    const music = ensureSound("background");
    if (!music) {
      return;
    }

    music.play({ restart });
  };

  const handleUserGesture = () => {
    if (unlocked) {
      return;
    }
    unlocked = true;
    notifyUnlock();
    if (pendingBackground) {
      pendingBackground = false;
      const music = ensureSound("background");
      if (music) {
        music.play({ restart: false });
      }
    }
  };

  const playEffect = (key) => {
    if (!unlocked && key !== "background") {
      return;
    }
    const effect = ensureSound(key);
    if (!effect) {
      return;
    }
    effect.play();
  };

  const stopBackground = () => {
    const music = ensureSound("background");
    if (!music) {
      return;
    }
    music.stop();
  };

  return {
    playBackground,
    playEffect,
    stopBackground,
    handleUserGesture,
    mappings: soundMap,
    onUnlock(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      unlockListeners.add(listener);
      if (unlocked) {
        listener();
      }
      return () => {
        unlockListeners.delete(listener);
      };
    },
    isUnlocked: () => unlocked
  };
}

// Drop replacement PNG files into src/assets with these names to override
// the procedural drawings for each element.
const chestSprite = createOptionalSprite("./assets/ChestSprite.png");
const fountainSprite = createOptionalSprite("./assets/FountainSprite.png");
const guideSprite = createOptionalSprite("./assets/GuideSprite.png");
const crystalSprite = createOptionalSprite("./assets/CrystalSprite.png");
const platformSprite = createOptionalSprite("./assets/PlatformSprite.png");
const mascotSprite = createOptionalSprite("./assets/MascotSprite.png");

const app = document.querySelector("#app");
if (!app) {
  throw new Error("Missing #app container");
}

const audio = createAudioManager();
audio.playBackground();

const backgroundImage = new Image();
const backgroundSource = backgroundImageUrl;
let backgroundReady = false;
const markBackgroundReady = () => {
  backgroundReady = true;
};
const handleBackgroundError = () => {
  backgroundReady = false;
  console.warn(
    "Background image failed to load. The gradient fallback will be used instead."
  );
};
backgroundImage.addEventListener("load", markBackgroundReady);
backgroundImage.addEventListener("error", handleBackgroundError);
backgroundImage.src = backgroundSource;
if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
  markBackgroundReady();
}

function createStarterSpriteDataUrl({
  background,
  body,
  accent,
  accessory,
  eye,
  highlight
}) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${highlight}" stop-opacity="0.55" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="160" height="160" rx="28" fill="${background}" />
      <path d="M48 60 L64 22 L84 58" fill="${body}" stroke="${accent}" stroke-width="6" stroke-linejoin="round" />
      <path d="M112 58 L128 22 L144 60" fill="${body}" stroke="${accent}" stroke-width="6" stroke-linejoin="round" />
      <circle cx="96" cy="96" r="52" fill="${body}" stroke="${accent}" stroke-width="6" />
      <ellipse cx="74" cy="94" rx="11" ry="15" fill="${eye}" opacity="0.9" />
      <ellipse cx="118" cy="94" rx="11" ry="15" fill="${eye}" opacity="0.9" />
      <circle cx="74" cy="96" r="3" fill="#ffffff" opacity="0.8" />
      <circle cx="118" cy="96" r="3" fill="#ffffff" opacity="0.8" />
      <circle cx="96" cy="112" r="12" fill="${accessory}" stroke="${accent}" stroke-width="4" />
      <path d="M82 118 Q96 130 110 118" fill="none" stroke="${accessory}" stroke-width="5" stroke-linecap="round" />
      <circle cx="96" cy="106" r="5" fill="${accent}" />
      <path d="M70 80 Q96 94 122 80" fill="url(#glow)" opacity="0.85" />
      <path d="M88 118 Q88 128 78 132" stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none" />
      <path d="M104 118 Q104 128 114 132" stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none" />
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function resolveStarterImageSource(assetPaths, fallbackPalette) {
  const candidatePaths = Array.isArray(assetPaths) ? assetPaths : [assetPaths];

  for (const candidate of candidatePaths) {
    if (assetManifest && assetManifest[candidate]) {
      return assetManifest[candidate];
    }

    try {
      return new URL(candidate, import.meta.url).href;
    } catch (error) {
      console.warn(
        `Failed to resolve starter sprite asset at ${candidate}. Continuing to next candidate.`,
        error
      );
    }
  }

  return createStarterSpriteDataUrl(fallbackPalette);
}

function resolveStarterSpriteSource(assetPaths, fallbackPalette) {
  return resolveStarterImageSource(assetPaths, fallbackPalette);
}

const starterCharacterDefinitions = [
  {
    id: "comet-cadet",
    name: "Comet Cadet",
    tagline: "A swift navigator blazing across the cosmos.",
    description: "Excels at traversal with boosted dash energy.",
    imageAssets: "./assets/character1.png",
    spriteAssets: [
      "./assets/playersprite1.png",
      "./assets/PlayerSprite.png",
      "./assets/character1.png"
    ],
    palette: {
      background: "#1f2557",
      body: "#fcbf49",
      accent: "#f77f00",
      accessory: "#ff477e",
      eye: "#1b1d3a",
      highlight: "#ffd166"
    }
  },
  {
    id: "nebula-sage",
    name: "Nebula Sage",
    tagline: "A mystic tactician attuned to stardust currents.",
    description: "Starts with enhanced insight for puzzle solving.",
    imageAssets: ["./assets/characrter2.png", "./assets/character2.png"],
    spriteAssets: [
      "./assets/playersprite2.png",
      "./assets/character2.png",
      "./assets/characrter2.png"
    ],
    palette: {
      background: "#31163f",
      body: "#c084fc",
      accent: "#a855f7",
      accessory: "#38bdf8",
      eye: "#120d1f",
      highlight: "#f472b6"
    }
  },
  {
    id: "aurora-engineer",
    name: "Aurora Engineer",
    tagline: "An inventive builder forging gadgets from nebula light.",
    description: "Unlocks crafting recipes and supportive drones early.",
    imageAssets: "./assets/character3.png",
    spriteAssets: [
      "./assets/playersprite3.png",
      "./assets/character3.png"
    ],
    palette: {
      background: "#0f2f32",
      body: "#5eead4",
      accent: "#22d3ee",
      accessory: "#facc15",
      eye: "#052e16",
      highlight: "#a7f3d0"
    }
  }
];

const starterCharacters = starterCharacterDefinitions.map((definition) => ({
  id: definition.id,
  name: definition.name,
  tagline: definition.tagline,
  description: definition.description,
  image: resolveStarterImageSource(definition.imageAssets, definition.palette),
  sprite: resolveStarterSpriteSource(
    definition.spriteAssets ?? definition.imageAssets,
    definition.palette
  )
}));

const accountStorageKey = "astrocat-account";
const callSignRegistryKey = "astrocat-call-signs";
const messageBoardStorageKey = "astrocat-message-boards";
const callSignLength = 5;

function getLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function isValidCallSign(value) {
  return typeof value === "string" && new RegExp(`^\\d{${callSignLength}}$`).test(value);
}

function loadCallSignRegistry() {
  const storage = getLocalStorage();
  if (!storage) {
    return new Set();
  }

  try {
    const raw = storage.getItem(callSignRegistryKey);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter(isValidCallSign));
  } catch (error) {
    console.warn("Failed to read call sign registry", error);
    return new Set();
  }
}

function saveCallSignRegistry(registry) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(callSignRegistryKey, JSON.stringify([...registry]));
    return true;
  } catch (error) {
    console.warn("Failed to persist call sign registry", error);
    return false;
  }
}

function generateCallSignCandidate(preferred) {
  const registry = loadCallSignRegistry();
  if (isValidCallSign(preferred)) {
    return preferred;
  }

  const maxAttempts = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = String(Math.floor(Math.random() * 90000) + 10000);
    if (!registry.has(candidate)) {
      return candidate;
    }
  }

  // Fall back to a random call sign even if a collision might occur.
  return String(Math.floor(Math.random() * 90000) + 10000);
}

function registerCallSign(callSign) {
  if (!isValidCallSign(callSign)) {
    return;
  }

  const registry = loadCallSignRegistry();
  if (registry.has(callSign)) {
    return;
  }

  registry.add(callSign);
  saveCallSignRegistry(registry);
}

function sanitizeMessageContent(content) {
  if (typeof content !== "string") {
    return "";
  }

  return content.replace(/\s+/g, " ").trim().slice(0, 240);
}

function sanitizeMessageEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const content = sanitizeMessageContent(entry.content ?? "");
  if (!content) {
    return null;
  }

  const senderCallSign = isValidCallSign(entry.senderCallSign) ? entry.senderCallSign : null;
  const senderName = typeof entry.senderName === "string"
    ? entry.senderName.trim().slice(0, 40)
    : "";
  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();

  return {
    senderCallSign,
    senderName,
    content,
    timestamp
  };
}

function loadMessageBoards() {
  const storage = getLocalStorage();
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(messageBoardStorageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const boards = {};
    for (const [callSign, entries] of Object.entries(parsed)) {
      if (!isValidCallSign(callSign) || !Array.isArray(entries)) {
        continue;
      }

      const sanitizedEntries = entries
        .map((entry) => sanitizeMessageEntry(entry))
        .filter((entry) => entry !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

      boards[callSign] = sanitizedEntries;
    }

    return boards;
  } catch (error) {
    console.warn("Failed to read message boards", error);
    return {};
  }
}

function saveMessageBoards(boards) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(messageBoardStorageKey, JSON.stringify(boards));
    return true;
  } catch (error) {
    console.warn("Failed to persist message boards", error);
    return false;
  }
}

function getMessagesForCallSign(callSign) {
  if (!isValidCallSign(callSign)) {
    return [];
  }

  const boards = loadMessageBoards();
  const entries = boards[callSign];
  if (!entries || !Array.isArray(entries)) {
    return [];
  }

  return [...entries];
}

function appendMessageToBoard(callSign, message) {
  if (!isValidCallSign(callSign)) {
    return null;
  }

  const sanitizedEntry = sanitizeMessageEntry(message);
  if (!sanitizedEntry) {
    return null;
  }

  const boards = loadMessageBoards();
  const entries = Array.isArray(boards[callSign]) ? [...boards[callSign]] : [];
  entries.push(sanitizedEntry);
  const maxEntries = 50;
  boards[callSign] = entries.slice(-maxEntries);
  if (!saveMessageBoards(boards)) {
    return null;
  }

  return sanitizedEntry;
}

function sanitizeAccount(source = {}) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const rawName = typeof source.catName === "string" ? source.catName.trim() : "";
  const name = rawName.replace(/\s+/g, " ").slice(0, 28);
  const starterId =
    typeof source.starterId === "string" && source.starterId
      ? source.starterId
      : starterCharacters[0].id;

  if (!name) {
    return null;
  }

  let preferredCallSign = null;
  if (isValidCallSign(source.callSign)) {
    preferredCallSign = source.callSign;
  } else if (typeof source.handle === "string") {
    const digits = source.handle.replace(/^@+/, "");
    if (isValidCallSign(digits)) {
      preferredCallSign = digits;
    }
  }

  const callSign = generateCallSignCandidate(preferredCallSign);
  const handle = `@${callSign}`;

  return {
    handle,
    callSign,
    catName: name,
    starterId
  };
}

function loadStoredAccount() {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(accountStorageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const sanitized = sanitizeAccount(parsed);
    if (!sanitized) {
      return null;
    }

    const needsMigration =
      !parsed ||
      parsed.callSign !== sanitized.callSign ||
      parsed.handle !== sanitized.handle;

    if (needsMigration) {
      saveAccount(sanitized);
    } else {
      registerCallSign(sanitized.callSign);
    }

    return sanitized;
  } catch (error) {
    console.warn("Failed to read stored account information", error);
    return null;
  }
}

function saveAccount(account) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  const sanitized = sanitizeAccount(account);
  if (!sanitized) {
    return false;
  }

  try {
    storage.setItem(accountStorageKey, JSON.stringify(sanitized));
    registerCallSign(sanitized.callSign);
    return true;
  } catch (error) {
    console.warn("Failed to persist account details", error);
    return false;
  }
}

function clearStoredAccount() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(accountStorageKey);
  } catch (error) {
    console.warn("Failed to clear stored account information", error);
  }
}

function findStarterCharacter(starterId) {
  return (
    starterCharacters.find((character) => character.id === starterId) ?? starterCharacters[0]
  );
}

let activeAccount = loadStoredAccount();
const fallbackAccount = {
  handle: "",
  callSign: "",
  catName: "PixelHero",
  starterId: starterCharacters[0].id
};

const appearanceStorageKey = "astrocat-appearance";
const appearancePresets = [
  {
    label: "Starbound Scout",
    hair: "#8b5a2b",
    skin: "#ffb6c1",
    shirt: "#4b6cff"
  },
  {
    label: "Nebula Nomad",
    hair: "#1f1b2e",
    skin: "#f6d1b1",
    shirt: "#f06292"
  },
  {
    label: "Solar Sailor",
    hair: "#d89c59",
    skin: "#d7a98c",
    shirt: "#3ddad7"
  },
  {
    label: "Lunar Pathfinder",
    hair: "#6a4c93",
    skin: "#bfa0d4",
    shirt: "#8bc34a"
  }
];

const appearanceOptions = {
  hair: Array.from(new Set(appearancePresets.map((preset) => preset.hair))),
  skin: Array.from(new Set(appearancePresets.map((preset) => preset.skin))),
  shirt: Array.from(new Set(appearancePresets.map((preset) => preset.shirt)))
};

function sanitizeAppearance(source = {}) {
  return {
    hair: source.hair ?? appearancePresets[0].hair,
    skin: source.skin ?? appearancePresets[0].skin,
    shirt: source.shirt ?? appearancePresets[0].shirt
  };
}

const defaultAppearance = sanitizeAppearance(appearancePresets[0]);

function findPresetIndex(appearance) {
  return appearancePresets.findIndex(
    (preset) =>
      preset.hair === appearance.hair &&
      preset.skin === appearance.skin &&
      preset.shirt === appearance.shirt
  );
}

function loadStoredAppearance() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(appearanceStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to load stored appearance", error);
    return null;
  }
}

function saveAppearance(appearance, presetIndex) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const payload = JSON.stringify({
      appearance: sanitizeAppearance(appearance),
      presetIndex
    });
    window.localStorage.setItem(appearanceStorageKey, payload);
  } catch (error) {
    console.warn("Failed to persist appearance selection", error);
  }
}

const storedAppearance = loadStoredAppearance();
const playerAppearance = sanitizeAppearance({
  ...defaultAppearance,
  ...(storedAppearance?.appearance ?? storedAppearance ?? {})
});

let currentAppearancePresetIndex = storedAppearance?.presetIndex;
if (typeof currentAppearancePresetIndex !== "number") {
  currentAppearancePresetIndex = findPresetIndex(playerAppearance);
}
if (currentAppearancePresetIndex === -1) {
  // Custom palette stored previously; keep colors but do not snap to preset.
  currentAppearancePresetIndex = -1;
} else if (
  currentAppearancePresetIndex < 0 ||
  currentAppearancePresetIndex >= appearancePresets.length
) {
  currentAppearancePresetIndex = findPresetIndex(playerAppearance);
}
if (currentAppearancePresetIndex < -1) {
  currentAppearancePresetIndex = -1;
}
if (currentAppearancePresetIndex === undefined || currentAppearancePresetIndex === null) {
  currentAppearancePresetIndex = findPresetIndex(playerAppearance);
}
if (currentAppearancePresetIndex === undefined || currentAppearancePresetIndex === null) {
  currentAppearancePresetIndex = 0;
}

const rankThresholds = [
  { level: 1, title: "Recruit" },
  { level: 3, title: "Astrocat Cadet" },
  { level: 5, title: "Star Voyager" },
  { level: 8, title: "Cosmic Trailblazer" }
];

const portalRequiredLevel = 3;

const playerStats = {
  name: activeAccount?.catName ?? fallbackAccount.catName,
  handle: activeAccount?.handle ?? fallbackAccount.handle,
  callSign: activeAccount?.callSign ?? fallbackAccount.callSign,
  starterId: activeAccount?.starterId ?? fallbackAccount.starterId,
  level: 1,
  rank: rankThresholds[0].title,
  exp: 0,
  maxExp: 120,
  hp: 85,
  maxHp: 100,
  mp: 40,
  maxMp: 60
};

const defaultMessage =
  "Check the Recruit Missions panel for onboarding tasks. Use A/D or ←/→ to move. Press Space to jump.";
let messageTimerId = 0;

function updateRankFromLevel() {
  let resolvedTitle = rankThresholds[0].title;
  for (const threshold of rankThresholds) {
    if (playerStats.level >= threshold.level) {
      resolvedTitle = threshold.title;
    } else {
      break;
    }
  }
  playerStats.rank = resolvedTitle;
}

updateRankFromLevel();

const ui = createInterface(playerStats, playerAppearance, {
  onRequestLogin: requestAccountLogin,
  onRequestLogout: handleLogout,
  portalLevelRequirement: portalRequiredLevel
});
app.innerHTML = "";
app.append(ui.root);

const initialStarter = findStarterCharacter(playerStats.starterId);
ui.setAccount(activeAccount, initialStarter);
ui.addFeedMessage({
  author: "Mission Command",
  channel: "mission",
  text: "Mission Control is standing by for your first objective.",
  timestamp: Date.now() - 1000 * 60 * 18
});
ui.addFeedMessage({
  author: "@StarryScout",
  channel: "friend",
  text: "Save me a seat by the portal lounge!",
  timestamp: Date.now() - 1000 * 60 * 11
});
ui.addFeedMessage({
  author: "@NebulaNeko",
  channel: "friend",
  text: "Just dropped fresh intel in the bulletin board. Check it out!",
  timestamp: Date.now() - 1000 * 60 * 5
});

let onboardingInstance = null;
let previousBodyOverflow = "";

if (!activeAccount) {
  requestAccountLogin();
}

function requestAccountLogin() {
  const initialAccount = activeAccount
    ? { ...activeAccount }
    : { starterId: playerStats.starterId };
  openOnboarding(initialAccount);
}

function handleLogout() {
  closeOnboarding();
  activeAccount = null;
  clearStoredAccount();
  playerStats.name = fallbackAccount.catName;
  playerStats.handle = fallbackAccount.handle;
  playerStats.callSign = fallbackAccount.callSign;
  playerStats.starterId = fallbackAccount.starterId;
  setPlayerSpriteFromStarter(playerStats.starterId);
  const starter = findStarterCharacter(playerStats.starterId);
  ui.setAccount(null, starter);
  ui.refresh(playerStats);
  showMessage("You have logged out. Create your Astrocat account to begin your mission.", 0);
}

function completeAccountSetup(account, options = {}) {
  const { welcome = true, persist = true } = options;
  const sanitized = sanitizeAccount(account);
  if (!sanitized) {
    return false;
  }

  activeAccount = sanitized;
  registerCallSign(sanitized.callSign);
  if (persist) {
    saveAccount(sanitized);
  }
  playerStats.name = sanitized.catName;
  playerStats.handle = sanitized.handle;
  playerStats.callSign = sanitized.callSign;
  playerStats.starterId = sanitized.starterId;
  setPlayerSpriteFromStarter(playerStats.starterId);
  const chosenStarter = findStarterCharacter(sanitized.starterId);
  ui.setAccount(sanitized, chosenStarter);
  ui.refresh(playerStats);
  if (welcome) {
    showMessage(
      {
        text: `Welcome aboard, ${sanitized.catName}! Check the Recruit Missions panel to begin your onboarding.`,
        author: "Mission Command",
        channel: "mission"
      },
      6000
    );
  } else {
    showMessage(defaultMessage, 0);
  }
  return true;
}

function openOnboarding(initialAccount = null) {
  if (onboardingInstance) {
    onboardingInstance.focus();
    return;
  }

  previousBodyOverflow = document.body.style.overflow;
  onboardingInstance = createOnboardingExperience(starterCharacters, {
    initialAccount,
    onComplete(account) {
      if (completeAccountSetup(account)) {
        closeOnboarding();
      }
    }
  });

  if (onboardingInstance) {
    document.body.append(onboardingInstance.root);
    document.body.style.overflow = "hidden";
    onboardingInstance.focus();
  }
}

function closeOnboarding() {
  if (!onboardingInstance) {
    return;
  }
  onboardingInstance.close();
  onboardingInstance = null;
  document.body.style.overflow = previousBodyOverflow;
}

const viewport = {
  width: baseCanvasWidth,
  height: baseCanvasHeight
};

const canvas = document.createElement("canvas");
canvas.width = viewport.width;
canvas.height = viewport.height;
canvas.className = "game-canvas";
ui.canvasSurface.append(canvas);

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Unable to acquire 2D context");
}

let renderScale = 1;
let devicePixelScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
let fallbackBackgroundGradient = null;
let fallbackGradientKey = "";
const promptFont = "20px 'Segoe UI', sans-serif";
let promptMetricsCache = { text: "", width: 0 };

const getFallbackBackgroundGradient = () => {
  const gradientKey = `${(renderScale * devicePixelScale).toFixed(4)}:${viewport.height}`;
  if (!fallbackBackgroundGradient || fallbackGradientKey !== gradientKey) {
    fallbackBackgroundGradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
    fallbackBackgroundGradient.addColorStop(0, "#1a1a28");
    fallbackBackgroundGradient.addColorStop(0.6, "#25253a");
    fallbackBackgroundGradient.addColorStop(1, "#2f3d3f");
    fallbackGradientKey = gradientKey;
  }
  return fallbackBackgroundGradient;
};

const getPromptMetrics = (text) => {
  if (promptMetricsCache.text === text) {
    return promptMetricsCache;
  }
  ctx.font = promptFont;
  const metrics = ctx.measureText(text);
  promptMetricsCache = { text, width: metrics.width };
  return promptMetricsCache;
};

const updateCanvasScale = () => {
  if (typeof window === "undefined") {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const surfaceRect = ui.canvasSurface.getBoundingClientRect();
  const availableWidth = surfaceRect.width || viewport.width;
  const availableHeight = Math.max(
    viewport.height,
    window.innerHeight - surfaceRect.top - 48
  );
  const widthScale = availableWidth > 0 ? availableWidth / viewport.width : 1;
  const heightScale = availableHeight > 0 ? availableHeight / viewport.height : widthScale;
  let nextScale = Math.min(widthScale, heightScale, 1.6);
  if (!Number.isFinite(nextScale) || nextScale <= 0) {
    nextScale = 1;
  }

  const targetWidth = viewport.width * nextScale;
  const targetHeight = viewport.height * nextScale;

  canvas.style.width = `${Math.round(targetWidth)}px`;
  canvas.style.height = `${Math.round(targetHeight)}px`;
  canvas.width = Math.round(targetWidth * dpr);
  canvas.height = Math.round(targetHeight * dpr);

  renderScale = nextScale;
  devicePixelScale = dpr;
  fallbackBackgroundGradient = null;
};

const scheduleCanvasScale = createFrameScheduler(updateCanvasScale);
scheduleCanvasScale();

if (typeof window !== "undefined") {
  window.addEventListener("resize", scheduleCanvasScale);
  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => scheduleCanvasScale());
    resizeObserver.observe(ui.canvasSurface);
  }
}

function createTouchControls({ onPress, onRelease, onGesture } = {}) {
  const root = document.createElement("div");
  root.className = "touch-controls";

  const movementCluster = document.createElement("div");
  movementCluster.className = "touch-controls__cluster touch-controls__cluster--left";

  const actionsCluster = document.createElement("div");
  actionsCluster.className = "touch-controls__cluster touch-controls__cluster--right";

  root.append(movementCluster, actionsCluster);

  const createButton = (label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "touch-controls__button";
    button.textContent = label;
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    return button;
  };

  const registerButton = (button, code) => {
    const activePointers = new Set();
    const handleStart = (event) => {
      event.preventDefault();
      if (typeof onGesture === "function") {
        onGesture();
      }
      if (typeof onPress === "function") {
        onPress(code);
      }
      activePointers.add(event.pointerId);
      if (typeof button.setPointerCapture === "function") {
        button.setPointerCapture(event.pointerId);
      }
    };
    const handleEnd = (event) => {
      if (!activePointers.has(event.pointerId)) {
        return;
      }
      activePointers.delete(event.pointerId);
      event.preventDefault();
      if (typeof button.releasePointerCapture === "function") {
        try {
          button.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore release errors on some browsers.
        }
      }
      if (typeof onRelease === "function") {
        onRelease(code);
      }
    };

    button.addEventListener("pointerdown", handleStart);
    button.addEventListener("pointerup", handleEnd);
    button.addEventListener("pointerleave", handleEnd);
    button.addEventListener("pointercancel", handleEnd);
  };

  const leftButton = createButton("◀");
  const rightButton = createButton("▶");
  const jumpButton = createButton("⤒");

  registerButton(leftButton, "ArrowLeft");
  registerButton(rightButton, "ArrowRight");
  registerButton(jumpButton, "Space");

  movementCluster.append(leftButton, rightButton);
  actionsCluster.append(jumpButton);

  return {
    root,
    setVisible(visible) {
      root.classList.toggle("is-active", Boolean(visible));
      root.setAttribute("aria-hidden", visible ? "false" : "true");
    }
  };
}

const groundY = viewport.height - 96;

const playerSpriteState = createSpriteState("starter sprite");
let activePlayerSpriteSource = null;

function setPlayerSpriteFromStarter(starterId) {
  const starter = findStarterCharacter(starterId);
  const source = starter?.sprite ?? starter?.image ?? null;
  if (!source) {
    activePlayerSpriteSource = null;
    playerSpriteState.handleError();
    return;
  }

  if (source === activePlayerSpriteSource) {
    return;
  }

  activePlayerSpriteSource = source;
  playerSpriteState.setSource(source);
}

setPlayerSpriteFromStarter(playerStats.starterId);

const player = {
  x: viewport.width / 2 - 36,
  y: groundY - 81,
  width: 72,
  height: 81,
  vx: 0,
  vy: 0,
  direction: 1,
  onGround: false,
  appearance: playerAppearance
};

const platforms = [
  { x: 140, y: groundY - 120, width: 160, height: 18 },
  { x: 468, y: groundY - 180, width: 200, height: 18 },
  { x: 724, y: groundY - 80, width: 150, height: 18 }
];

const crystals = [
  { x: 220, y: groundY - 36, radius: 12, collected: false },
  { x: 520, y: groundY - 220, radius: 12, collected: false },
  { x: 780, y: groundY - 116, radius: 12, collected: false },
  { x: 360, y: groundY - 156, radius: 12, collected: false },
  { x: 640, y: groundY - 36, radius: 12, collected: false }
];

let portalCharge = 0;
let portalCharged = false;
let portalCompleted = false;

const portal = {
  x: viewport.width - 140,
  y: groundY - 120,
  width: 100,
  height: 140,
  interactionPadding: 36
};

const interactables = [
  {
    type: "bulletin",
    label: "Star Bulletin Board",
    missionId: "mission-broadcast",
    x: 24,
    y: groundY - 82,
    width: 64,
    height: 82
  },
  {
    type: "chest",
    label: "Treasure Chest",
    x: 84,
    y: groundY - 46,
    width: 44,
    height: 36,
    opened: false
  },
  {
    type: "npc",
    name: "Nova",
    label: "Nova the Guide",
    x: 320,
    y: groundY - 60,
    width: 42,
    height: 54,
    missionId: "mission-briefing",
    dialogue: [
      "Welcome to the Astrocat Lobby! The Recruit Missions panel tracks your onboarding tasks.",
      "The bulletin board lets you broadcast your arrival across the cosmos.",
      "Need to sync up? Use the comms console to follow Mission Control."
    ],
    lineIndex: 0
  },
  {
    type: "fountain",
    label: "Mana Fountain",
    x: 840,
    y: groundY - 68,
    width: 48,
    height: 52,
    charges: 2
  },
  {
    type: "comms",
    label: "Comms Console",
    missionId: "mission-follow",
    x: 880,
    y: groundY - 78,
    width: 56,
    height: 78
  }
];

const missionDefinitions = [
  {
    id: "mission-briefing",
    title: "Receive Your Briefing",
    description: "Speak with Nova to learn how to progress through the lobby.",
    xp: 160
  },
  {
    id: "mission-broadcast",
    title: "Broadcast Your Arrival",
    description: "Interact with the bulletin board to draft your enlistment post on the X platform.",
    xp: 120
  },
  {
    id: "mission-follow",
    title: "Follow Mission Control",
    description: "Use the comms console to follow the official Astronaut account.",
    xp: 140
  }
];

const missions = missionDefinitions.map((mission) => ({
  ...mission,
  completed: false
}));

const missionRegistry = new Map(missions.map((mission) => [mission.id, mission]));

function refreshMissionDisplay() {
  if (!ui || typeof ui.updateMissions !== "function") {
    return;
  }
  ui.updateMissions(missions);
}

function completeMission(missionId) {
  if (!missionId) {
    return {
      completed: false,
      alreadyComplete: false,
      leveledUp: false,
      mission: null
    };
  }

  const mission = missionRegistry.get(missionId);
  if (!mission) {
    return {
      completed: false,
      alreadyComplete: false,
      leveledUp: false,
      mission: null
    };
  }

  if (mission.completed) {
    return {
      completed: false,
      alreadyComplete: true,
      leveledUp: false,
      mission
    };
  }

  mission.completed = true;
  const leveledUp = gainExperience(mission.xp);
  refreshMissionDisplay();
  return {
    completed: true,
    alreadyComplete: false,
    leveledUp,
    mission
  };
}

const keys = new Set();
const justPressed = new Set();

const pressVirtualKey = (code) => {
  if (!code) {
    return;
  }
  if (!keys.has(code)) {
    justPressed.add(code);
  }
  keys.add(code);
};

const releaseVirtualKey = (code) => {
  if (!code) {
    return;
  }
  keys.delete(code);
};

window.addEventListener("keydown", (event) => {
  audio.handleUserGesture();
  pressVirtualKey(event.code);
});

window.addEventListener("keyup", (event) => {
  releaseVirtualKey(event.code);
});

window.addEventListener("pointerdown", () => {
  audio.handleUserGesture();
});

window.addEventListener("blur", () => {
  keys.clear();
});

const audioPrompt = document.createElement("button");
audioPrompt.type = "button";
audioPrompt.className = "audio-unlock";
audioPrompt.textContent = "Tap to enable sound";
audioPrompt.addEventListener("click", () => {
  audio.handleUserGesture();
});
ui.canvasSurface.append(audioPrompt);

const hideAudioPrompt = () => {
  audioPrompt.classList.add("is-hidden");
  audioPrompt.disabled = true;
  audioPrompt.setAttribute("aria-hidden", "true");
};

const showAudioPrompt = () => {
  audioPrompt.classList.remove("is-hidden");
  audioPrompt.disabled = false;
  audioPrompt.setAttribute("aria-hidden", "false");
};

if (audio.isUnlocked()) {
  hideAudioPrompt();
} else {
  showAudioPrompt();
}

audio.onUnlock(() => {
  hideAudioPrompt();
});

const touchControls = createTouchControls({
  onPress: pressVirtualKey,
  onRelease: releaseVirtualKey,
  onGesture: () => audio.handleUserGesture()
});
ui.canvasSurface.append(touchControls.root);

const pointerPreference =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)")
    : null;

const updateTouchControlsVisibility = (matches) => {
  touchControls.setVisible(Boolean(matches));
};

if (pointerPreference) {
  updateTouchControlsVisibility(pointerPreference.matches);
  const handlePointerPreferenceChange = (event) => {
    updateTouchControlsVisibility(event.matches);
  };
  if (typeof pointerPreference.addEventListener === "function") {
    pointerPreference.addEventListener("change", handlePointerPreferenceChange);
  } else if (typeof pointerPreference.addListener === "function") {
    pointerPreference.addListener(handlePointerPreferenceChange);
  }
} else {
  touchControls.setVisible(false);
}

if (activeAccount) {
  showMessage(defaultMessage, 0);
} else {
  showMessage("Create your Astrocat account to begin your mission.", 0);
}
ui.updateCrystals(0, crystals.length);
ui.refresh(playerStats);
refreshMissionDisplay();

let lastTimestamp = performance.now();
requestAnimationFrame(loop);

function loop(timestamp) {
  const delta = Math.min(32, timestamp - lastTimestamp);
  lastTimestamp = timestamp;

  update(delta);
  render(timestamp);

  justPressed.clear();
  requestAnimationFrame(loop);
}

function update(delta) {
  const portalWasCharged = portalCharged;
  const previousX = player.x;
  const previousY = player.y;

  const moveLeft = keys.has("ArrowLeft") || keys.has("KeyA");
  const moveRight = keys.has("ArrowRight") || keys.has("KeyD");
  const jumpPressed =
    justPressed.has("Space") ||
    justPressed.has("ArrowUp") ||
    justPressed.has("KeyW");

  const acceleration = 0.35 * (delta / 16.666);
  const maxSpeed = 4.2;
  const friction = 0.82;
  const gravity = 0.52 * (delta / 16.666);

  if (moveLeft && !moveRight) {
    player.vx = Math.max(player.vx - acceleration, -maxSpeed);
    player.direction = -1;
  } else if (moveRight && !moveLeft) {
    player.vx = Math.min(player.vx + acceleration, maxSpeed);
    player.direction = 1;
  } else {
    player.vx *= friction;
    if (Math.abs(player.vx) < 0.01) {
      player.vx = 0;
    }
  }

  if (jumpPressed && player.onGround) {
    player.vy = -10.8;
    player.onGround = false;
    audio.playEffect("jump");
  }

  player.vy += gravity;
  player.x += player.vx * (delta / 16.666);
  player.y += player.vy * (delta / 16.666);
  player.onGround = false;

  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }

  if (player.x + player.width > viewport.width) {
    player.x = viewport.width - player.width;
    player.vx = 0;
  }

  if (player.y + player.height >= groundY) {
    player.y = groundY - player.height;
    player.vy = 0;
    player.onGround = true;
  }

  for (const platform of platforms) {
    const isAbovePlatform = previousY + player.height <= platform.y;
    const isWithinX =
      player.x + player.width > platform.x &&
      player.x < platform.x + platform.width;

    if (player.vy >= 0 && isAbovePlatform && isWithinX) {
      const bottom = player.y + player.height;
      if (bottom >= platform.y && bottom <= platform.y + platform.height + 4) {
        player.y = platform.y - player.height;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  let promptText = "";

  for (const crystal of crystals) {
    if (crystal.collected) continue;

    const overlapX =
      player.x + player.width > crystal.x - crystal.radius &&
      player.x < crystal.x + crystal.radius;
    const overlapY =
      player.y + player.height > crystal.y - crystal.radius &&
      player.y < crystal.y + crystal.radius;

    if (overlapX && overlapY) {
      crystal.collected = true;
      audio.playEffect("crystal");
      portalCharge = Math.min(portalCharge + 1, crystals.length);
      ui.updateCrystals(portalCharge, crystals.length);
      const fullyCharged = portalCharge === crystals.length;
      if (fullyCharged) {
        if (!portalWasCharged) {
          audio.playEffect("portalCharge");
        }
        portalCharged = true;
      }
      const leveledUp = gainExperience(60);
      let message = "Crystal energy surges through you! +60 EXP.";
      if (fullyCharged) {
        const portalReady = playerStats.level >= portalRequiredLevel;
        message = portalReady
          ? "The final crystal ignites the portal! Return and press E to travel onward."
          : `The final crystal ignites the portal! Reach Level ${portalRequiredLevel} before entering.`;
        if (leveledUp) {
          message += ` Level up! You reached level ${playerStats.level}.`;
        }
      } else if (leveledUp) {
        message += ` Level up! You reached level ${playerStats.level}.`;
      }
      showMessage(
        {
          text: message,
          author: "Mission Log",
          channel: "mission"
        },
        fullyCharged ? 5200 : 4200
      );
    }
  }

  for (const interactable of interactables) {
    const near = isNear(player, interactable, 24);
    if (!near) {
      continue;
    }

    if (interactable.type === "bulletin") {
      promptText = "Press E to review the bulletin board";
      if (justPressed.has("KeyE")) {
        const result = completeMission(interactable.missionId);
        audio.playEffect("dialogue");
        if (result.completed) {
          const xpAward = result.mission?.xp ?? 0;
          let message =
            `You craft a triumphant enlistment post for the cosmos. +${xpAward} EXP.`;
          if (result.leveledUp) {
            message += ` Level up! You reached level ${playerStats.level}.`;
          }
          showMessage(
            { text: message, author: "Mission Log", channel: "mission" },
            5600
          );
        } else if (result.alreadyComplete) {
          showMessage(
            {
              text: "Your arrival announcement already glows across the bulletin board.",
              author: "Mission Log",
              channel: "mission"
            },
            4200
          );
        } else {
          showMessage(
            {
              text: "Mission updates shimmer across the bulletin board display.",
              author: "Mission Log",
              channel: "mission"
            },
            3800
          );
        }
      }
    } else if (interactable.type === "chest") {
      promptText = "Press E to open the chest";
      if (justPressed.has("KeyE")) {
        if (!interactable.opened) {
          interactable.opened = true;
          playerStats.hp = clamp(playerStats.hp + 12, 0, playerStats.maxHp);
          ui.refresh(playerStats);
          audio.playEffect("chestOpen");
          showMessage(
            {
              text: "You found herbal tonics! HP restored.",
              author: "Mission Log",
              channel: "mission"
            },
            3600
          );
        } else {
          audio.playEffect("dialogue");
          showMessage(
            {
              text: "The chest is empty now, but still shiny.",
              author: "Mission Log",
              channel: "mission"
            },
            2800
          );
        }
      }
    } else if (interactable.type === "fountain") {
      promptText = "Press E to draw power from the fountain";
      if (justPressed.has("KeyE")) {
        if (interactable.charges > 0) {
          interactable.charges -= 1;
          playerStats.mp = clamp(playerStats.mp + 18, 0, playerStats.maxMp);
          ui.refresh(playerStats);
          audio.playEffect("fountain");
          showMessage(
            {
              text: "Mana rush! Your MP was restored.",
              author: "Mission Log",
              channel: "mission"
            },
            3200
          );
        } else {
          audio.playEffect("dialogue");
          showMessage(
            {
              text: "The fountain needs time to recharge.",
              author: "Mission Log",
              channel: "mission"
            },
            3000
          );
        }
      }
    } else if (interactable.type === "npc") {
      promptText = "Press E to talk to Nova";
      if (justPressed.has("KeyE")) {
        const missionResult = completeMission(interactable.missionId);
        audio.playEffect("dialogue");
        if (missionResult.completed) {
          const xpAward = missionResult.mission?.xp ?? 0;
          const briefingLine = interactable.dialogue[0];
          interactable.lineIndex = Math.min(1, interactable.dialogue.length - 1);
          let message = `${briefingLine} +${xpAward} EXP.`;
          if (missionResult.leveledUp) {
            message += ` Level up! You reached level ${playerStats.level}.`;
          }
          showMessage(
            { text: message, author: interactable.name, channel: "mission" },
            5600
          );
        } else {
          const line = interactable.dialogue[interactable.lineIndex];
          interactable.lineIndex =
            (interactable.lineIndex + 1) % interactable.dialogue.length;
          showMessage(
            { text: line, author: interactable.name, channel: "mission" },
            4600
          );
        }
      }
    } else if (interactable.type === "comms") {
      promptText = "Press E to access the comms console";
      if (justPressed.has("KeyE")) {
        const result = completeMission(interactable.missionId);
        audio.playEffect("dialogue");
        if (result.completed) {
          const xpAward = result.mission?.xp ?? 0;
          let message =
            `You sync with the Astronaut account. Mission Control now follows your journey. +${xpAward} EXP.`;
          if (result.leveledUp) {
            message += ` Level up! You reached level ${playerStats.level}.`;
          }
          showMessage(
            { text: message, author: "Mission Command", channel: "mission" },
            5600
          );
        } else if (result.alreadyComplete) {
          showMessage(
            {
              text: "Mission Control feed already streams updates to your visor.",
              author: "Mission Command",
              channel: "mission"
            },
            4200
          );
        } else {
          showMessage(
            {
              text: "The console hums, waiting for your next command.",
              author: "Mission Command",
              channel: "mission"
            },
            3600
          );
        }
      }
    }
  }

  const nearPortal = isNear(player, portal, portal.interactionPadding);
  if (nearPortal) {
    if (portalCharged) {
      if (playerStats.level < portalRequiredLevel) {
        promptText = `Reach Level ${portalRequiredLevel} to activate the portal.`;
        if (justPressed.has("KeyE")) {
          audio.playEffect("dialogue");
          showMessage(
            {
              text: `The portal resists you. Train until Level ${portalRequiredLevel} to stabilize the jump.`,
              author: "Mission Command",
              channel: "mission"
            },
            5200
          );
        }
      } else if (portalCompleted) {
        promptText = "The portal hums softly, its gateway already opened.";
      } else {
        promptText = "Press E to step through the charged portal";
        if (justPressed.has("KeyE")) {
          audio.playEffect("portalActivate");
          portalCompleted = true;
          const bonusExp = gainExperience(120);
          playerStats.hp = playerStats.maxHp;
          playerStats.mp = playerStats.maxMp;
          ui.refresh(playerStats);
          let completionMessage =
            "You stride into the energized portal! All stats restored for the journey ahead.";
          if (bonusExp) {
            completionMessage += ` Level up! You reached level ${playerStats.level}.`;
          }
          audio.playEffect("portalComplete");
          showMessage(
            {
              text: completionMessage,
              author: "Mission Log",
              channel: "mission"
            },
            6200
          );
        }
      }
    } else {
      promptText = "The portal is dormant. Gather more crystals.";
    }
  }

  ui.setPrompt(promptText);
}

function render(timestamp) {
  const time = timestamp / 1000;

  ctx.setTransform(
    renderScale * devicePixelScale,
    0,
    0,
    renderScale * devicePixelScale,
    0,
    0
  );

  if (backgroundReady) {
    ctx.drawImage(backgroundImage, 0, 0, viewport.width, viewport.height);
  } else {
    ctx.fillStyle = getFallbackBackgroundGradient();
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }

  ctx.fillStyle = "#1c2b33";
  ctx.fillRect(0, groundY, viewport.width, viewport.height - groundY);

  ctx.fillStyle = "#243b25";
  ctx.fillRect(0, groundY, viewport.width, 16);

  if (platformSprite.isReady() && platformSprite.image) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const platform of platforms) {
      ctx.drawImage(
        platformSprite.image,
        0,
        0,
        platformSprite.image.width,
        platformSprite.image.height,
        platform.x,
        platform.y,
        platform.width,
        platform.height
      );
    }
    ctx.restore();
  } else {
    ctx.fillStyle = "#3b5e3f";
    for (const platform of platforms) {
      drawRoundedRect(platform.x, platform.y, platform.width, platform.height, 6);
    }
  }

  drawPortal(time);

  for (const interactable of interactables) {
    if (interactable.type === "bulletin") {
      drawBulletin(interactable, time);
    } else if (interactable.type === "chest") {
      drawChest(interactable);
    } else if (interactable.type === "fountain") {
      drawFountain(interactable, time);
    } else if (interactable.type === "npc") {
      drawGuide(interactable, time);
    } else if (interactable.type === "comms") {
      drawComms(interactable, time);
    }
  }

  for (const crystal of crystals) {
    if (crystal.collected) continue;
    drawCrystal(crystal, time);
  }

  drawPlayer(player, time);

  if (ui.promptText) {
    ctx.font = promptFont;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    const metrics = getPromptMetrics(ui.promptText);
    const x = Math.max(
      12,
      Math.min(
        player.x + player.width / 2 - metrics.width / 2,
        viewport.width - metrics.width - 12
      )
    );
    const y = player.y - 18;
    ctx.fillRect(x - 8, y - 22, metrics.width + 16, 32);
    ctx.fillStyle = "#f1f1ff";
    ctx.fillText(ui.promptText, x, y);
  }
}

function drawPortal(time) {
  const { x: portalX, y: portalY, width: portalWidth, height: portalHeight } = portal;
  const framePulse = (Math.sin(time * (portalCharged ? 4.4 : 2.2)) + 1) / 2;
  const archColor = portalCharged ? "#4a2f7f" : "#384d6b";
  const glowInner = portalCharged ? "rgba(160, 255, 245, 0.95)" : "rgba(150, 205, 255, 0.65)";
  const glowOuter = portalCharged ? "rgba(90, 220, 200, 0.35)" : "rgba(100, 140, 220, 0.1)";

  ctx.save();
  ctx.fillStyle = archColor;
  drawRoundedRect(portalX - 12, portalY - 12, portalWidth + 24, portalHeight + 24, 24);

  const glowGradient = ctx.createRadialGradient(
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    10,
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    portalWidth / 2
  );
  glowGradient.addColorStop(0, glowInner);
  glowGradient.addColorStop(1, glowOuter);
  ctx.fillStyle = glowGradient;
  ctx.globalAlpha = portalCharged ? 1 : 0.85;
  drawRoundedRect(portalX, portalY, portalWidth, portalHeight, 20);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = portalCharged
    ? `rgba(230, 250, 255, ${0.55 + framePulse * 0.25})`
    : `rgba(200, 240, 255, 0.55)`;
  ctx.lineWidth = 4;
  ctx.strokeRect(portalX + 12, portalY + 12, portalWidth - 24, portalHeight - 24);

  const pulse = (Math.sin(time * (portalCharged ? 5.2 : 2.4)) + 1) / 2;
  const ellipseColor = portalCharged
    ? `rgba(120, 255, 225, ${0.5 + pulse * 0.4})`
    : `rgba(180, 230, 255, ${0.35 + pulse * 0.35})`;
  ctx.lineWidth = portalCharged ? 4 : 3;
  ctx.strokeStyle = ellipseColor;
  ctx.beginPath();
  ctx.ellipse(
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    24 + pulse * (portalCharged ? 14 : 8),
    60 + pulse * (portalCharged ? 20 : 12),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  if (portalCharged) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    for (let i = 0; i < 6; i += 1) {
      const angle = time * 1.6 + (i * Math.PI) / 3;
      const radius = 32 + framePulse * 12;
      const orbX = portalX + portalWidth / 2 + Math.cos(angle) * radius;
      const orbY = portalY + portalHeight / 2 + Math.sin(angle) * (radius * 0.6);
      const orbSize = 6 + Math.sin(time * 4 + i) * 2;
      ctx.beginPath();
      ctx.arc(orbX, orbY, orbSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPlayer(entity, time) {
  ctx.save();
  ctx.translate(entity.x + entity.width / 2, entity.y + entity.height);
  ctx.scale(entity.direction, 1);
  ctx.translate(-entity.width / 2, -entity.height);

  const appearance = entity.appearance ?? playerAppearance;

  if (playerSpriteState.isReady()) {
    const spriteImage = playerSpriteState.image;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      spriteImage,
      0,
      0,
      spriteImage.width,
      spriteImage.height,
      0,
      0,
      entity.width,
      entity.height
    );

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = appearance.hair;
    ctx.fillRect(0, 0, entity.width, entity.height * 0.28);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = appearance.skin;
    ctx.fillRect(entity.width * 0.18, entity.height * 0.04, entity.width * 0.64, entity.height * 0.34);

    ctx.globalAlpha = 0.24;
    ctx.fillStyle = appearance.shirt;
    ctx.fillRect(0, entity.height * 0.32, entity.width, entity.height * 0.68);
    ctx.restore();
  } else {
    ctx.fillStyle = appearance.shirt;
    drawRoundedRect(4, 12, entity.width - 8, entity.height - 18, 6);

    ctx.fillStyle = appearance.skin;
    drawRoundedRect(6, 0, entity.width - 12, 18, 6);

    ctx.fillStyle = appearance.hair;
    ctx.fillRect(8, 16, entity.width - 16, 6);

    ctx.fillStyle = "#111";
    const blink = Math.sin(time * 3.2) > -0.2 ? 1 : 0.2;
    ctx.fillRect(12, 6, 4, 4 * blink);
    ctx.fillRect(entity.width - 16, 6, 4, 4 * blink);

    ctx.fillStyle = "#c9d7ff";
    ctx.fillRect(0, entity.height - 12, entity.width - 12, 12);
    ctx.fillRect(entity.width - 12, entity.height - 8, 12, 8);
  }
  ctx.restore();
}

function drawBulletin(board, time) {
  ctx.save();
  ctx.translate(board.x, board.y);
  const pulse = (Math.sin(time * 2.2) + 1) / 2;
  ctx.fillStyle = "#1d253f";
  drawRoundedRect(0, 10, board.width, board.height - 10, 10);
  ctx.fillStyle = "#151c2c";
  ctx.fillRect(6, board.height - 12, 12, 12);
  ctx.fillRect(board.width - 18, board.height - 12, 12, 12);
  ctx.fillStyle = `rgba(120, 150, 255, ${0.35 + pulse * 0.25})`;
  drawRoundedRect(8, 16, board.width - 16, board.height - 38, 8);
  ctx.fillStyle = "rgba(15, 20, 40, 0.85)";
  drawRoundedRect(14, 24, board.width - 28, 32, 6);
  ctx.fillStyle = "rgba(215, 230, 255, 0.82)";
  ctx.fillRect(20, 30, board.width - 40, 6);
  ctx.fillRect(20, 40, board.width - 56, 4);
  ctx.fillStyle = `rgba(255, 200, 255, ${0.3 + pulse * 0.3})`;
  ctx.fillRect(20, 48, board.width - 40, 4);
  ctx.fillStyle = `rgba(140, 200, 255, ${0.35 + pulse * 0.35})`;
  drawRoundedRect(14, board.height - 28, board.width - 28, 10, 4);
  ctx.restore();
}

function drawChest(chest) {
  ctx.save();
  ctx.translate(chest.x, chest.y);
  if (chestSprite.isReady() && chestSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      chestSprite.image,
      0,
      0,
      chestSprite.image.width,
      chestSprite.image.height,
      0,
      0,
      chest.width,
      chest.height
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = chest.opened ? "#a77b3b" : "#c58f3d";
  drawRoundedRect(0, 10, chest.width, chest.height - 10, 6);
  ctx.fillStyle = chest.opened ? "#8a5f23" : "#a16b22";
  drawRoundedRect(0, 0, chest.width, 18, 6);
  ctx.fillStyle = "#f7d774";
  ctx.fillRect(chest.width / 2 - 4, 18, 8, 10);
  ctx.restore();
}

function drawFountain(fountain, time) {
  ctx.save();
  ctx.translate(fountain.x, fountain.y);
  if (fountainSprite.isReady() && fountainSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      fountainSprite.image,
      0,
      0,
      fountainSprite.image.width,
      fountainSprite.image.height,
      0,
      0,
      fountain.width,
      fountain.height
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#3c4a62";
  drawRoundedRect(0, fountain.height - 18, fountain.width, 18, 8);
  ctx.fillStyle = "#556b8f";
  drawRoundedRect(6, 14, fountain.width - 12, fountain.height - 32, 10);
  const pulse = (Math.sin(time * 2) + 1) / 2;
  ctx.fillStyle = `rgba(120, 205, 255, ${0.4 + pulse * 0.4})`;
  drawRoundedRect(10, 20, fountain.width - 20, fountain.height - 40, 10);
  ctx.restore();
}

function drawGuide(guide, time) {
  ctx.save();
  ctx.translate(guide.x, guide.y);
  if (guideSprite.isReady() && guideSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      guideSprite.image,
      0,
      0,
      guideSprite.image.width,
      guideSprite.image.height,
      0,
      0,
      guide.width,
      guide.height
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#f4dede";
  drawRoundedRect(4, 8, guide.width - 8, guide.height - 12, 10);
  ctx.fillStyle = "#dba6ff";
  drawRoundedRect(8, guide.height - 28, guide.width - 16, 20, 8);
  ctx.fillStyle = "#000";
  const bob = Math.sin(time * 2.4) * 1.5;
  ctx.fillRect(12, 14 + bob, 4, 6);
  ctx.fillRect(guide.width - 16, 14 + bob, 4, 6);
  ctx.fillStyle = "#fff";
  ctx.fillRect(12, 14 + bob, 4, 4);
  ctx.fillRect(guide.width - 16, 14 + bob, 4, 4);
  ctx.fillStyle = "#fefefe";
  ctx.beginPath();
  ctx.arc(guide.width / 2, 8, 10, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawComms(consoleUnit, time) {
  ctx.save();
  ctx.translate(consoleUnit.x, consoleUnit.y);
  const pulse = (Math.sin(time * 3.4) + 1) / 2;
  ctx.fillStyle = "#1c273a";
  drawRoundedRect(0, 12, consoleUnit.width, consoleUnit.height - 12, 12);
  ctx.fillStyle = "#2f3f62";
  drawRoundedRect(6, 0, consoleUnit.width - 12, 36, 10);
  ctx.fillStyle = `rgba(110, 215, 255, ${0.45 + pulse * 0.35})`;
  drawRoundedRect(12, 8, consoleUnit.width - 24, 22, 8);
  ctx.strokeStyle = `rgba(140, 200, 255, ${0.6 + pulse * 0.2})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(consoleUnit.width / 2, -6);
  ctx.lineTo(consoleUnit.width / 2, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(consoleUnit.width / 2, -8, 6 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(90, 255, 200, ${0.3 + pulse * 0.4})`;
  drawRoundedRect(10, consoleUnit.height - 20, consoleUnit.width - 20, 10, 4);
  ctx.restore();
}

function drawCrystal(crystal, time) {
  ctx.save();
  ctx.translate(crystal.x, crystal.y);
  if (crystalSprite.isReady() && crystalSprite.image) {
    const targetSize = crystal.radius * 2 + 12;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      crystalSprite.image,
      0,
      0,
      crystalSprite.image.width,
      crystalSprite.image.height,
      -targetSize / 2,
      -targetSize / 2,
      targetSize,
      targetSize
    );
    ctx.restore();
    return;
  }
  ctx.rotate(Math.sin(time * 2 + crystal.x * 0.01) * 0.1);
  const gradient = ctx.createLinearGradient(-crystal.radius, -crystal.radius, crystal.radius, crystal.radius);
  gradient.addColorStop(0, "#d9baff");
  gradient.addColorStop(1, "#8fb5ff");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, -crystal.radius - 6);
  ctx.lineTo(crystal.radius, 0);
  ctx.lineTo(0, crystal.radius + 6);
  ctx.lineTo(-crystal.radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function isNear(playerEntity, object, padding) {
  return (
    playerEntity.x < object.x + object.width + padding &&
    playerEntity.x + playerEntity.width > object.x - padding &&
    playerEntity.y < object.y + object.height + padding &&
    playerEntity.y + playerEntity.height > object.y - padding
  );
}

function gainExperience(amount) {
  playerStats.exp += amount;
  let leveledUp = false;
  while (playerStats.exp >= playerStats.maxExp) {
    playerStats.exp -= playerStats.maxExp;
    playerStats.level += 1;
    playerStats.maxExp = Math.round(playerStats.maxExp * 1.2);
    leveledUp = true;
  }
  updateRankFromLevel();
  if (leveledUp) {
    audio.playEffect("levelUp");
  }
  ui.refresh(playerStats);
  return leveledUp;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showMessage(input, duration, meta = {}) {
  const payload = typeof input === "string" ? { text: input } : { ...input };
  const resolvedDuration =
    typeof payload.duration === "number"
      ? payload.duration
      : typeof duration === "number"
        ? duration
        : 0;
  const text = payload.text ?? meta.text ?? "";
  const channel = payload.channel ?? meta.channel ?? "mission";
  const author =
    payload.author ??
    meta.author ??
    (channel === "friend" ? "Crewmate" : "Mission Command");
  const animate =
    typeof payload.animate === "boolean"
      ? payload.animate
      : typeof meta.animate === "boolean"
        ? meta.animate
        : resolvedDuration > 0;
  const silent =
    typeof payload.silent === "boolean"
      ? payload.silent
      : typeof meta.silent === "boolean"
        ? meta.silent
        : !animate;
  const log =
    typeof payload.log === "boolean"
      ? payload.log
      : typeof meta.log === "boolean"
        ? meta.log
        : animate;

  ui.setMessage(text, {
    ...meta,
    ...payload,
    duration: resolvedDuration,
    channel,
    author,
    animate,
    silent,
    log
  });

  if (messageTimerId) {
    clearTimeout(messageTimerId);
    messageTimerId = 0;
  }
  if (resolvedDuration > 0) {
    messageTimerId = window.setTimeout(() => {
      ui.setMessage(defaultMessage, {
        silent: true,
        animate: false,
        log: false
      });
      messageTimerId = 0;
    }, resolvedDuration);
  }
}

if (typeof window !== "undefined") {
  window.astrocatLobby = window.astrocatLobby ?? {};
  window.astrocatLobby.pushTransmission = (payload) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const duration =
      typeof payload.duration === "number" ? payload.duration : 5200;
    showMessage(
      {
        ...payload,
        duration,
        animate: payload.animate ?? true,
        silent: payload.silent ?? false,
        log: payload.log ?? true
      },
      duration
    );
  };
  window.astrocatLobby.pushFriendPost = (author, text, duration = 5200) => {
    if (!text) {
      return;
    }
    showMessage(
      {
        text,
        author: author && typeof author === "string" ? author : "Crewmate",
        channel: "friend",
        duration,
        animate: true,
        silent: false,
        log: true
      },
      duration
    );
  };
}

function createOnboardingExperience(options, config = {}) {
  const characters = Array.isArray(options) && options.length > 0 ? options : starterCharacters;
  const { initialAccount = null, onComplete } = config;
  let activeIndex = Math.max(
    0,
    characters.findIndex((option) => option.id === initialAccount?.starterId)
  );
  if (activeIndex === -1) {
    activeIndex = 0;
  }

  const idSuffix = Math.random().toString(36).slice(2, 8);
  const root = document.createElement("div");
  root.className = "onboarding-overlay";

  const modal = document.createElement("div");
  modal.className = "onboarding-modal";
  root.append(modal);

  const heading = document.createElement("h2");
  heading.className = "onboarding-heading";
  heading.textContent = "Create your Astrocat account";
  modal.append(heading);

  const intro = document.createElement("p");
  intro.className = "onboarding-intro";
  intro.textContent =
    "Mission Control assigns your secure call sign. Name your companion and pick a starter to begin exploring.";
  modal.append(intro);

  const characterSection = document.createElement("div");
  characterSection.className = "onboarding-character";
  const characterImage = document.createElement("img");
  characterImage.className = "onboarding-character__image";
  characterImage.alt = "Starter character preview";

  const characterDetails = document.createElement("div");
  characterDetails.className = "onboarding-character__details";
  const characterName = document.createElement("h3");
  characterName.className = "onboarding-character__name";
  const characterTagline = document.createElement("p");
  characterTagline.className = "onboarding-character__tagline";
  const characterDescription = document.createElement("p");
  characterDescription.className = "onboarding-character__description";

  const nav = document.createElement("div");
  nav.className = "onboarding-nav";
  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "onboarding-nav__button";
  prevButton.textContent = "Previous";
  const stepIndicator = document.createElement("span");
  stepIndicator.className = "onboarding-step";
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "onboarding-nav__button";
  nextButton.textContent = "Next";
  nav.append(prevButton, stepIndicator, nextButton);

  characterDetails.append(characterName, characterTagline, characterDescription, nav);
  characterSection.append(characterImage, characterDetails);
  modal.append(characterSection);

  const form = document.createElement("form");
  form.className = "onboarding-form";
  modal.append(form);

  const callSignField = document.createElement("div");
  callSignField.className = "onboarding-field onboarding-field--static";
  const callSignLabel = document.createElement("span");
  callSignLabel.className = "onboarding-label";
  callSignLabel.textContent = "Assigned call sign";
  const callSignValue = document.createElement("span");
  callSignValue.className = "onboarding-call-sign";
  const callSignHint = document.createElement("p");
  callSignHint.className = "onboarding-hint";
  callSignHint.textContent = "Share this number so other explorers can reach you.";
  callSignField.append(callSignLabel, callSignValue, callSignHint);

  const nameField = document.createElement("div");
  nameField.className = "onboarding-field";
  const nameLabel = document.createElement("label");
  nameLabel.className = "onboarding-label";
  nameLabel.textContent = "Astrocat name";
  const nameInput = document.createElement("input");
  nameInput.id = `onboarding-name-${idSuffix}`;
  nameInput.name = "catName";
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.maxLength = 28;
  nameInput.placeholder = "Luna Voyager";
  nameInput.className = "onboarding-input";
  nameLabel.setAttribute("for", nameInput.id);
  const nameHint = document.createElement("p");
  nameHint.className = "onboarding-hint";
  nameHint.textContent = "Give your cosmic companion a memorable title.";
  nameField.append(nameLabel, nameInput, nameHint);

  const actions = document.createElement("div");
  actions.className = "onboarding-actions";
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "onboarding-submit";
  submitButton.textContent = "Create account";
  actions.append(submitButton);

  form.append(callSignField, nameField, actions);
  let pendingCallSign = null;
  if (initialAccount) {
    if (isValidCallSign(initialAccount.callSign)) {
      pendingCallSign = initialAccount.callSign;
    } else if (typeof initialAccount.handle === "string") {
      const digits = initialAccount.handle.replace(/^@+/, "");
      if (isValidCallSign(digits)) {
        pendingCallSign = digits;
      }
    }
  }

  pendingCallSign = generateCallSignCandidate(pendingCallSign);
  callSignValue.textContent = `@${pendingCallSign}`;

  if (initialAccount?.catName) {
    nameInput.value = initialAccount.catName;
  }

  function currentCharacter() {
    return characters[activeIndex] ?? characters[0];
  }

  function renderCharacter() {
    const selection = currentCharacter();
    characterImage.src = selection.image;
    characterImage.alt = selection.name;
    characterName.textContent = selection.name;
    characterTagline.textContent = selection.tagline;
    characterDescription.textContent = selection.description;
    stepIndicator.textContent = `${activeIndex + 1} / ${characters.length}`;
    const disableNav = characters.length <= 1;
    prevButton.disabled = disableNav;
    nextButton.disabled = disableNav;
  }

  prevButton.addEventListener("click", () => {
    activeIndex = (activeIndex - 1 + characters.length) % characters.length;
    renderCharacter();
  });

  nextButton.addEventListener("click", () => {
    activeIndex = (activeIndex + 1) % characters.length;
    renderCharacter();
  });

  nameInput.addEventListener("input", () => {
    nameInput.setCustomValidity("");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const trimmedName = nameInput.value.trim().replace(/\s+/g, " ");
    if (!trimmedName) {
      nameInput.setCustomValidity("Name your astrocat to continue.");
      nameInput.reportValidity();
      return;
    }

    const selection = currentCharacter();
    const sanitized = sanitizeAccount({
      callSign: pendingCallSign,
      catName: trimmedName,
      starterId: selection.id
    });

    if (!sanitized) {
      nameInput.setCustomValidity("Please provide account details to continue.");
      nameInput.reportValidity();
      return;
    }

    pendingCallSign = sanitized.callSign;
    callSignValue.textContent = `@${pendingCallSign}`;
    nameInput.value = sanitized.catName;
    if (typeof onComplete === "function") {
      onComplete(sanitized);
    }
  });

  renderCharacter();

  return {
    root,
    focus() {
      nameInput.focus();
    },
    close() {
      root.remove();
    }
  };
}

function createInterface(stats, appearance, options = {}) {
  const { onRequestLogin, onRequestLogout, portalLevelRequirement = 1 } = options;
  const root = document.createElement("div");
  root.className = "game-root";

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "canvas-wrapper";

  const canvasSurface = document.createElement("div");
  canvasSurface.className = "canvas-surface";
  canvasWrapper.append(canvasSurface);

  const chatBoard = createChatBoardSection();
  canvasWrapper.append(chatBoard.root);

  const panel = document.createElement("aside");
  panel.className = "stats-panel";

  const title = document.createElement("h1");
  title.textContent = "Astrocat Lobby";
  panel.append(title);

  const subtitle = document.createElement("p");
  subtitle.className = "player-subtitle";
  panel.append(subtitle);

  const accountCard = document.createElement("section");
  accountCard.className = "account-card account-card--empty";

  const accountHeading = document.createElement("span");
  accountHeading.className = "account-card__title";
  accountHeading.textContent = "Your Astrocat Profile";
  accountCard.append(accountHeading);

  const accountHandle = document.createElement("p");
  accountHandle.className = "account-card__handle";
  accountCard.append(accountHandle);

  const accountCatName = document.createElement("p");
  accountCatName.className = "account-card__cat-name";
  accountCard.append(accountCatName);

  const accountStarter = document.createElement("div");
  accountStarter.className = "account-card__starter";
  const accountStarterImage = document.createElement("img");
  accountStarterImage.className = "account-card__starter-image";
  accountStarterImage.alt = "Starter preview";
  const accountStarterInfo = document.createElement("div");
  accountStarterInfo.className = "account-card__starter-info";
  const accountStarterName = document.createElement("span");
  accountStarterName.className = "account-card__starter-name";
  const accountStarterTagline = document.createElement("span");
  accountStarterTagline.className = "account-card__starter-tagline";
  accountStarterInfo.append(accountStarterName, accountStarterTagline);
  accountStarter.append(accountStarterImage, accountStarterInfo);
  accountCard.append(accountStarter);

  const accountActions = document.createElement("div");
  accountActions.className = "account-card__actions";
  const loginButton = document.createElement("button");
  loginButton.type = "button";
  loginButton.className = "account-card__action";
  loginButton.textContent = "Log in";
  loginButton.addEventListener("click", () => {
    if (typeof onRequestLogin === "function") {
      onRequestLogin();
    }
  });
  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "account-card__action account-card__action--logout";
  logoutButton.textContent = "Log out";
  logoutButton.hidden = true;
  logoutButton.addEventListener("click", () => {
    if (typeof onRequestLogout === "function") {
      onRequestLogout();
    }
  });
  accountActions.append(loginButton, logoutButton);
  accountCard.append(accountActions);

  panel.append(accountCard);

  const statsContainer = document.createElement("div");
  statsContainer.className = "stats-container";
  panel.append(statsContainer);

  const hpBar = createStatBar("HP", "linear-gradient(90deg,#ff9a9e,#ff4e50)");
  const mpBar = createStatBar("MP", "linear-gradient(90deg,#74f2ff,#4fa9ff)");
  const expBar = createStatBar("EXP", "linear-gradient(90deg,#fddb92,#d1fdff)");

  const crystalsLabel = document.createElement("p");
  crystalsLabel.className = "crystal-label";
  panel.append(crystalsLabel);

  const message = document.createElement("p");
  message.className = "message";
  panel.append(message);

  const commsSection = document.createElement("section");
  commsSection.className = "comms-center";
  const commsHeader = document.createElement("div");
  commsHeader.className = "comms-center__header";
  const commsTitle = document.createElement("h2");
  commsTitle.className = "comms-center__title";
  commsTitle.textContent = "Comms Center";
  const commsCallSign = document.createElement("span");
  commsCallSign.className = "comms-center__call-sign";
  commsCallSign.hidden = true;
  commsHeader.append(commsTitle, commsCallSign);

  const commsDescription = document.createElement("p");
  commsDescription.className = "comms-center__description";
  commsDescription.textContent =
    "Tag a call sign (e.g. @12345) in your message to deliver it to another Astrocat.";

  const commsFeedback = document.createElement("p");
  commsFeedback.className = "comms-center__feedback";
  commsFeedback.hidden = true;

  const commsEmpty = document.createElement("p");
  commsEmpty.className = "comms-center__empty";
  commsEmpty.textContent = "Messages addressed to your call sign will appear here.";

  const commsMessages = document.createElement("ul");
  commsMessages.className = "comms-center__messages";
  commsMessages.hidden = true;

  const commsForm = document.createElement("form");
  commsForm.className = "comms-center__form";
  const commsInput = document.createElement("input");
  commsInput.type = "text";
  commsInput.className = "comms-center__input";
  commsInput.placeholder = "Log in to send transmissions.";
  commsInput.maxLength = 220;
  commsInput.disabled = true;
  const commsSubmit = document.createElement("button");
  commsSubmit.type = "submit";
  commsSubmit.className = "comms-center__submit";
  commsSubmit.textContent = "Send";
  commsSubmit.disabled = true;
  commsForm.append(commsInput, commsSubmit);

  commsSection.append(
    commsHeader,
    commsDescription,
    commsFeedback,
    commsEmpty,
    commsMessages,
    commsForm
  );
  panel.append(commsSection);

  let activeCallSign = isValidCallSign(stats.callSign) ? stats.callSign : null;

  const applyCommsBoard = (callSign) => {
    commsMessages.innerHTML = "";
    if (!callSign) {
      commsMessages.hidden = true;
      commsEmpty.hidden = false;
      commsEmpty.textContent = "Log in to receive transmissions from fellow explorers.";
      return;
    }

    const entries = getMessagesForCallSign(callSign).slice(-20).reverse();
    if (entries.length === 0) {
      commsMessages.hidden = true;
      commsEmpty.hidden = false;
      commsEmpty.textContent = "Messages addressed to your call sign will appear here.";
      return;
    }

    commsMessages.hidden = false;
    commsEmpty.hidden = true;
    for (const entry of entries) {
      const item = document.createElement("li");
      item.className = "comms-center__message";

      const meta = document.createElement("div");
      meta.className = "comms-center__meta";
      const sender = document.createElement("span");
      sender.className = "comms-center__sender";
      sender.textContent = entry.senderCallSign ? `@${entry.senderCallSign}` : "Unknown";
      meta.append(sender);

      if (entry.senderName) {
        const senderName = document.createElement("span");
        senderName.className = "comms-center__sender-name";
        senderName.textContent = entry.senderName;
        meta.append(senderName);
      }

      const timestamp = document.createElement("time");
      timestamp.className = "comms-center__time";
      const date = new Date(entry.timestamp);
      timestamp.dateTime = date.toISOString();
      timestamp.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.append(timestamp);

      const body = document.createElement("p");
      body.className = "comms-center__body";
      body.textContent = entry.content;

      item.append(meta, body);
      commsMessages.append(item);
    }
  };

  const scheduleCommsRender = createFrameScheduler((callSign) => {
    applyCommsBoard(callSign);
  });

  function updateCommsInterface(callSign) {
    const validCallSign = isValidCallSign(callSign) ? callSign : null;
    activeCallSign = validCallSign;
    commsInput.disabled = !validCallSign;
    commsSubmit.disabled = !validCallSign;
    commsFeedback.hidden = true;
    commsFeedback.classList.remove("is-error");

    if (validCallSign) {
      commsCallSign.textContent = `@${validCallSign}`;
      commsCallSign.hidden = false;
      commsInput.placeholder = "Message another Astrocat by tagging their call sign (e.g. @12345)";
    } else {
      commsCallSign.textContent = "";
      commsCallSign.hidden = true;
      commsInput.value = "";
      commsInput.placeholder = "Log in to send transmissions.";
    }

    scheduleCommsRender(validCallSign);
  }

  commsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeCallSign) {
      commsFeedback.textContent = "Log in to send transmissions.";
      commsFeedback.classList.add("is-error");
      commsFeedback.hidden = false;
      return;
    }

    const rawMessage = commsInput.value.trim();
    if (!rawMessage) {
      commsInput.setCustomValidity("Enter a message to send.");
      commsInput.reportValidity();
      return;
    }

    const mentionMatch = rawMessage.match(/@(\d{5})/);
    if (!mentionMatch) {
      const errorText = "Include a call sign like @12345 to route your message.";
      commsInput.setCustomValidity(errorText);
      commsInput.reportValidity();
      commsFeedback.textContent = errorText;
      commsFeedback.classList.add("is-error");
      commsFeedback.hidden = false;
      return;
    }

    commsInput.setCustomValidity("");
    const targetCallSign = mentionMatch[1];
    const sanitizedContent = sanitizeMessageContent(rawMessage);
    const senderCallSign = isValidCallSign(stats.callSign) ? stats.callSign : null;
    const result = appendMessageToBoard(targetCallSign, {
      content: sanitizedContent,
      senderCallSign,
      senderName: stats.name
    });

    if (!result) {
      commsFeedback.textContent = "Unable to send your transmission. Try again.";
      commsFeedback.classList.add("is-error");
      commsFeedback.hidden = false;
      return;
    }

    commsInput.value = "";
    commsFeedback.textContent = `Transmission delivered to @${targetCallSign}.`;
    commsFeedback.classList.remove("is-error");
    commsFeedback.hidden = false;

    if (targetCallSign === activeCallSign) {
      scheduleCommsRender(activeCallSign);
    }
  });

  updateCommsInterface(activeCallSign);

  const missionSection = document.createElement("section");
  missionSection.className = "mission-log";
  const missionTitle = document.createElement("h2");
  missionTitle.className = "mission-log__title";
  missionTitle.textContent = "Recruit Missions";
  const missionSummary = document.createElement("p");
  missionSummary.className = "mission-log__summary";
  const missionRequirement = document.createElement("p");
  missionRequirement.className = "mission-log__requirement";
  const missionList = document.createElement("ul");
  missionList.className = "mission-log__list";
  missionSection.append(missionTitle, missionSummary, missionRequirement, missionList);
  panel.append(missionSection);

  const applyMissionState = (missionState) => {
    const normalizedState = Array.isArray(missionState) ? missionState : [];
    const total = normalizedState.length;
    const completed = normalizedState.filter((mission) => mission.completed).length;
    missionSummary.textContent =
      total > 0 ? `${completed} / ${total} completed` : "No missions available";
    missionList.innerHTML = "";
    for (const mission of normalizedState) {
      const item = document.createElement("li");
      item.className = "mission-log__item";
      if (mission.completed) {
        item.classList.add("is-completed");
      }

      const status = document.createElement("span");
      status.className = "mission-log__status";
      status.textContent = mission.completed ? "✓" : "•";

      const content = document.createElement("div");
      content.className = "mission-log__content";

      const name = document.createElement("p");
      name.className = "mission-log__name";
      name.textContent = mission.title;

      const description = document.createElement("p");
      description.className = "mission-log__description";
      description.textContent = mission.description;

      const reward = document.createElement("span");
      reward.className = "mission-log__reward";
      reward.textContent = `+${mission.xp} EXP`;

      content.append(name, description, reward);
      item.append(status, content);
      missionList.append(item);
    }
  };

  const scheduleMissionRender = createFrameScheduler((missionState) => {
    applyMissionState(missionState);
  });

  const appearanceSection = document.createElement("div");
  appearanceSection.className = "appearance-section";

  const appearanceHeader = document.createElement("div");
  appearanceHeader.className = "appearance-header";
  const appearanceTitle = document.createElement("span");
  appearanceTitle.textContent = "Appearance";
  appearanceTitle.className = "appearance-title";
  const customizeButton = document.createElement("button");
  customizeButton.type = "button";
  customizeButton.className = "appearance-button";
  customizeButton.textContent = "Customize";
  appearanceHeader.append(appearanceTitle, customizeButton);
  appearanceSection.append(appearanceHeader);

  const appearancePreview = document.createElement("p");
  appearancePreview.className = "appearance-preview";
  appearanceSection.append(appearancePreview);

  const previewSwatches = document.createElement("div");
  previewSwatches.className = "appearance-swatches";
  const previewSwatchElements = {};
  for (const key of ["hair", "skin", "shirt"]) {
    const swatch = document.createElement("span");
    swatch.className = `appearance-swatch appearance-swatch--${key}`;
    swatch.title = `${key.charAt(0).toUpperCase()}${key.slice(1)} color`;
    previewSwatches.append(swatch);
    previewSwatchElements[key] = swatch;
  }
  appearanceSection.append(previewSwatches);

  const appearanceControls = document.createElement("div");
  appearanceControls.className = "appearance-controls";
  const colorButtonRegistry = {
    hair: [],
    skin: [],
    shirt: []
  };

  for (const [key, options] of Object.entries(appearanceOptions)) {
    const row = document.createElement("div");
    row.className = "appearance-row";
    const label = document.createElement("span");
    label.className = "appearance-row__label";
    label.textContent = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    const optionGroup = document.createElement("div");
    optionGroup.className = "appearance-row__options";

    for (const color of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "appearance-color";
      button.style.setProperty("--appearance-color", color);
      button.title = `${label.textContent}: ${color}`;
      button.addEventListener("click", () => {
        appearance[key] = color;
        const matchedIndex = findPresetIndex(appearance);
        currentAppearancePresetIndex = matchedIndex >= 0 ? matchedIndex : -1;
        saveAppearance(appearance, currentAppearancePresetIndex);
        updateAppearancePreview();
      });
      optionGroup.append(button);
      colorButtonRegistry[key].push({ color, element: button });
    }

    row.append(label, optionGroup);
    appearanceControls.append(row);
  }

  appearanceSection.append(appearanceControls);

  customizeButton.addEventListener("click", () => {
    const nextIndex =
      currentAppearancePresetIndex >= 0
        ? (currentAppearancePresetIndex + 1) % appearancePresets.length
        : 0;
    const preset = appearancePresets[nextIndex];
    appearance.hair = preset.hair;
    appearance.skin = preset.skin;
    appearance.shirt = preset.shirt;
    currentAppearancePresetIndex = nextIndex;
    saveAppearance(appearance, currentAppearancePresetIndex);
    updateAppearancePreview();
  });

  const instructions = document.createElement("ul");
  instructions.className = "instruction-list";
  instructions.innerHTML = `
    <li>Move with A/D or ←/→</li>
    <li>Jump with Space or W/↑</li>
    <li>Press E near objects to interact</li>
  `;
  panel.append(appearanceSection, instructions);

  root.append(canvasWrapper, panel);

  updateAppearancePreview();

  return {
    root,
    canvasWrapper,
    canvasSurface,
    promptText: "",
    refresh(updatedStats) {
      const subtitleParts = [];
      if (updatedStats.handle) {
        subtitleParts.push(updatedStats.handle);
      }
      subtitleParts.push(
        `${updatedStats.name} — Level ${updatedStats.level} ${updatedStats.rank}`
      );
      subtitle.textContent = subtitleParts.join(" · ");
      updateBar(hpBar, updatedStats.hp, updatedStats.maxHp);
      updateBar(mpBar, updatedStats.mp, updatedStats.maxMp);
      updateBar(expBar, updatedStats.exp, updatedStats.maxExp);
      const portalCleared = updatedStats.level >= portalLevelRequirement;
      missionRequirement.classList.toggle("is-complete", portalCleared);
      if (portalCleared) {
        missionRequirement.textContent =
          "Portal clearance secured. Charge it to travel onward.";
      } else {
        missionRequirement.textContent =
          portalLevelRequirement > 1
            ? `Reach Level ${portalLevelRequirement} to unlock the portal.`
            : "Charge the portal to travel onward.";
      }
    },
    updateCrystals(collected, total) {
      crystalsLabel.textContent = `Crystals collected: ${collected} / ${total}`;
    },
    setMessage(text, meta = {}) {
      const resolvedText = text ?? "";
      message.textContent = resolvedText;
      const channel = meta.channel ?? "mission";
      const author = meta.author ?? (channel === "friend" ? "Crewmate" : "Mission Command");
      const silent = Boolean(meta.silent);
      const shouldAnimate = Boolean(
        meta.animate ?? (!silent && Boolean(resolvedText))
      );
      const shouldLog = Boolean(meta.log);
      if (shouldAnimate) {
        chatBoard.presentMascot({
          text: resolvedText,
          author,
          channel,
          duration: meta.duration
        });
      } else if (silent || !resolvedText) {
        chatBoard.hideMascot();
      }
      if (shouldLog && resolvedText) {
        chatBoard.addMessage({
          text: resolvedText,
          author,
          channel,
          timestamp: meta.timestamp
        });
      }
    },
    setPrompt(text) {
      this.promptText = text;
    },
    setAccount(account, starter) {
      updateAccountCard(account, starter);
      updateCommsInterface(account?.callSign);
    },
    updateMissions(missionState) {
      const snapshot = Array.isArray(missionState)
        ? missionState.map((mission) => ({ ...mission }))
        : [];
      scheduleMissionRender(snapshot);
    },
    addFeedMessage(entry) {
      if (!entry || typeof entry !== "object") {
        return;
      }
      chatBoard.addMessage(entry);
    }
  };

  function createChatBoardSection() {
    const section = document.createElement("section");
    section.className = "chat-board";

    const header = document.createElement("div");
    header.className = "chat-board__header";

    const titleElement = document.createElement("h2");
    titleElement.className = "chat-board__title";
    titleElement.textContent = "Mission Feed";

    const legend = document.createElement("div");
    legend.className = "chat-board__legend";
    legend.append(
      createLegendBadge("mission", "Mission Command"),
      createLegendBadge("friend", "Friends")
    );

    header.append(titleElement, legend);

    const mascotStage = document.createElement("div");
    mascotStage.className = "chat-board__mascot";
    mascotStage.dataset.channel = "mission";

    const mascotFigure = document.createElement("div");
    mascotFigure.className = "chat-board__mascot-figure";

    const mascotAvatar = document.createElement("div");
    mascotAvatar.className = "chat-board__mascot-avatar";

    const mascotImage = document.createElement("img");
    mascotImage.className = "chat-board__mascot-image";
    mascotImage.alt = "Mission mascot";
    mascotImage.decoding = "async";
    mascotImage.hidden = true;

    const mascotPlaceholder = document.createElement("span");
    mascotPlaceholder.className = "chat-board__mascot-placeholder";
    mascotPlaceholder.textContent = "MC";

    mascotAvatar.append(mascotImage, mascotPlaceholder);
    mascotFigure.append(mascotAvatar);

    const bubble = document.createElement("div");
    bubble.className = "chat-board__bubble";
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");

    const bubbleLabel = document.createElement("span");
    bubbleLabel.className = "chat-board__bubble-label";
    bubbleLabel.textContent = "Mission Command";

    const bubbleText = document.createElement("p");
    bubbleText.className = "chat-board__bubble-text";
    bubbleText.textContent = "";

    bubble.append(bubbleLabel, bubbleText);
    mascotStage.append(mascotFigure, bubble);

    const list = document.createElement("ul");
    list.className = "chat-board__list";

    const emptyState = document.createElement("li");
    emptyState.className = "chat-board__empty";
    emptyState.textContent = "No transmissions yet. Tune in for updates.";
    list.append(emptyState);

    section.append(header, mascotStage, list);

    let hideTimer = 0;

    function presentMascot({ text, author, channel, duration }) {
      if (!text) {
        hideMascot();
        return;
      }
      const resolvedChannel = channel ?? "mission";
      const resolvedAuthor =
        author ?? (resolvedChannel === "friend" ? "Crewmate" : "Mission Command");
      bubbleLabel.textContent = resolvedAuthor;
      bubbleText.textContent = text;
      mascotStage.dataset.channel = resolvedChannel;
      mascotStage.classList.add("is-active");
      mascotPlaceholder.textContent = computeInitials(resolvedAuthor);
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
      const timeout = typeof duration === "number" && duration > 0 ? duration : 5200;
      hideTimer = window.setTimeout(() => {
        hideMascot();
      }, timeout);
    }

    function hideMascot() {
      mascotStage.classList.remove("is-active");
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
      }
    }

    function addMessage({ text, author, channel, timestamp }) {
      if (!text) {
        return;
      }
      if (emptyState.isConnected) {
        emptyState.remove();
      }
      const resolvedChannel = channel ?? "mission";
      const resolvedAuthor =
        author ?? (resolvedChannel === "friend" ? "Crewmate" : "Mission Command");

      const item = document.createElement("li");
      item.className = "chat-board__item";
      item.dataset.channel = resolvedChannel;

      const metaRow = document.createElement("div");
      metaRow.className = "chat-board__meta";

      const authorElement = document.createElement("span");
      authorElement.className = "chat-board__author";
      authorElement.textContent = resolvedAuthor;

      const timeElement = document.createElement("time");
      timeElement.className = "chat-board__time";
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp ?? Date.now());
      timeElement.dateTime = date.toISOString();
      timeElement.textContent = formatTimestamp(date);

      metaRow.append(authorElement, timeElement);

      const body = document.createElement("p");
      body.className = "chat-board__message";
      body.textContent = text;

      item.append(metaRow, body);
      list.append(item);

      const maxItems = 8;
      while (list.children.length > maxItems) {
        const firstItem = list.firstElementChild;
        if (!firstItem) {
          break;
        }
        list.removeChild(firstItem);
      }
    }

    function updateMascotSprite() {
      if (mascotSprite && mascotSprite.image && mascotSprite.image.src) {
        mascotImage.src = mascotSprite.image.src;
        mascotImage.hidden = false;
        mascotPlaceholder.hidden = true;
      }
    }

    if (mascotSprite && mascotSprite.image) {
      if (mascotSprite.isReady()) {
        updateMascotSprite();
      } else {
        mascotSprite.image.addEventListener("load", updateMascotSprite, { once: true });
      }
    }

    return {
      root: section,
      presentMascot,
      hideMascot,
      addMessage
    };

    function createLegendBadge(channel, label) {
      const badge = document.createElement("span");
      badge.className = `chat-board__badge chat-board__badge--${channel}`;
      badge.textContent = label;
      return badge;
    }

    function computeInitials(source) {
      if (!source) {
        return "MC";
      }
      const trimmed = source.trim();
      if (!trimmed) {
        return "MC";
      }
      if (trimmed.startsWith("@")) {
        return trimmed.slice(0, 2).toUpperCase();
      }
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
      }
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    function formatTimestamp(date) {
      const hours = `${date.getHours()}`.padStart(2, "0");
      const minutes = `${date.getMinutes()}`.padStart(2, "0");
      return `${hours}:${minutes}`;
    }
  }

  function updateAppearancePreview() {
    const presetLabel =
      currentAppearancePresetIndex >= 0
        ? appearancePresets[currentAppearancePresetIndex].label
        : "Custom Palette";
    appearancePreview.textContent = `Palette: ${presetLabel}`;

    for (const [key, swatch] of Object.entries(previewSwatchElements)) {
      swatch.style.setProperty("--appearance-color", appearance[key]);
    }

    for (const [key, buttons] of Object.entries(colorButtonRegistry)) {
      for (const { color, element } of buttons) {
        if (appearance[key] === color) {
          element.classList.add("is-selected");
        } else {
          element.classList.remove("is-selected");
        }
      }
    }
  }

  function createStatBar(labelText, fillColor) {
    const row = document.createElement("div");
    row.className = "stat-row";

    const label = document.createElement("span");
    label.className = "stat-label";
    label.textContent = labelText;
    row.append(label);

    const bar = document.createElement("div");
    bar.className = "stat-bar";
    const fill = document.createElement("div");
    fill.className = "stat-bar__fill";
    fill.style.background = fillColor;
    bar.append(fill);
    row.append(bar);

    const value = document.createElement("span");
    value.className = "stat-value";
    row.append(value);

    statsContainer.append(row);

    return { fill, value };
  }

  function updateBar(bar, current, max) {
    const clamped = clamp(current, 0, max);
    const percent = max === 0 ? 0 : (clamped / max) * 100;
    bar.fill.style.width = `${percent}%`;
    bar.value.textContent = `${Math.round(clamped)} / ${Math.round(max)}`;
  }

  function updateAccountActions(isLoggedIn) {
    if (isLoggedIn) {
      loginButton.textContent = "Switch account";
      logoutButton.hidden = false;
    } else {
      loginButton.textContent = "Log in";
      logoutButton.hidden = true;
    }
  }

  function updateAccountCard(account, starterOverride) {
    const fallbackStarter = starterOverride ?? starterCharacters[0];

    if (!account) {
      accountCard.classList.add("account-card--empty");
      accountHandle.textContent = "Call sign: -----";
      accountCatName.textContent = "Name your Astrocat to begin your mission.";
      accountStarterImage.src = fallbackStarter.image;
      accountStarterImage.alt = fallbackStarter.name;
      accountStarterName.textContent = fallbackStarter.name;
      accountStarterTagline.textContent = fallbackStarter.tagline;
      updateAccountActions(false);
      return;
    }

    const resolvedStarter = starterOverride ?? findStarterCharacter(account.starterId);
    accountCard.classList.remove("account-card--empty");
    const callSignLabel = account.callSign ? `@${account.callSign}` : account.handle;
    accountHandle.textContent = callSignLabel ? `Call sign: ${callSignLabel}` : "Call sign: -----";
    accountCatName.textContent = account.catName;
    accountStarterImage.src = resolvedStarter.image;
    accountStarterImage.alt = resolvedStarter.name;
    accountStarterName.textContent = resolvedStarter.name;
    accountStarterTagline.textContent = resolvedStarter.tagline;
    updateAccountActions(true);
  }
}
