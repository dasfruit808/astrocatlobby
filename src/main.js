import { startGameLoop } from "./game/loop.js";
import {
  createUpdate,
  wrapOffset,
  getWorldOffsetsAround as computeWorldOffsetsAround,
  getWorldWrapOffsetsForView as computeWorldWrapOffsetsForView,
  isNear
} from "./game/update.js";
import {
  createRender,
  queueEffect,
  createJumpDustEffect,
  createCrystalBurstEffect,
  createPortalActivationEffect,
  createScreenShakeEffect
} from "./game/render.js";
import {
  getPhantomProvider,
  isPhantomInstalled,
  connectPhantomWallet,
  disconnectPhantomWallet,
  attachAccountChangeListener,
  formatWalletAddress,
  getPhantomInstallUrl
} from "./wallet/phantom.js";
import { installRuntimeShims } from "./runtime/shims.js";

import {
  applyPageBackgroundFromUrl,
  applyToolbarBackground,
  attachToolbarBrandImage,
  backgroundImageUrl,
  backgroundVideoSources,
  createAssetManifestFromPublicManifest,
  getCustomPageBackgroundUrl,
  initializeCanvasBackgroundVideo,
  normaliseHrefForDirectory,
  normalisePathnameForDirectory,
  parallaxLayerSources,
  readFromAssetManifest,
  resolvePublicAssetUrl,
  shouldUseCustomPageBackground
} from "./ui/background.js";

const runtimeGlobal = installRuntimeShims();

// The mini game entry point that loads inside the arcade cabinet overlay.
function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    value = Number.isFinite(min) ? min : 0;
  }

  if (Number.isFinite(min)) {
    value = Math.max(min, value);
  }

  if (Number.isFinite(max)) {
    value = Math.min(max, value);
  }

  return value;
}

function warnImportMetaGlobUnavailable(scope) {
  if (typeof console === "undefined") {
    return;
  }

  const scopeSuffix = scope ? ` for ${scope}` : "";
  console.warn(`import.meta.glob is unavailable${scopeSuffix}. Falling back to dynamic loading.`);
}

let assetManifest = null;
try {
  if (
    typeof import.meta !== "object" ||
    !import.meta ||
    typeof import.meta.glob !== "function"
  ) {
    throw new TypeError("import.meta.glob is unavailable");
  }

  assetManifest = import.meta.glob("./assets/*.{png,PNG}", {
    eager: true,
    import: "default"
  });

  if (!assetManifest || typeof assetManifest !== "object") {
    warnImportMetaGlobUnavailable("sprite assets");
  }
} catch (error) {
  warnImportMetaGlobUnavailable("sprite assets");
  if (typeof console !== "undefined" && error) {
    console.warn(
      "import.meta.glob failed while loading sprite assets. Falling back to dynamic loading.",
      error
    );
  }
  assetManifest = null;
}

if (!assetManifest) {
  assetManifest = createAssetManifestFromPublicManifest({
    extensions: [".png", ".PNG", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".avif"]
  });
}

let audioManifest = null;
try {
  if (
    typeof import.meta !== "object" ||
    !import.meta ||
    typeof import.meta.glob !== "function"
  ) {
    throw new TypeError("import.meta.glob is unavailable");
  }

  audioManifest = import.meta.glob("./assets/audio/*.{mp3,ogg,m4a,webm}", {
    eager: true,
    import: "default"
  });

  if (!audioManifest || typeof audioManifest !== "object") {
    warnImportMetaGlobUnavailable("audio assets");
  }
} catch (error) {
  warnImportMetaGlobUnavailable("audio assets");
  if (typeof console !== "undefined" && error) {
    console.warn(
      "import.meta.glob failed while loading audio assets. Falling back to dynamic loading.",
      error
    );
  }
  audioManifest = null;
}

if (!audioManifest) {
  audioManifest = createAssetManifestFromPublicManifest({
    extensions: [".mp3", ".ogg", ".m4a", ".webm"]
  });
}

function normaliseMiniGameEntryPoint(entry) {
  if (!entry) {
    return null;
  }

  const trimmed = `${entry}`.trim();
  if (!trimmed) {
    return null;
  }

  const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  if (hasExplicitProtocol || trimmed.startsWith("//")) {
    return trimmed;
  }

  if (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return `./${trimmed}`;
}

function resolveMiniGameEntryPoint() {
  const resolvedEntry = resolvePublicAssetUrl("AstroCats3/index.html");
  const normalisedEntry = normaliseMiniGameEntryPoint(resolvedEntry);

  if (normalisedEntry && normalisedEntry !== "/") {
    if (typeof window !== "undefined" && window.location) {
      try {
        const entryUrl = new URL(normalisedEntry, window.location.href);
        const directoryPath = normalisePathnameForDirectory(window.location.pathname ?? "/");

        if (
          directoryPath !== "/" &&
          entryUrl.origin === window.location.origin &&
          !entryUrl.pathname.startsWith(directoryPath)
        ) {
          const baseHref = normaliseHrefForDirectory(window.location.href);
          if (baseHref) {
            const correctedUrl = new URL(normalisedEntry, baseHref);
            return correctedUrl.toString();
          }
        }
      } catch (error) {
        if (typeof console !== "undefined" && error) {
          console.warn(
            "Failed to normalise mini game entry point against current location.",
            error
          );
        }
      }
    }

    return normalisedEntry;
  }

  console.warn(
    "Falling back to a relative AstroCats3 mini game entry point. Ensure public/AstroCats3/index.html is reachable from the current path."
  );
  try {
    const UrlConstructor = runtimeGlobal?.URL;
    if (typeof UrlConstructor === "function") {
      const fallbackEntry = new UrlConstructor(
        "../AstroCats3/index.html",
        import.meta.url
      ).toString();
      return fallbackEntry;
    }
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      console.warn("Failed to resolve AstroCats3 mini game relative to the current module.", error);
    }
  }
  return "./AstroCats3/index.html";
}

function createMiniGameEntryCandidates() {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (entry) => {
    const normalised = normaliseMiniGameEntryPoint(entry);
    if (!normalised || seen.has(normalised)) {
      return;
    }
    seen.add(normalised);
    candidates.push(normalised);
  };

  addCandidate(resolveMiniGameEntryPoint());
  addCandidate(resolvePublicAssetUrl("public/AstroCats3/index.html"));
  addCandidate("./AstroCats3/index.html");
  addCandidate("./public/AstroCats3/index.html");

  return candidates;
}

const miniGameEntryCandidates = createMiniGameEntryCandidates();
let miniGameEntryCandidateIndex = miniGameEntryCandidates.length > 0 ? 0 : -1;
let miniGameEntryPoint =
  miniGameEntryCandidateIndex >= 0
    ? miniGameEntryCandidates[miniGameEntryCandidateIndex]
    : "./AstroCats3/index.html";

if (miniGameEntryCandidateIndex < 0) {
  miniGameEntryCandidates.push(miniGameEntryPoint);
  miniGameEntryCandidateIndex = 0;
}

let miniGameOrigin = "";
let miniGameEntryAvailabilityProbe = null;

function computeMiniGameOrigin(entryPoint = miniGameEntryPoint) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return new URL(entryPoint, window.location.href).origin;
  } catch (error) {
    return window.location.origin;
  }
}

const inlineMiniGameEntryCache = new Map();
const inlineMiniGameEntryRequests = new Map();
let inlineMiniGameEntryAssignmentToken = 0;

function shouldInlineMiniGameEntry(entry) {
  if (typeof window === "undefined" || !entry) {
    return false;
  }

  if (window.location?.protocol !== "file:") {
    return false;
  }

  try {
    const entryUrl = new URL(entry, window.location.href);
    return entryUrl.protocol === "file:";
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      console.warn("Failed to parse mini game entry for inline fallback.", error);
    }
    return false;
  }
}

async function fetchInlineMiniGameSource(entryUrl) {
  const urlAsString = entryUrl.toString();

  if (inlineMiniGameEntryCache.has(urlAsString)) {
    return inlineMiniGameEntryCache.get(urlAsString);
  }

  if (inlineMiniGameEntryRequests.has(urlAsString)) {
    return inlineMiniGameEntryRequests.get(urlAsString);
  }

  const run = async () => {
    const baseHref = new URL("./", entryUrl).href;

    const injectBaseHref = (markup) => {
      if (!markup) {
        return "";
      }

      const baseTag = `<base href="${baseHref}">`;

      if (/<base\s/i.test(markup)) {
        return markup;
      }

      if (/<head[>\s]/i.test(markup)) {
        return markup.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
      }

      return `${baseTag}${markup}`;
    };

    const loadViaFetch = async () => {
      if (typeof fetch !== "function") {
        return null;
      }

      try {
        const response = await fetch(urlAsString, { cache: "no-store" });
        if (response?.ok) {
          const markup = await response.text();
          return injectBaseHref(markup);
        }
      } catch (error) {
        if (typeof console !== "undefined" && error) {
          console.warn("Failed to fetch mini game entry for inline fallback.", error);
        }
      }

      return null;
    };

    const loadViaXmlHttpRequest = async () => {
      if (typeof XMLHttpRequest !== "function") {
        return null;
      }

      try {
        const markup = await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("GET", urlAsString, true);
          request.responseType = "text";
          request.overrideMimeType?.("text/html");
          request.addEventListener("load", () => {
            if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
              resolve(request.responseText ?? "");
              return;
            }
            reject(new Error(`Unexpected status code ${request.status}`));
          });
          request.addEventListener("error", () => {
            reject(new Error("Failed to load mini game entry via XMLHttpRequest."));
          });
          request.send();
        });

        return injectBaseHref(markup);
      } catch (error) {
        if (typeof console !== "undefined" && error) {
          console.warn(
            "Failed to retrieve mini game entry via XMLHttpRequest for inline fallback.",
            error
          );
        }
      }

      return null;
    };

    const markup = (await loadViaFetch()) ?? (await loadViaXmlHttpRequest());

    if (markup) {
      inlineMiniGameEntryCache.set(urlAsString, markup);
    }

    return markup ?? "";
  };

  const request = run().finally(() => {
    inlineMiniGameEntryRequests.delete(urlAsString);
  });

  inlineMiniGameEntryRequests.set(urlAsString, request);

  return request;
}

function applyMiniGameFrameSource(entry) {
  if (!miniGameOverlayState?.frame) {
    return;
  }

  const frame = miniGameOverlayState.frame;
  const requestToken = ++inlineMiniGameEntryAssignmentToken;

  const applyDirectSource = () => {
    if (inlineMiniGameEntryAssignmentToken !== requestToken) {
      return;
    }
    frame.removeAttribute("srcdoc");
    frame.src = entry;
  };

  if (!shouldInlineMiniGameEntry(entry)) {
    applyDirectSource();
    return;
  }

  try {
    const entryUrl = new URL(entry, window.location.href);
    fetchInlineMiniGameSource(entryUrl)
      .then((markup) => {
        if (inlineMiniGameEntryAssignmentToken !== requestToken) {
          return;
        }

        if (markup) {
          frame.removeAttribute("src");
          frame.srcdoc = markup;
        } else {
          applyDirectSource();
        }
      })
      .catch(applyDirectSource);
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      console.warn("Failed to resolve mini game entry URL for inline fallback.", error);
    }
    applyDirectSource();
  }
}

function updateMiniGameEntryPointTargets(entry = miniGameEntryPoint) {
  applyMiniGameFrameSource(entry);

  if (miniGameOverlayState?.supportLink) {
    miniGameOverlayState.supportLink.href = entry;
  }
}

function advanceMiniGameEntryPoint() {
  for (
    let index = Math.max(0, miniGameEntryCandidateIndex + 1);
    index < miniGameEntryCandidates.length;
    index += 1
  ) {
    const candidate = miniGameEntryCandidates[index];
    if (!candidate || candidate === miniGameEntryPoint) {
      continue;
    }

    miniGameEntryCandidateIndex = index;
    miniGameEntryPoint = candidate;
    updateMiniGameEntryPointTargets(candidate);
    miniGameOrigin = computeMiniGameOrigin(candidate);
    return candidate;
  }

  return null;
}

function ensureMiniGameEntryPointAvailability() {
  if (miniGameEntryAvailabilityProbe) {
    return miniGameEntryAvailabilityProbe;
  }

  if (typeof fetch !== "function") {
    miniGameEntryAvailabilityProbe = Promise.resolve(miniGameEntryPoint);
    return miniGameEntryAvailabilityProbe;
  }

  miniGameEntryAvailabilityProbe = (async () => {
    for (let index = 0; index < miniGameEntryCandidates.length; index += 1) {
      const candidate = miniGameEntryCandidates[index];
      if (!candidate) {
        continue;
      }

      try {
        const response = await fetch(candidate, { method: "HEAD", cache: "no-store" });
        if (response?.ok) {
          if (miniGameEntryPoint !== candidate) {
            miniGameEntryCandidateIndex = index;
            miniGameEntryPoint = candidate;
            updateMiniGameEntryPointTargets(candidate);
            miniGameOrigin = computeMiniGameOrigin(candidate);
            if (typeof console !== "undefined") {
              console.info("Resolved AstroCats3 mini game entry point.", candidate);
            }
          }
          return candidate;
        }
      } catch (error) {
        if (typeof console !== "undefined" && error) {
          console.warn("Failed to probe AstroCats3 mini game entry point.", candidate, error);
        }
      }
    }

    return miniGameEntryPoint;
  })();

  return miniGameEntryAvailabilityProbe;
}

function applyCustomPageBackground() {
  if (typeof document === "undefined") {
    return;
  }

  const run = () => {
    const { body } = document;
    if (!body) {
      return;
    }

    const applyFallbackBackground = () => {
      applyPageBackgroundFromUrl(body, null);
    };

    applyFallbackBackground();

    shouldUseCustomPageBackground().then((shouldApply) => {
      if (!shouldApply) {
        applyFallbackBackground();
        return;
      }

      const pageBackground = new Image();
      pageBackground.decoding = "async";

      const handleLoad = () => {
        const resolvedUrl = pageBackground.currentSrc || pageBackground.src;
        applyPageBackgroundFromUrl(body, resolvedUrl);
      };

      const handleError = () => {
        applyFallbackBackground();
      };

      pageBackground.addEventListener("load", handleLoad, { once: true });
      pageBackground.addEventListener("error", handleError, { once: true });
      const backgroundUrl = getCustomPageBackgroundUrl();
      if (!backgroundUrl) {
        applyFallbackBackground();
        return;
      }
      pageBackground.src = backgroundUrl;
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

applyCustomPageBackground();

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
  let pendingSources = [];
  let currentSource = "";
  const attemptedSources = new Set();

  function markReady() {
    ready = true;
    pendingSources = [];
    currentSource = "";
  }

  function logSourceFailure(source) {
    if (!source || attemptedSources.has(source)) {
      return;
    }
    attemptedSources.add(source);
    console.warn(`Failed to load sprite asset at ${source}. Attempting fallback for ${assetPath}.`);
  }

  function handleFatalError() {
    ready = false;
    if (!warned) {
      console.warn(
        `Failed to load sprite asset at ${assetPath}. Falling back to canvas drawing.`
      );
      warned = true;
    }
  }

  function tryNextSource() {
    if (pendingSources.length === 0) {
      currentSource = "";
      handleFatalError();
      return;
    }

    const nextSource = pendingSources.shift();
    if (!nextSource) {
      tryNextSource();
      return;
    }

    ready = false;
    currentSource = nextSource;
    image.src = nextSource;
    if (image.complete && image.naturalWidth > 0) {
      markReady();
    }
  }

  function handleError() {
    if (currentSource) {
      logSourceFailure(currentSource);
    }

    if (pendingSources.length > 0) {
      tryNextSource();
      return;
    }

    handleFatalError();
  }

  image.addEventListener("load", markReady);
  image.addEventListener("error", handleError);

  return {
    image,
    markReady,
    handleError,
    setSource(source) {
      attemptedSources.clear();
      warned = false;

      if (Array.isArray(source)) {
        pendingSources = source
          .filter((candidate, index, all) => {
            return typeof candidate === "string" && candidate && all.indexOf(candidate) === index;
          })
          .map((candidate) => `${candidate}`);
      } else if (typeof source === "string" && source) {
        pendingSources = [source];
      } else {
        pendingSources = [];
      }

      if (pendingSources.length === 0) {
        handleFatalError();
        return;
      }

      tryNextSource();
    },
    isReady: () => ready
  };
}

function createOptionalSprite(assetPath) {
  if (assetManifest) {
    const source = readFromAssetManifest(assetManifest, assetPath);
    if (!source) {
      return createOptionalSpriteWithoutManifest(assetPath);
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
  const spriteState = createSpriteState(assetPath);

  const normalizedPath = typeof assetPath === "string" ? assetPath.replace(/^\.\//, "") : "";
  const resolvedFromPublic = resolvePublicAssetUrl(normalizedPath);
  const candidates = [];

  if (typeof resolvedFromPublic === "string" && resolvedFromPublic) {
    if (
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(resolvedFromPublic) ||
      resolvedFromPublic.startsWith("//") ||
      resolvedFromPublic.startsWith("/")
    ) {
      candidates.push(resolvedFromPublic);
    } else {
      try {
        const absolutePublic = new URL(resolvedFromPublic, import.meta.url).href;
        candidates.push(absolutePublic);
      } catch (error) {
        candidates.push(resolvedFromPublic);
      }
    }
  }

  let moduleRelative = null;
  try {
    moduleRelative = new URL(assetPath, import.meta.url).href;
  } catch (error) {
    if (candidates.length === 0) {
      console.warn(`Failed to resolve sprite asset at ${assetPath}`, error);
    }
  }

  if (moduleRelative && candidates.indexOf(moduleRelative) < 0) {
    candidates.push(moduleRelative);
  }

  const uniqueCandidates = candidates.filter((candidate, index, list) => {
    return typeof candidate === "string" && candidate && list.indexOf(candidate) === index;
  });

  if (uniqueCandidates.length === 0) {
    return createEmptySprite();
  }

  spriteState.setSource(uniqueCandidates);

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

const AudioContextConstructor =
  typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext
    : typeof globalThis !== "undefined"
      ? globalThis.AudioContext || globalThis.webkitAudioContext
      : undefined;

let sharedAudioContext = null;

function getSharedAudioContext() {
  if (!AudioContextConstructor) {
    return null;
  }

  if (!sharedAudioContext) {
    try {
      sharedAudioContext = new AudioContextConstructor();
    } catch (error) {
      console.warn("Unable to create AudioContext", error);
      sharedAudioContext = null;
    }
  }

  return sharedAudioContext;
}

function resumeSharedAudioContext() {
  const context = getSharedAudioContext();
  if (!context || typeof context.resume !== "function") {
    return Promise.resolve();
  }

  if (context.state === "suspended") {
    return context.resume().catch(() => {});
  }

  return Promise.resolve();
}

function normalizeAudioCandidates(assetCandidates) {
  if (Array.isArray(assetCandidates)) {
    return assetCandidates
      .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
      .filter((candidate) => candidate.length > 0);
  }

  if (typeof assetCandidates === "string") {
    const trimmed = assetCandidates.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function resolveAudioSource(assetPath) {
  if (typeof assetPath !== "string" || !assetPath) {
    return null;
  }

  if (audioManifest) {
    const resolvedFromManifest = readFromAssetManifest(audioManifest, assetPath);
    if (resolvedFromManifest) {
      return resolvedFromManifest;
    }
  }

  const normalizedPath = assetPath.replace(/^\.\//, "");
  const resolvedFromPublic = resolvePublicAssetUrl(normalizedPath);
  if (typeof resolvedFromPublic === "string" && resolvedFromPublic) {
    if (
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(resolvedFromPublic) ||
      resolvedFromPublic.startsWith("//") ||
      resolvedFromPublic.startsWith("/")
    ) {
      return resolvedFromPublic;
    }

    try {
      return new URL(resolvedFromPublic, import.meta.url).href;
    } catch (error) {
      // Fall through to attempt resolving from the module path directly.
    }
  }

  try {
    return new URL(assetPath, import.meta.url).href;
  } catch (error) {
    console.warn(`Failed to resolve audio asset at ${assetPath}`, error);
    return null;
  }
}

function resolveAudioFromCandidates(candidateList) {
  for (const candidate of candidateList) {
    const resolved = resolveAudioSource(candidate);
    if (resolved) {
      return { resolved, original: candidate };
    }
  }
  return null;
}

function createSynthEffectHandle(config = {}) {
  const settings = {
    attack: 0.015,
    decay: 0.12,
    sustain: 0.35,
    release: 0.3,
    duration: 0.45,
    frequency: 440,
    endFrequency: null,
    type: "sine",
    volume: 0.6,
    partials: null,
    ...config
  };

  let baseVolume = Math.min(Math.max(settings.volume, 0), 1);

  return {
    play() {
      const context = getSharedAudioContext();
      if (!context) {
        return;
      }

      resumeSharedAudioContext();

      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(baseVolume, now + settings.attack);
      gain.gain.linearRampToValueAtTime(baseVolume * settings.sustain, now + settings.attack + settings.decay);
      const releaseTime = Math.max(settings.duration, settings.attack + settings.decay + settings.release);
      gain.gain.linearRampToValueAtTime(0, now + releaseTime);

      gain.connect(context.destination);

      const stopTime = now + releaseTime + 0.05;
      const partials = Array.isArray(settings.partials) && settings.partials.length > 0
        ? settings.partials
        : [
            {
              frequency: settings.frequency,
              endFrequency: settings.endFrequency,
              type: settings.type,
              detune: settings.detune,
              gain: 1
            }
          ];

      for (const partial of partials) {
        const oscillator = context.createOscillator();
        oscillator.type = partial.type ?? settings.type;
        const startFrequency = Math.max(partial.frequency ?? settings.frequency, 1);
        oscillator.frequency.setValueAtTime(startFrequency, now);
        if (typeof partial.endFrequency === "number" && partial.endFrequency > 0) {
          oscillator.frequency.linearRampToValueAtTime(Math.max(partial.endFrequency, 1), now + settings.duration);
        }
        if (typeof partial.detune === "number") {
          oscillator.detune.setValueAtTime(partial.detune, now);
        }

        const partialGain = context.createGain();
        const partialVolume = Math.min(Math.max(partial.gain ?? 1, 0), 1);
        partialGain.gain.setValueAtTime(partialVolume, now);

        oscillator.connect(partialGain);
        partialGain.connect(gain);

        oscillator.start(now);
        oscillator.stop(stopTime);
        oscillator.addEventListener("ended", () => {
          try {
            oscillator.disconnect();
          } catch (error) {
            /* Ignore disconnect issues on older browsers. */
          }
          try {
            partialGain.disconnect();
          } catch (error) {
            /* Ignore disconnect issues on older browsers. */
          }
        });
      }

      setTimeout(() => {
        try {
          gain.disconnect();
        } catch (error) {
          /* Ignore disconnect issues on older browsers. */
        }
      }, Math.max((stopTime - now) * 1000 + 50, 0));
    },
    stop() {},
    setVolume(value) {
      baseVolume = Math.min(Math.max(value, 0), 1);
    },
    isReady: () => Boolean(getSharedAudioContext()),
    element: null
  };
}

function createAmbientLoopHandle(config = {}) {
  const settings = {
    volume: 0.35,
    layers: [
      { frequency: 110, type: "sine", detune: -4, gain: 0.3 },
      { frequency: 220, type: "triangle", detune: 6, gain: 0.22 },
      { frequency: 330, type: "sine", detune: -11, gain: 0.18 }
    ],
    ...config
  };

  let masterGain = null;
  let oscillators = [];
  let active = false;
  let baseVolume = Math.min(Math.max(settings.volume, 0), 1);

  const ensureNodes = () => {
    const context = getSharedAudioContext();
    if (!context) {
      return null;
    }

    if (!masterGain) {
      masterGain = context.createGain();
      masterGain.gain.setValueAtTime(baseVolume, context.currentTime);
      masterGain.connect(context.destination);
    }

    return context;
  };

  const tearDown = (stopTime) => {
    for (const { oscillator, gain } of oscillators) {
      try {
        gain.gain.cancelScheduledValues(stopTime);
        gain.gain.setValueAtTime(gain.gain.value, stopTime);
        gain.gain.linearRampToValueAtTime(0, stopTime + 0.3);
      } catch (error) {
        /* Ignore gain scheduling issues. */
      }
      try {
        oscillator.stop(stopTime + 0.35);
      } catch (error) {
        /* Ignore stop errors for already-ended oscillators. */
      }
      try {
        oscillator.disconnect();
      } catch (error) {
        /* Ignore disconnect issues. */
      }
      try {
        gain.disconnect();
      } catch (error) {
        /* Ignore disconnect issues. */
      }
    }
    oscillators = [];
    active = false;
  };

  return {
    play({ restart = true } = {}) {
      const context = ensureNodes();
      if (!context) {
        return;
      }

      resumeSharedAudioContext();

      if (active && !restart) {
        return;
      }

      const now = context.currentTime;
      tearDown(now);

      oscillators = settings.layers.map((layer, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = layer.type;
        oscillator.frequency.setValueAtTime(Math.max(layer.frequency, 1), now);
        if (typeof layer.detune === "number") {
          oscillator.detune.setValueAtTime(layer.detune, now);
        }

        const layerGain = context.createGain();
        const layerVolume = Math.min(Math.max(layer.gain, 0), 1);
        layerGain.gain.setValueAtTime(0, now);
        const attackTime = 2 + index * 0.5;
        layerGain.gain.linearRampToValueAtTime(layerVolume, now + attackTime);
        oscillator.connect(layerGain);
        layerGain.connect(masterGain);

        oscillator.start(now);
        return { oscillator, gain: layerGain };
      });

      active = true;
    },
    stop() {
      const context = masterGain ? masterGain.context : null;
      const stopTime = context ? context.currentTime : 0;
      tearDown(stopTime);
    },
    setVolume(value) {
      const context = masterGain ? masterGain.context : getSharedAudioContext();
      baseVolume = Math.min(Math.max(value, 0), 1);
      if (masterGain && context) {
        try {
          masterGain.gain.cancelScheduledValues(context.currentTime);
          masterGain.gain.setValueAtTime(baseVolume, context.currentTime);
        } catch (error) {
          masterGain.gain.value = baseVolume;
        }
      }
    },
    isReady: () => Boolean(getSharedAudioContext()),
    element: null
  };
}

function createOptionalAudio(assetCandidates, options = {}) {
  const { onMissing, ...rawSettings } = options;
  const candidateList = normalizeAudioCandidates(assetCandidates);
  const settings = {
    loop: Boolean(rawSettings.loop),
    volume: rawSettings.volume ?? 1,
    playbackRate: rawSettings.playbackRate ?? 1
  };

  if (typeof Audio === "undefined") {
    if (typeof onMissing === "function") {
      const fallback = onMissing({ candidates: candidateList, settings });
      if (fallback) {
        return fallback;
      }
    }
    return createSilentAudioHandle();
  }

  const resolved = resolveAudioFromCandidates(candidateList);
  if (!resolved) {
    if (typeof onMissing === "function") {
      const fallback = onMissing({ candidates: candidateList, settings });
      if (fallback) {
        return fallback;
      }
    }

    const reference = candidateList[0] ?? "sound";
    console.info(
      `Audio asset missing for ${reference}. Add an .mp3, .ogg, or .m4a file with the same name in src/assets/audio to enable this sound.`
    );
    return createSilentAudioHandle();
  }

  const element = new Audio();
  let warned = false;
  let ready = false;

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
        `Failed to load audio asset at ${resolved.original}. Add the matching .mp3 or .ogg file in src/assets/audio to enable this sound.`
      );
      warned = true;
    }
  };

  element.addEventListener("canplaythrough", markReady, { once: true });
  element.addEventListener("error", handleError);

  element.src = resolved.resolved;
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
  const audioExtensions = [".mp3", ".ogg", ".m4a", ".webm"];
  const buildAudioSources = (basename) =>
    audioExtensions.map((extension) => `./assets/audio/${basename}${extension}`);

  const soundMap = {
    // Drop .mp3, .ogg, or .m4a files into src/assets/audio using these paths
    // or update the mapping below to match your filenames.
    background: {
      sources: buildAudioSources("background"),
      loop: true,
      volume: 0.38,
      onMissing({ settings }) {
        return createAmbientLoopHandle({ volume: settings.volume });
      }
    },
    jump: {
      sources: buildAudioSources("jump"),
      volume: 0.55,
      onMissing() {
        return createSynthEffectHandle({
          type: "square",
          frequency: 880,
          endFrequency: 660,
          duration: 0.18,
          sustain: 0.2,
          volume: 0.45
        });
      }
    },
    crystal: {
      sources: buildAudioSources("crystal"),
      volume: 0.62,
      onMissing() {
        return createSynthEffectHandle({
          type: "sine",
          frequency: 1200,
          endFrequency: 1800,
          duration: 0.6,
          sustain: 0.25,
          release: 0.4,
          volume: 0.5,
          partials: [
            { frequency: 1200, endFrequency: 1800, gain: 0.6 },
            { frequency: 1800, endFrequency: 2200, gain: 0.4 }
          ]
        });
      }
    },
    chestOpen: {
      sources: buildAudioSources("chest"),
      volume: 0.6,
      onMissing() {
        return createSynthEffectHandle({
          type: "sawtooth",
          frequency: 260,
          endFrequency: 180,
          duration: 0.5,
          sustain: 0.18,
          volume: 0.42,
          partials: [
            { frequency: 260, endFrequency: 180, gain: 0.8 },
            { frequency: 390, endFrequency: 260, gain: 0.4 }
          ]
        });
      }
    },
    fountain: {
      sources: buildAudioSources("fountain"),
      volume: 0.6,
      onMissing() {
        return createAmbientLoopHandle({
          volume: 0.28,
          layers: [
            { frequency: 240, type: "sine", detune: -15, gain: 0.25 },
            { frequency: 320, type: "sine", detune: 8, gain: 0.18 },
            { frequency: 520, type: "triangle", detune: 4, gain: 0.14 }
          ]
        });
      }
    },
    dialogue: {
      sources: buildAudioSources("dialogue"),
      volume: 0.45,
      onMissing() {
        return createSynthEffectHandle({
          type: "triangle",
          frequency: 640,
          duration: 0.22,
          sustain: 0.1,
          release: 0.2,
          volume: 0.4
        });
      }
    },
    portalCharge: {
      sources: buildAudioSources("portal-charge"),
      volume: 0.65,
      onMissing() {
        return createSynthEffectHandle({
          type: "sine",
          frequency: 200,
          endFrequency: 960,
          duration: 1.2,
          sustain: 0.4,
          release: 0.6,
          volume: 0.48,
          partials: [
            { frequency: 200, endFrequency: 640, gain: 0.5 },
            { frequency: 320, endFrequency: 960, gain: 0.35 },
            { frequency: 480, endFrequency: 1280, gain: 0.2 }
          ]
        });
      }
    },
    portalActivate: {
      sources: buildAudioSources("portal-activate"),
      volume: 0.7,
      onMissing() {
        return createSynthEffectHandle({
          type: "square",
          frequency: 520,
          endFrequency: 1040,
          duration: 0.35,
          sustain: 0.2,
          release: 0.25,
          volume: 0.55,
          partials: [
            { frequency: 520, endFrequency: 1040, gain: 0.6 },
            { frequency: 780, endFrequency: 1560, gain: 0.4 }
          ]
        });
      }
    },
    portalComplete: {
      sources: buildAudioSources("portal-complete"),
      volume: 0.7,
      onMissing() {
        return createSynthEffectHandle({
          type: "sine",
          frequency: 720,
          endFrequency: 540,
          duration: 0.6,
          sustain: 0.25,
          release: 0.4,
          volume: 0.5,
          partials: [
            { frequency: 720, endFrequency: 540, gain: 0.7 },
            { frequency: 1080, endFrequency: 810, gain: 0.3 }
          ]
        });
      }
    },
    levelUp: {
      sources: buildAudioSources("level-up"),
      volume: 0.68,
      onMissing() {
        return createSynthEffectHandle({
          type: "triangle",
          frequency: 660,
          endFrequency: 1320,
          duration: 0.75,
          sustain: 0.3,
          release: 0.5,
          volume: 0.55,
          partials: [
            { frequency: 660, endFrequency: 1320, gain: 0.6 },
            { frequency: 990, endFrequency: 1485, gain: 0.4 }
          ]
        });
      }
    }
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
    const handle = createOptionalAudio(config.sources ?? config.path, config);
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
    resumeSharedAudioContext();
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
const arcadeSprite = createOptionalSprite("./assets/ArcadeSprite.png");

const app = document.querySelector("#app");
if (!app) {
  throw new Error("Missing #app container");
}

const audio = createAudioManager();
audio.playBackground();

const parallaxLayers = parallaxLayerSources.map((layer) => {
  const image = new Image();
  const layerState = {
    ...layer,
    image,
    ready: false,
    dimensions: { width: 0, height: 0 }
  };
  const markReady = () => {
    layerState.ready = true;
    layerState.dimensions = {
      width: image.naturalWidth || baseCanvasWidth,
      height: image.naturalHeight || baseCanvasHeight
    };
  };
  const markError = () => {
    layerState.ready = false;
    layerState.dimensions = { width: 0, height: 0 };
    console.warn(`Parallax layer failed to load: ${layer.source}`);
  };
  image.addEventListener("load", markReady);
  image.addEventListener("error", markError);
  image.src = layer.source;
  if (image.complete && image.naturalWidth > 0) {
    markReady();
  }
  return layerState;
});
// The lobby previously applied a subtle idle scroll to the parallax background to
// keep the scene feeling lively. Disable that behaviour so the background stays
// perfectly still unless future updates explicitly change parallaxScroll.
const PARALLAX_IDLE_SCROLL_SPEED = 0;
let parallaxScroll = 0;
let cameraScrollX = 0;

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
      <path d="M88 118 Q88 128 78 132" stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none" />
      <path d="M104 118 Q104 128 114 132" stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none" />
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function resolveStarterImageSource(assetPaths, fallbackPalette) {
  const candidatePaths = Array.isArray(assetPaths) ? assetPaths : [assetPaths];

  for (const candidate of candidatePaths) {
    if (assetManifest) {
      const resolvedFromManifest = readFromAssetManifest(assetManifest, candidate);
      if (resolvedFromManifest) {
        return resolvedFromManifest;
      }
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
  const candidatePaths = Array.isArray(assetPaths) ? assetPaths : [assetPaths];
  const resolvedSources = [];

  for (const candidate of candidatePaths) {
    if (!candidate) {
      continue;
    }

    if (assetManifest) {
      const resolvedFromManifest = readFromAssetManifest(assetManifest, candidate);
      if (resolvedFromManifest) {
        resolvedSources.push(resolvedFromManifest);
        continue;
      }
    }

    try {
      const resolvedUrl = new URL(candidate, import.meta.url).href;
      resolvedSources.push(resolvedUrl);
    } catch (error) {
      console.warn(
        `Failed to resolve starter sprite asset at ${candidate}. Continuing to next candidate.`,
        error
      );
    }
  }

  const fallbackSource = createStarterSpriteDataUrl(fallbackPalette);
  if (!resolvedSources.includes(fallbackSource)) {
    resolvedSources.push(fallbackSource);
  }

  return resolvedSources.filter((candidate, index, all) => {
    return typeof candidate === "string" && candidate && all.indexOf(candidate) === index;
  });
}

const defaultStarterDefinition = {
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
  },
  recommendedAllocation: {
    agility: 2,
    focus: 2,
    strength: 1,
    vitality: 1
  }
};

const starterDefinitions = [
  defaultStarterDefinition,
  {
    id: "lunar-oracle",
    name: "Lunar Oracle",
    tagline: "A mystic seer attuned to cosmic energies.",
    description: "Channels lunar wisdom for enhanced focus and shields.",
    imageAssets: "./assets/characrter2.png",
    spriteAssets: [
      "./assets/playersprite2.png",
      "./assets/characrter2.png"
    ],
    palette: {
      background: "#2a225a",
      body: "#7f5af0",
      accent: "#fee440",
      accessory: "#ff6ac1",
      eye: "#1b1d3a",
      highlight: "#cddafd"
    },
    recommendedAllocation: {
      focus: 3,
      vitality: 2,
      agility: 1
    }
  },
  {
    id: "meteor-warden",
    name: "Meteor Warden",
    tagline: "A steadfast guardian forged in stardust.",
    description: "Tanks incoming damage with reinforced armor plating.",
    imageAssets: "./assets/character3.png",
    spriteAssets: [
      "./assets/playersprite3.png",
      "./assets/character3.png"
    ],
    palette: {
      background: "#201f3d",
      body: "#4cc9f0",
      accent: "#4361ee",
      accessory: "#ffb703",
      eye: "#1b1d3a",
      highlight: "#90e0ef"
    },
    recommendedAllocation: {
      vitality: 3,
      strength: 3
    }
  }
];

const starterCharacters = starterDefinitions.map((definition) => ({
  id: definition.id,
  name: definition.name,
  tagline: definition.tagline,
  description: definition.description,
  image: resolveStarterImageSource(definition.imageAssets, definition.palette),
  sprite: resolveStarterSpriteSource(
    definition.spriteAssets ?? definition.imageAssets,
    definition.palette
  ),
  palette: definition.palette,
  recommendedAllocation: definition.recommendedAllocation ?? null
}));

const starterCharactersById = new Map();
for (const character of starterCharacters) {
  if (character?.id) {
    starterCharactersById.set(character.id, character);
  }
}

const defaultStarterCharacter =
  starterCharactersById.get(defaultStarterDefinition.id) ?? starterCharacters[0];

const legacyAccountStorageKey = "astrocat-account";
const accountStorageKey = "astrocat-accounts";
const callSignRegistryKey = "astrocat-call-signs";
const messageBoardStorageKey = "astrocat-message-boards";
const lobbyLayoutStorageKey = "astrocat-lobby-layout-v1";
const callSignLength = 5;

function isValidStarterId(value) {
  return typeof value === "string" && starterCharactersById.has(value);
}

let savedLobbyLayout = null;
let hasCustomLobbyLayout = false;

let storedAccounts = {};
let activeAccountCallSign = null;
let layoutEditor = null;
let ui = null;

let walletProviderInstance = null;
let walletAccountChangeUnsubscribe = null;
let activeWalletAddress = null;
let suppressWalletAccountChange = false;

const MOVEMENT_HINT_STORAGE_KEY = "astrocatlobby.movementHintAcknowledged";
const MOVEMENT_HINT_IDLE_THRESHOLD = 5200;
let movementHintIdleTime = 0;
let movementHintVisible = false;
let movementHintAcknowledged = false;
let movementHintShownThisSession = false;

{
  const storage = getLocalStorage();
  if (storage && storage.getItem(MOVEMENT_HINT_STORAGE_KEY) === "1") {
    movementHintAcknowledged = true;
    movementHintShownThisSession = true;
  }
}

function persistMovementHintAcknowledged() {
  if (!movementHintAcknowledged) {
    return;
  }

  const storage = getLocalStorage();
  try {
    storage?.setItem(MOVEMENT_HINT_STORAGE_KEY, "1");
  } catch (error) {
    console.warn("Failed to store movement hint acknowledgment", error);
  }
}

function dismissMovementHint() {
  if (!movementHintVisible) {
    return;
  }

  if (ui && typeof ui.hideMovementHint === "function") {
    ui.hideMovementHint();
  }
  movementHintVisible = false;
  movementHintIdleTime = 0;
}

function acknowledgeMovementHint() {
  if (!movementHintAcknowledged) {
    movementHintAcknowledged = true;
    movementHintShownThisSession = true;
    persistMovementHintAcknowledged();
  }
  movementHintIdleTime = 0;
  dismissMovementHint();
}

function createCallSignExample() {
  const digits = "1234567890";
  let sequence = "";
  while (sequence.length < callSignLength) {
    const remaining = callSignLength - sequence.length;
    sequence += digits.slice(0, Math.min(digits.length, remaining));
  }
  return `@${sequence.slice(0, callSignLength)}`;
}

const callSignExample = createCallSignExample();
const callSignMentionPattern = new RegExp(`@(\\d{${callSignLength}})\\b`);

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (!storage) {
      return null;
    }

    const testKey = "__astrocat-storage-test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);

    return storage;
  } catch (error) {
    console.warn("Local storage is unavailable", error);
    return null;
  }
}

function isValidCallSign(value) {
  return typeof value === "string" && new RegExp(`^\\d{${callSignLength}}$`).test(value);
}

function extractMentionedCallSign(message) {
  if (typeof message !== "string") {
    return null;
  }

  const match = message.match(callSignMentionPattern);
  return match ? match[1] : null;
}

function sanitizeLobbyLayoutSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const sanitizeCoordinate = (value) =>
    typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

  const sanitized = {};

  if (snapshot.interactables && typeof snapshot.interactables === "object") {
    const entries = [];
    for (const [id, value] of Object.entries(snapshot.interactables)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const x = sanitizeCoordinate(value.x);
      const y = sanitizeCoordinate(value.y);
      if (x === null && y === null) {
        continue;
      }
      const normalizedId = typeof id === "string" ? id : String(id);
      const entry = {};
      if (x !== null) {
        entry.x = x;
      }
      if (y !== null) {
        entry.y = y;
      }
      entries.push([normalizedId, entry]);
    }

    if (entries.length > 0) {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      const interactables = {};
      for (const [id, entry] of entries) {
        interactables[id] = entry;
      }
      sanitized.interactables = interactables;
    }
  }

  if (snapshot.platforms && typeof snapshot.platforms === "object") {
    const entries = [];
    for (const [id, value] of Object.entries(snapshot.platforms)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const x = sanitizeCoordinate(value.x);
      const y = sanitizeCoordinate(value.y);
      if (x === null && y === null) {
        continue;
      }
      const normalizedId = typeof id === "string" ? id : String(id);
      const entry = {};
      if (x !== null) {
        entry.x = x;
      }
      if (y !== null) {
        entry.y = y;
      }
      entries.push([normalizedId, entry]);
    }

    if (entries.length > 0) {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      const platformEntries = {};
      for (const [id, entry] of entries) {
        platformEntries[id] = entry;
      }
      sanitized.platforms = platformEntries;
    }
  }

  if (snapshot.portal && typeof snapshot.portal === "object") {
    const portalX = sanitizeCoordinate(snapshot.portal.x);
    const portalY = sanitizeCoordinate(snapshot.portal.y);
    if (portalX !== null || portalY !== null) {
      sanitized.portal = {};
      if (portalX !== null) {
        sanitized.portal.x = portalX;
      }
      if (portalY !== null) {
        sanitized.portal.y = portalY;
      }
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
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

function loadLobbyLayoutSnapshot() {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(lobbyLayoutStorageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return sanitizeLobbyLayoutSnapshot(parsed);
  } catch (error) {
    console.warn("Failed to read saved lobby layout", error);
    return null;
  }
}

function saveLobbyLayoutSnapshot(layout) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    const sanitized = sanitizeLobbyLayoutSnapshot(layout);
    if (!sanitized) {
      return clearLobbyLayoutSnapshot();
    }

    storage.setItem(lobbyLayoutStorageKey, JSON.stringify(sanitized));
    savedLobbyLayout = JSON.parse(JSON.stringify(sanitized));
    hasCustomLobbyLayout = true;
    updateActiveAccountLobbyLayout(sanitized);
    return true;
  } catch (error) {
    console.warn("Failed to persist lobby layout", error);
    return false;
  }
}

function clearLobbyLayoutSnapshot() {
  const storage = getLocalStorage();
  if (!storage) {
    savedLobbyLayout = null;
    hasCustomLobbyLayout = false;
    updateActiveAccountLobbyLayout(null);
    return false;
  }

  try {
    storage.removeItem(lobbyLayoutStorageKey);
    savedLobbyLayout = null;
    hasCustomLobbyLayout = false;
    updateActiveAccountLobbyLayout(null);
    return true;
  } catch (error) {
    console.warn("Failed to clear lobby layout", error);
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

const defaultAccountLevel = 1;
const maxAccountLevel = 999;
const defaultAccountExp = 0;
const maxAccountExp = Number.MAX_SAFE_INTEGER;

function normalizeAccountLevel(value) {
  if (!Number.isFinite(value)) {
    return defaultAccountLevel;
  }

  const floored = Math.floor(value);
  if (!Number.isFinite(floored)) {
    return defaultAccountLevel;
  }

  return Math.max(defaultAccountLevel, Math.min(maxAccountLevel, floored));
}

function normalizeAccountExp(value) {
  if (!Number.isFinite(value)) {
    return defaultAccountExp;
  }

  const floored = Math.floor(value);
  if (!Number.isFinite(floored)) {
    return defaultAccountExp;
  }

  return Math.max(defaultAccountExp, Math.min(maxAccountExp, floored));
}

function pickFiniteNumber(...candidates) {
  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function sanitizeAccount(source = {}) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const rawName = typeof source.catName === "string" ? source.catName.trim() : "";
  const name = rawName.replace(/\s+/g, " ").slice(0, 28);
  const requestedStarterId =
    typeof source.starterId === "string" && source.starterId
      ? source.starterId
      : typeof source.starter === "string"
        ? source.starter
        : null;
  const starterId = isValidStarterId(requestedStarterId)
    ? requestedStarterId
    : defaultStarterCharacter.id;

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

  const lobbyLayoutSnapshot = sanitizeLobbyLayoutSnapshot(
    source.lobbyLayout ?? source.layout ?? source.lobbyLayoutSnapshot
  );

  const rawLevel = pickFiniteNumber(
    source.level,
    source?.stats?.level,
    source?.profile?.level
  );
  const rawExp = pickFiniteNumber(
    source.exp,
    source?.xp,
    source?.experience,
    source?.stats?.exp,
    source?.stats?.experience
  );

  const account = {
    handle,
    callSign,
    catName: name,
    starterId,
    level: rawLevel === null ? defaultAccountLevel : normalizeAccountLevel(rawLevel),
    exp: rawExp === null ? defaultAccountExp : normalizeAccountExp(rawExp)
  };

  const walletAddressSource =
    typeof source.walletAddress === "string"
      ? source.walletAddress
      : typeof source.wallet?.address === "string"
        ? source.wallet.address
        : "";
  const normalizedWalletAddress = walletAddressSource.trim();
  if (normalizedWalletAddress) {
    account.walletAddress = normalizedWalletAddress.slice(0, 128);
    const walletTypeSource =
      typeof source.walletType === "string"
        ? source.walletType
        : typeof source.wallet?.type === "string"
          ? source.wallet.type
          : "";
    const normalizedType = walletTypeSource.trim().slice(0, 24).toLowerCase();
    if (normalizedType) {
      account.walletType = normalizedType;
    } else {
      account.walletType = "solana";
    }
  }

  if (lobbyLayoutSnapshot) {
    account.lobbyLayout = lobbyLayoutSnapshot;
  }

  const attributeSource =
    typeof source.attributes === "object"
      ? source.attributes
      : typeof source.attributeOverrides === "object"
        ? source.attributeOverrides
        : null;
  if (attributeSource) {
    const sanitizedAttributes = sanitizeAttributeValues(attributeSource);
    if (hasCustomAttributes(sanitizedAttributes)) {
      account.attributes = sanitizedAttributes;
    }
  }

  if (Number.isFinite(source.statPoints)) {
    account.statPoints = Math.max(0, Math.floor(source.statPoints));
  }

  return account;
}

function extractStoredCallSign(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  if (isValidCallSign(source.callSign)) {
    return source.callSign;
  }

  if (typeof source.handle === "string") {
    const digits = source.handle.replace(/^@+/, "");
    if (isValidCallSign(digits)) {
      return digits;
    }
  }

  return null;
}

function normalizeStoredAccountPayload(payload) {
  const accounts = {};
  const originalToSanitized = new Map();
  let fallbackActive = null;

  const candidates = [];
  if (Array.isArray(payload)) {
    candidates.push(...payload);
  } else if (payload && typeof payload === "object") {
    if (Array.isArray(payload.accounts)) {
      candidates.push(...payload.accounts);
    } else if (payload.accounts && typeof payload.accounts === "object") {
      candidates.push(...Object.values(payload.accounts));
    } else {
      candidates.push(payload);
    }
  } else if (payload) {
    candidates.push(payload);
  }

  for (const candidate of candidates) {
    const sanitized = sanitizeAccount(candidate);
    if (!sanitized) {
      continue;
    }
    const original = extractStoredCallSign(candidate);
    if (original && original !== sanitized.callSign) {
      originalToSanitized.set(original, sanitized.callSign);
    }
    accounts[sanitized.callSign] = sanitized;
    if (!fallbackActive) {
      fallbackActive = sanitized.callSign;
    }
  }

  let activeCallSign = null;
  const hasExplicitNullActive =
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "activeCallSign") &&
    payload.activeCallSign === null;
  const requestedActive =
    payload && typeof payload === "object" && typeof payload.activeCallSign === "string"
      ? payload.activeCallSign
      : null;
  if (requestedActive) {
    const mapped = originalToSanitized.get(requestedActive) ?? requestedActive;
    if (mapped && accounts[mapped]) {
      activeCallSign = mapped;
    }
  }

  if (!activeCallSign && !hasExplicitNullActive && fallbackActive && accounts[fallbackActive]) {
    activeCallSign = fallbackActive;
  }

  return { accounts, activeCallSign };
}

function buildAccountPayload(accounts, activeCallSign) {
  const sortedAccounts = {};
  const keys = Object.keys(accounts).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const entry = accounts[key];
    if (!entry) {
      continue;
    }
    sortedAccounts[key] = {
      handle: entry.handle,
      callSign: entry.callSign,
      catName: entry.catName,
      starterId: entry.starterId,
      level: normalizeAccountLevel(entry.level),
      exp: normalizeAccountExp(entry.exp)
    };

    const layoutSnapshot = sanitizeLobbyLayoutSnapshot(entry.lobbyLayout);
    if (layoutSnapshot) {
      sortedAccounts[key].lobbyLayout = layoutSnapshot;
    }
    if (hasCustomAttributes(entry.attributes)) {
      sortedAccounts[key].attributes = sanitizeAttributeValues(entry.attributes);
    }
    if (Number.isFinite(entry.statPoints)) {
      sortedAccounts[key].statPoints = Math.max(0, Math.floor(entry.statPoints));
    }

    if (typeof entry.walletAddress === "string" && entry.walletAddress) {
      sortedAccounts[key].walletAddress = entry.walletAddress;
      if (typeof entry.walletType === "string" && entry.walletType) {
        sortedAccounts[key].walletType = entry.walletType;
      }
    }
  }

  return {
    version: 1,
    activeCallSign: activeCallSign ?? null,
    accounts: sortedAccounts
  };
}

function persistStoredAccounts() {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    const accountKeys = Object.keys(storedAccounts);
    if (accountKeys.length === 0) {
      storage.removeItem(accountStorageKey);
    } else {
      const payload = buildAccountPayload(storedAccounts, activeAccountCallSign);
      storage.setItem(accountStorageKey, JSON.stringify(payload));
    }
    try {
      storage.removeItem(legacyAccountStorageKey);
    } catch (error) {
      console.warn("Failed to clear legacy account storage", error);
    }
    return true;
  } catch (error) {
    console.warn("Failed to persist account details", error);
    return false;
  }
}

function syncActiveAccountProgress() {
  if (!activeAccount) {
    return false;
  }

  const callSign = activeAccount.callSign ?? activeAccountCallSign;
  if (!callSign) {
    return false;
  }

  const normalizedLevel = Number.isFinite(playerStats?.level)
    ? Math.max(1, Math.floor(playerStats.level))
    : 1;
  const normalizedExp = Number.isFinite(playerStats?.exp)
    ? Math.max(0, playerStats.exp)
    : 0;
  const normalizedStatPoints = Number.isFinite(playerStats?.statPoints)
    ? Math.max(0, Math.floor(playerStats.statPoints))
    : 0;
  const sanitizedAttributes = sanitizeAttributeValues(playerStats?.attributes);

  playerStats.level = normalizedLevel;
  playerStats.exp = normalizedExp;
  playerStats.statPoints = normalizedStatPoints;
  playerStats.attributes = sanitizedAttributes;

  const progressUpdate = {
    level: normalizedLevel,
    exp: normalizedExp,
    statPoints: normalizedStatPoints,
    attributes: sanitizedAttributes
  };

  activeAccount = { ...activeAccount, ...progressUpdate };

  const existingStoredAccount = storedAccounts[callSign] ?? { callSign };
  storedAccounts = {
    ...storedAccounts,
    [callSign]: { ...existingStoredAccount, ...progressUpdate }
  };

  return persistStoredAccounts();
}

function updateActiveAccountLobbyLayout(snapshot) {
  const callSign = activeAccountCallSign;
  if (!callSign || !storedAccounts[callSign]) {
    return false;
  }

  const sanitized = sanitizeLobbyLayoutSnapshot(snapshot);
  const existingLayout = storedAccounts[callSign]?.lobbyLayout ?? null;
  const existingSerialized = existingLayout ? JSON.stringify(existingLayout) : null;
  const nextSerialized = sanitized ? JSON.stringify(sanitized) : null;

  if (existingSerialized === nextSerialized) {
    return false;
  }

  const currentAccount = storedAccounts[callSign];
  if (!currentAccount) {
    return false;
  }

  if (sanitized) {
    storedAccounts[callSign] = { ...currentAccount, lobbyLayout: sanitized };
  } else {
    const { lobbyLayout: _omit, ...rest } = currentAccount;
    storedAccounts[callSign] = { ...rest };
  }

  if (activeAccount && activeAccount.callSign === callSign) {
    if (sanitized) {
      activeAccount = { ...activeAccount, lobbyLayout: sanitized };
    } else {
      const { lobbyLayout: _remove, ...restActive } = activeAccount;
      activeAccount = { ...restActive };
    }
  }

  persistStoredAccounts();
  refreshStoredAccountDirectory();
  return true;
}

function rememberAccount(account, options = {}) {
  const explicitLevel = pickFiniteNumber(
    account?.level,
    account?.stats?.level,
    account?.profile?.level
  );
  const explicitExp = pickFiniteNumber(
    account?.exp,
    account?.xp,
    account?.experience,
    account?.stats?.exp,
    account?.stats?.experience
  );

  const sanitized = sanitizeAccount(account);
  if (!sanitized) {
    return null;
  }

  const originalCallSign = extractStoredCallSign(account);
  if (originalCallSign && originalCallSign !== sanitized.callSign) {
    delete storedAccounts[originalCallSign];
  }

  const existing = storedAccounts[sanitized.callSign];
  if (existing) {
    if (!Number.isFinite(explicitLevel) && Number.isFinite(existing.level)) {
      sanitized.level = normalizeAccountLevel(existing.level);
    }

    if (!Number.isFinite(explicitExp) && Number.isFinite(existing.exp)) {
      sanitized.exp = normalizeAccountExp(existing.exp);
    }

    if (!sanitized.walletAddress && typeof existing.walletAddress === "string") {
      sanitized.walletAddress = existing.walletAddress;
      if (typeof existing.walletType === "string" && existing.walletType) {
        sanitized.walletType = existing.walletType;
      }
    }
  }

  if (sanitized.walletAddress && !sanitized.walletType) {
    sanitized.walletType = "solana";
  }

  storedAccounts[sanitized.callSign] = sanitized;

  if (options.setActive !== false) {
    activeAccountCallSign = sanitized.callSign;
  }

  registerCallSign(sanitized.callSign);
  return sanitized;
}

function normalizeWalletAddress(address) {
  if (typeof address !== "string") {
    return "";
  }
  const trimmed = address.trim();
  return trimmed ? trimmed.slice(0, 128) : "";
}

function findStoredAccountByWalletAddress(address) {
  const normalized = normalizeWalletAddress(address);
  if (!normalized) {
    return null;
  }

  for (const account of Object.values(storedAccounts)) {
    if (!account || typeof account !== "object") {
      continue;
    }
    const candidate = normalizeWalletAddress(account.walletAddress);
    if (candidate && candidate === normalized) {
      return account;
    }
  }

  return null;
}

function createWalletDisplayName(address) {
  const normalized = normalizeWalletAddress(address);
  if (!normalized) {
    return "Starbound Pilot";
  }
  const previewLength = 4;
  const start = normalized.slice(0, previewLength);
  const end = normalized.slice(-previewLength);
  return `Pilot ${start}-${end}`;
}

function ensureAccountForWalletAddress(address) {
  const normalized = normalizeWalletAddress(address);
  if (!normalized) {
    return null;
  }

  const existing = findStoredAccountByWalletAddress(normalized);
  if (existing) {
    const hydrated = {
      ...existing,
      walletAddress: normalized,
      walletType: existing.walletType || "solana"
    };
    storedAccounts[hydrated.callSign] = hydrated;
    return hydrated;
  }

  const generatedCallSign = generateCallSignCandidate();
  const newAccount = rememberAccount(
    {
      catName: createWalletDisplayName(normalized),
      callSign: generatedCallSign,
      starterId: defaultStarterCharacter.id,
      level: 1,
      exp: 0,
      statPoints: getStatPointsForLevel(1),
      walletAddress: normalized,
      walletType: "solana"
    },
    { setActive: false }
  );

  return newAccount;
}

function getStoredAccountsSnapshot() {
  return Object.values(storedAccounts)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => {
      const nameCompare = a.catName.localeCompare(b.catName, undefined, { sensitivity: "base" });
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.callSign.localeCompare(b.callSign);
    });
}

function loadStoredAccount() {
  storedAccounts = {};
  activeAccountCallSign = null;

  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  let rawPayload = null;
  let usedLegacyKey = false;

  try {
    rawPayload = storage.getItem(accountStorageKey);
    if (!rawPayload) {
      rawPayload = storage.getItem(legacyAccountStorageKey);
      usedLegacyKey = Boolean(rawPayload);
    }
  } catch (error) {
    console.warn("Failed to read stored account information", error);
    rawPayload = null;
  }

  if (!rawPayload) {
    if (usedLegacyKey) {
      try {
        storage.removeItem(legacyAccountStorageKey);
      } catch (error) {
        console.warn("Failed to remove legacy account record", error);
      }
    }
    return null;
  }

  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch (error) {
    console.warn("Failed to parse stored account information", error);
    parsedPayload = null;
  }

  const normalized = normalizeStoredAccountPayload(parsedPayload);
  storedAccounts = normalized.accounts;
  activeAccountCallSign = normalized.activeCallSign;

  const accountKeys = Object.keys(storedAccounts);
  if (accountKeys.length === 0) {
    persistStoredAccounts();
    return null;
  }

  let activeAccount =
    activeAccountCallSign && storedAccounts[activeAccountCallSign]
      ? storedAccounts[activeAccountCallSign]
      : null;

  if (!activeAccount && activeAccountCallSign) {
    const fallbackKey = accountKeys[0];
    activeAccount = storedAccounts[fallbackKey];
    activeAccountCallSign = activeAccount?.callSign ?? null;
  }

  if (!activeAccount) {
    persistStoredAccounts();
    return null;
  }

  const payload = buildAccountPayload(storedAccounts, activeAccountCallSign);
  const serialized = JSON.stringify(payload);

  if (usedLegacyKey || serialized !== rawPayload) {
    try {
      storage.setItem(accountStorageKey, serialized);
    } catch (error) {
      console.warn("Failed to persist migrated account records", error);
    }
    if (usedLegacyKey) {
      try {
        storage.removeItem(legacyAccountStorageKey);
      } catch (error) {
        console.warn("Failed to remove legacy account record", error);
      }
    }
  }

  for (const entry of Object.values(storedAccounts)) {
    registerCallSign(entry.callSign);
  }

  return activeAccount ?? null;
}

function saveAccount(account, options = {}) {
  const remembered = rememberAccount(account, options);
  if (!remembered) {
    return false;
  }
  return persistStoredAccounts();
}

function clearStoredAccount(callSign = null) {
  storedAccounts = { ...storedAccounts };

  if (callSign) {
    if (!storedAccounts[callSign]) {
      return;
    }
    delete storedAccounts[callSign];
    if (activeAccountCallSign === callSign) {
      activeAccountCallSign = Object.keys(storedAccounts)[0] ?? null;
    }
    persistStoredAccounts();
    return;
  }

  storedAccounts = {};
  activeAccountCallSign = null;
  persistStoredAccounts();
}

const miniGameLoadoutStorageKey = "nyanEscape.customLoadouts";
const miniGameLoadoutVersion = 1;
const miniGameLoadoutSlots = [
  { slot: "slotA", defaultName: "Custom Loadout A" },
  { slot: "slotB", defaultName: "Custom Loadout B" }
];
const miniGameLoadoutSlotCatalog = miniGameLoadoutSlots.map((slot, index) => ({
  slot: typeof slot.slot === "string" ? slot.slot : `slot${index + 1}`,
  defaultName:
    typeof slot.defaultName === "string"
      ? slot.defaultName
      : `Custom Loadout ${index + 1}`,
  index
}));
const miniGameLoadoutSlotLookup = new Map(
  miniGameLoadoutSlotCatalog.map((meta) => [meta.slot, meta])
);

function resolveMiniGameLoadoutSlotMeta(slotId, fallbackIndex = 0) {
  if (slotId && miniGameLoadoutSlotLookup.has(slotId)) {
    return miniGameLoadoutSlotLookup.get(slotId);
  }

  return (
    miniGameLoadoutSlotCatalog[fallbackIndex] ?? {
      slot: slotId ?? `slot${fallbackIndex + 1}`,
      defaultName: `Custom Loadout ${fallbackIndex + 1}`,
      index: fallbackIndex
    }
  );
}
const miniGameMaxLoadoutNameLength = 32;

function resolvePanelSpriteAsset(relativePath) {
  const inputs = Array.isArray(relativePath) ? relativePath : [relativePath];
  const candidates = [];
  const seen = new Set();

  const enqueue = (candidate) => {
    const trimmed = `${candidate ?? ""}`.trim();
    if (!trimmed) {
      return;
    }

    const normalised = trimmed.replace(/^(?:\.\/)+/, "./");
    if (seen.has(normalised)) {
      return;
    }

    seen.add(normalised);
    candidates.push(normalised);
  };

  for (const input of inputs) {
    const trimmed = `${input ?? ""}`.trim();
    if (!trimmed) {
      continue;
    }

    if (/^(?:\.{0,2}\/|AstroCats3\/|public\/)/.test(trimmed)) {
      enqueue(trimmed);
      continue;
    }

    enqueue(`./assets/${trimmed}`);
    enqueue(`AstroCats3/assets/${trimmed}`);
  }

  const tryResolveCandidate = (candidate) => {
    if (assetManifest && typeof assetManifest === "object") {
      const resolved = readFromAssetManifest(assetManifest, candidate);
      if (typeof resolved === "string" && resolved) {
        return resolved;
      }
    }

    const resolvedFromPublic = resolvePublicAssetUrl(candidate);
    if (typeof resolvedFromPublic === "string" && resolvedFromPublic) {
      return resolvedFromPublic;
    }

    if (candidate.startsWith("./") || candidate.startsWith("../")) {
      try {
        return new URL(candidate, import.meta.url).href;
      } catch (error) {
        if (typeof console !== "undefined" && error) {
          console.warn(`Failed to resolve loadout art at ${candidate}`, error);
        }
      }
    }

    return "";
  };

  for (const candidate of candidates) {
    const resolved = tryResolveCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return "";
}

function createSvgDataUrl(svgMarkup) {
  if (typeof svgMarkup !== "string" || !svgMarkup.trim()) {
    return "";
  }

  const compact = svgMarkup
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
  return `data:image/svg+xml,${encodeURIComponent(compact)}`;
}

function createWeaponBadgeImage(id, palette) {
  if (!id || !palette) {
    return "";
  }

  const gradientId = `weapon-gradient-${id}`;
  const glowId = `weapon-glow-${id}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.backgroundStart}" />
          <stop offset="100%" stop-color="${palette.backgroundEnd}" />
        </linearGradient>
        <filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="4" y="4" width="152" height="112" rx="22" fill="url(#${gradientId})" opacity="0.95" />
      <rect x="10" y="10" width="140" height="100" rx="18" fill="${palette.innerBackground}" opacity="0.6" />
      <g filter="url(#${glowId})">
        <path d="M26 72 L120 34 C134 44 138 78 122 88 L30 106 Z" fill="${palette.beam}" opacity="0.9" />
        <path d="M38 64 C66 46 104 46 128 62 L128 78 C96 92 64 92 36 78 Z" fill="${palette.wave}" opacity="0.85" />
        <circle cx="46" cy="72" r="14" fill="${palette.core}" />
        <circle cx="116" cy="60" r="10" fill="${palette.focus}" />
        <path d="M40 86 C68 98 102 100 130 92" stroke="${palette.trace}" stroke-width="6" stroke-linecap="round" opacity="0.6" />
      </g>
    </svg>
  `;

  return createSvgDataUrl(svg);
}

const miniGameSpacecraftOptions = [
  {
    id: "nova",
    name: "Nova Skyrunner",
    role: "Versatile interceptor",
    summary:
      "A nimble frame ideal for first flights without sacrificing essential defenses.",
    positives: [
      "Responsive thrusters make evasive manoeuvres effortless",
      "Regenerative shields recover quickly between skirmishes"
    ],
    negatives: ["Light hull plating struggles against sustained impacts"],
    requiredLevel: 1,
    image: resolvePanelSpriteAsset(["playersprite1.png", "player.png"])
  },
  {
    id: "aurora",
    name: "Aurora Starweaver",
    role: "Long-range vanguard",
    summary:
      "Optimised for pilots who can read the battlefield and plan their approach.",
    positives: [
      "Expanded sensor suite spots distant hazards earlier",
      "Shield capacitors absorb powerful beam strikes"
    ],
    negatives: [
      "Slower acceleration requires deliberate positioning",
      "Unlocks after proving yourself in the field"
    ],
    requiredLevel: 5,
    image: resolvePanelSpriteAsset(["playersprite2.png", "player2.png"])
  },
  {
    id: "ember",
    name: "Ember Sunbreaker",
    role: "Siegebreak gunship",
    summary:
      "Built to punch through fortified lines when the mission stakes are highest.",
    positives: [
      "Overcharged cannons melt armour in record time",
      "Afterburners grant short bursts of unstoppable speed"
    ],
    negatives: [
      "High maintenance reactors drain energy reserves",
      "Requires elite clearance to command"
    ],
    requiredLevel: 8,
    image: resolvePanelSpriteAsset(["playersprite3.png", "player3.png"])
  }
];

const miniGameWeaponOptions = [
  {
    id: "pulse",
    name: "Pulse Array",
    summary: "Reliable dual-phase cannons engineered for steady clears.",
    classification: "Balanced burst",
    image: createWeaponBadgeImage("pulse", {
      backgroundStart: "#6ac9ff",
      backgroundEnd: "#2a5bff",
      innerBackground: "#09102a",
      beam: "#ffffff",
      wave: "#7fd4ff",
      core: "#ffccff",
      focus: "#ffe9a8",
      trace: "#91f1ff"
    })
  },
  {
    id: "scatter",
    name: "Scatter Volley",
    summary: "Triple-shot volley that carpets the lane with plasma.",
    classification: "Lane control",
    image: createWeaponBadgeImage("scatter", {
      backgroundStart: "#ff9cdc",
      backgroundEnd: "#ffb36b",
      innerBackground: "#230d2c",
      beam: "#ffe5f6",
      wave: "#ffcf99",
      core: "#fffae1",
      focus: "#ffb2f7",
      trace: "#ffd8ff"
    })
  },
  {
    id: "lance",
    name: "Photon Lance",
    summary: "Charged spear shot that pierces heavy armour and bosses.",
    classification: "Armor breaker",
    image: createWeaponBadgeImage("lance", {
      backgroundStart: "#b998ff",
      backgroundEnd: "#4732ff",
      innerBackground: "#140c2e",
      beam: "#f2ebff",
      wave: "#9ba8ff",
      core: "#ffd080",
      focus: "#fffbf2",
      trace: "#c8f0ff"
    })
  }
];

const miniGameSuitOptions = [
  { id: "default", name: "Aurora Standard" },
  { id: "midnight", name: "Midnight Mirage" },
  { id: "sunrise", name: "Solar Flare" }
];

const miniGameStreamOptions = [
  { id: "rainbow", name: "Spectrum Stream" },
  { id: "aurora", name: "Aurora Wake" },
  { id: "ember", name: "Ember Wake" },
  { id: "ion", name: "Ion Surge" },
  { id: "solstice", name: "Solstice Bloom" },
  { id: "quantum", name: "Quantum Drift" }
];

function createDefaultMiniGameLoadout(slotMeta, index = 0) {
  const resolvedMeta = resolveMiniGameLoadoutSlotMeta(slotMeta?.slot, slotMeta?.index ?? index);
  const slotIndex = typeof resolvedMeta.index === "number" ? resolvedMeta.index : index;
  const fallbackSlot = resolvedMeta.slot ?? `slot${slotIndex + 1}`;
  const fallbackName = resolvedMeta.defaultName ?? `Custom Loadout ${slotIndex + 1}`;
  return {
    slot: fallbackSlot,
    name: fallbackName,
    characterId: miniGameSpacecraftOptions[0]?.id ?? "nova",
    weaponId: miniGameWeaponOptions[0]?.id ?? "pulse",
    skinId: miniGameSuitOptions[0]?.id ?? "default",
    trailId: miniGameStreamOptions[0]?.id ?? "rainbow"
  };
}

function sanitizeMiniGameLoadoutOption(options, candidate, fallbackId) {
  if (!Array.isArray(options) || options.length === 0) {
    return fallbackId;
  }

  const match = options.find((option) => option.id === candidate);
  if (match) {
    return match.id;
  }

  const fallbackOption = options.find((option) => option.id === fallbackId);
  if (fallbackOption) {
    return fallbackOption.id;
  }

  return options[0].id;
}

function sanitizeMiniGameLoadout(entry, slotMeta, index) {
  const meta = resolveMiniGameLoadoutSlotMeta(slotMeta?.slot, slotMeta?.index ?? index);
  const fallback = createDefaultMiniGameLoadout(meta, meta.index ?? index);
  if (!entry || typeof entry !== "object") {
    return { ...fallback };
  }

  const slotId = meta.slot ?? fallback.slot;
  const defaultName = meta.defaultName ?? fallback.name;
  const rawName = typeof entry.name === "string" ? entry.name.trim() : "";
  const sanitizedName = rawName
    ? rawName.slice(0, miniGameMaxLoadoutNameLength)
    : defaultName;

  return {
    slot: slotId,
    name: sanitizedName,
    characterId: sanitizeMiniGameLoadoutOption(
      miniGameSpacecraftOptions,
      entry.characterId,
      fallback.characterId
    ),
    weaponId: sanitizeMiniGameLoadoutOption(
      miniGameWeaponOptions,
      entry.weaponId,
      fallback.weaponId
    ),
    skinId: sanitizeMiniGameLoadoutOption(
      miniGameSuitOptions,
      entry.skinId,
      fallback.skinId
    ),
    trailId: sanitizeMiniGameLoadoutOption(
      miniGameStreamOptions,
      entry.trailId,
      fallback.trailId
    )
  };
}

function sanitizeMiniGameLoadoutsState(state) {
  const slots = miniGameLoadoutSlotCatalog.map((slotMeta) => {
    const source = Array.isArray(state?.slots)
      ? state.slots.find((entry) => entry && entry.slot === slotMeta.slot) ?? state.slots[slotMeta.index]
      : null;
    return sanitizeMiniGameLoadout(source, slotMeta, slotMeta.index);
  });

  const availableSlots = new Set(slots.map((entry) => entry.slot));
  const requestedActiveSlot = typeof state?.activeSlot === "string" ? state.activeSlot : null;
  const fallbackSlot = slots[0]?.slot ?? null;
  const activeSlot =
    requestedActiveSlot && availableSlots.has(requestedActiveSlot)
      ? requestedActiveSlot
      : fallbackSlot;

  return { slots, activeSlot };
}

function loadMiniGameLoadoutsFromStorage() {
  const storage = getLocalStorage();
  if (!storage) {
    return sanitizeMiniGameLoadoutsState(null);
  }

  try {
    const raw = storage.getItem(miniGameLoadoutStorageKey);
    if (!raw) {
      return sanitizeMiniGameLoadoutsState(null);
    }

    const parsed = JSON.parse(raw);
    return sanitizeMiniGameLoadoutsState(parsed);
  } catch (error) {
    console.warn("Failed to read mini game loadouts", error);
    return sanitizeMiniGameLoadoutsState(null);
  }
}

function saveMiniGameLoadoutsToStorage(state) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    const sanitized = sanitizeMiniGameLoadoutsState(state);
    const payload = {
      version: miniGameLoadoutVersion,
      activeSlot: sanitized.activeSlot,
      slots: sanitized.slots.map((entry) => ({
        slot: entry.slot,
        name: entry.name,
        characterId: entry.characterId,
        weaponId: entry.weaponId,
        skinId: entry.skinId,
        trailId: entry.trailId
      }))
    };
    storage.setItem(miniGameLoadoutStorageKey, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn("Failed to persist mini game loadouts", error);
    return false;
  }
}

function isSameMiniGameLoadout(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    a.slot === b.slot &&
    a.name === b.name &&
    a.characterId === b.characterId &&
    a.weaponId === b.weaponId &&
    a.skinId === b.skinId &&
    a.trailId === b.trailId
  );
}

function getMiniGameLoadoutBySlot(slots, slotId) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return null;
  }

  if (slotId) {
    const match = slots.find((entry) => entry.slot === slotId);
    if (match) {
      return match;
    }
  }

  return slots[0];
}

function findStarterCharacter(starterId) {
  if (typeof starterId === "string" && starterCharactersById.has(starterId)) {
    return starterCharactersById.get(starterId);
  }
  return defaultStarterCharacter;
}

const attributeDefinitions = [
  {
    key: "vitality",
    label: "Vitality",
    description: "Raises maximum health and resilience.",
    base: 5
  },
  {
    key: "strength",
    label: "Strength",
    description: "Boosts physical attack power.",
    base: 5
  },
  {
    key: "agility",
    label: "Agility",
    description: "Improves movement speed and evasion.",
    base: 5
  },
  {
    key: "focus",
    label: "Focus",
    description: "Expands energy reserves for abilities.",
    base: 5
  }
];
function createInitialAttributeState() {
  const attributes = {};
  for (const definition of attributeDefinitions) {
    attributes[definition.key] = definition.base;
  }
  return attributes;
}

function sanitizeAttributeValues(source) {
  const attributes = createInitialAttributeState();
  if (!source || typeof source !== "object") {
    return attributes;
  }

  for (const definition of attributeDefinitions) {
    const rawValue = source[definition.key];
    if (Number.isFinite(rawValue)) {
      const normalized = Math.max(definition.base, Math.floor(rawValue));
      attributes[definition.key] = normalized;
    }
  }

  return attributes;
}

function hasCustomAttributes(attributes) {
  if (!attributes || typeof attributes !== "object") {
    return false;
  }

  const base = createInitialAttributeState();
  for (const definition of attributeDefinitions) {
    const value = attributes[definition.key];
    if (Number.isFinite(value) && Math.floor(value) !== base[definition.key]) {
      return true;
    }
  }

  return false;
}

function applyAttributeScaling(stats, options = {}) {
  if (!stats) {
    return;
  }

  if (!stats.attributes) {
    stats.attributes = createInitialAttributeState();
  }

  const attributes = stats.attributes;
  const vitality = attributes.vitality ?? attributeDefinitions[0].base;
  const strength = attributes.strength ?? attributeDefinitions[1].base;
  const agility = attributes.agility ?? attributeDefinitions[2].base;
  const focus = attributes.focus ?? attributeDefinitions[3].base;

  const preservePercent = options.preservePercent ?? true;
  const previousMaxHp = stats.maxHp ?? 0;
  const previousMaxMp = stats.maxMp ?? 0;
  const hpRatio =
    preservePercent && previousMaxHp > 0
      ? clamp(stats.hp ?? previousMaxHp, 0, previousMaxHp) / previousMaxHp
      : 1;
  const mpRatio =
    preservePercent && previousMaxMp > 0
      ? clamp(stats.mp ?? previousMaxMp, 0, previousMaxMp) / previousMaxMp
      : 1;

  const newMaxHp = 70 + vitality * 6;
  const newMaxMp = 30 + focus * 6;

  stats.maxHp = newMaxHp;
  stats.maxMp = newMaxMp;
  stats.hp = clamp(Math.round(newMaxHp * hpRatio), 0, newMaxHp);
  stats.mp = clamp(Math.round(newMaxMp * mpRatio), 0, newMaxMp);
  stats.attackPower = 8 + strength * 3;
  stats.speedRating = 8 + agility * 2;
}

let activeAccount = loadStoredAccount();

function cleanupWalletAccountListener() {
  if (walletAccountChangeUnsubscribe) {
    try {
      walletAccountChangeUnsubscribe();
    } catch (error) {
      console.warn("Failed to remove Phantom account listener", error);
    }
  }
  walletAccountChangeUnsubscribe = null;
}

function attachWalletAccountListener(provider) {
  cleanupWalletAccountListener();
  if (!provider) {
    return;
  }
  walletAccountChangeUnsubscribe = attachAccountChangeListener(
    provider,
    handlePhantomAccountChange
  );
}

function syncWalletUi(overrides = {}) {
  if (!ui || typeof ui.setWalletState !== "function") {
    return;
  }
  const state = {
    available: isPhantomInstalled(),
    connected: Boolean(activeWalletAddress),
    address: activeWalletAddress,
    callSign: activeAccount?.callSign ?? null,
    ...overrides
  };
  ui.setWalletState(state);
}

function handlePhantomAccountChange(nextPublicKey) {
  if (suppressWalletAccountChange) {
    suppressWalletAccountChange = false;
    return;
  }

  if (!nextPublicKey) {
    cleanupWalletAccountListener();
    walletProviderInstance = null;
    activeWalletAddress = null;
    handleLogout();
    syncWalletUi({ connected: false, address: null });
    return;
  }

  const address = normalizeWalletAddress(
    typeof nextPublicKey === "string" ? nextPublicKey : nextPublicKey?.toString?.()
  );
  if (!address) {
    return;
  }

  if (address === activeWalletAddress) {
    return;
  }

  const existingAccount = findStoredAccountByWalletAddress(address);
  activeWalletAddress = address;
  const account = ensureAccountForWalletAddress(address);
  if (!account) {
    console.warn("Unable to map wallet address to an account");
    return;
  }

  activateStoredAccount(account.callSign, {
    message: {
      text: `Wallet switched. Call sign @${account.callSign} is now linked.`,
      author: "Mission Command",
      channel: "mission"
    }
  });
  syncWalletUi({ connected: true, address });

  if (!existingAccount) {
    const savedAccounts = getStoredAccountsSnapshot();
    openOnboarding(account, savedAccounts);
  }
}

async function requestWalletLogin() {
  const provider = getPhantomProvider();
  if (!provider) {
    syncWalletUi({ available: false, connected: false });
    showMessage(
      {
        text: "Install the Phantom wallet extension to link your mission data.",
        author: "Mission Command",
        channel: "mission"
      },
      6000
    );
    return;
  }

  try {
    const { publicKey } = await connectPhantomWallet();
    const address = normalizeWalletAddress(publicKey);
    if (!address) {
      throw new Error("Invalid wallet address returned by Phantom");
    }
    walletProviderInstance = provider;
    const existingAccount = findStoredAccountByWalletAddress(address);
    activeWalletAddress = address;
    attachWalletAccountListener(provider);
    const account = ensureAccountForWalletAddress(address);
    if (!account) {
      throw new Error("Unable to create an account for the connected wallet");
    }
    activateStoredAccount(account.callSign, {
      message: {
        text: `Wallet linked. Call sign @${account.callSign} is ready for transmissions.`,
        author: "Mission Command",
        channel: "mission"
      }
    });
    syncWalletUi({ connected: true, address });

    if (!existingAccount) {
      const savedAccounts = getStoredAccountsSnapshot();
      openOnboarding(account, savedAccounts);
    }
  } catch (error) {
    const message =
      error?.code === 4001
        ? "Connection request was dismissed. Confirm in Phantom to continue."
        : "Phantom wallet connection failed. Try again.";
    console.warn("Failed to connect Phantom wallet", error);
    showMessage(
      {
        text: message,
        author: "Mission Command",
        channel: "mission"
      },
      6400
    );
    syncWalletUi({ connected: Boolean(activeWalletAddress) });
  }
}

async function requestWalletDisconnect() {
  const provider = walletProviderInstance ?? getPhantomProvider();
  suppressWalletAccountChange = true;
  try {
    if (provider) {
      await disconnectPhantomWallet(provider);
    }
  } catch (error) {
    console.warn("Failed to disconnect Phantom wallet", error);
  }
  cleanupWalletAccountListener();
  walletProviderInstance = null;
  activeWalletAddress = null;
  handleLogout();
  syncWalletUi({ connected: false, address: null });
  suppressWalletAccountChange = false;
}

const fallbackAccount = {
  handle: "",
  callSign: "",
  catName: "PixelHero",
  starterId: defaultStarterCharacter.id
};

let miniGameLoadoutState = loadMiniGameLoadoutsFromStorage();

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
const playerAppearance = {
  hair: appearancePresets[0].hair,
  skin: appearancePresets[0].skin,
  shirt: appearancePresets[0].shirt
};

const rankThresholds = [
  { level: 1, title: "Recruit" },
  { level: 3, title: "Astrocat Cadet" },
  { level: 5, title: "Star Voyager" },
  { level: 8, title: "Cosmic Trailblazer" }
];

const portalRequiredLevel = 3;

const BASE_EXP_REQUIREMENT = 120;
const EXP_GROWTH_RATE = 1.28;
const EXP_MILESTONE_INTERVAL = 5;
const EXP_MILESTONE_BONUS = 160;
const STAT_POINTS_PER_LEVEL = 2;
const STAT_POINT_MILESTONE_INTERVAL = 5;
const STAT_POINT_MILESTONE_BONUS = 3;
const CHARACTER_CREATION_POINTS = 6;

function getBonusStatPointsForLevel(level) {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return 0;
  }

  const normalized = Math.max(1, Math.floor(level));
  return normalized % STAT_POINT_MILESTONE_INTERVAL === 0
    ? STAT_POINT_MILESTONE_BONUS
    : 0;
}

function getStatPointsForLevel(level) {
  return STAT_POINTS_PER_LEVEL + getBonusStatPointsForLevel(level);
}

function calculateTotalStatPointsEarned(level) {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return getStatPointsForLevel(1);
  }

  const normalized = Math.max(1, Math.floor(level));
  let total = 0;
  for (let currentLevel = 1; currentLevel <= normalized; currentLevel += 1) {
    total += getStatPointsForLevel(currentLevel);
  }
  return total;
}

function getExpForNextLevel(level) {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return Math.round(BASE_EXP_REQUIREMENT);
  }

  const normalizedLevel = Math.max(1, Math.floor(level));
  const growth = Math.pow(EXP_GROWTH_RATE, normalizedLevel - 1);
  const milestoneBonus = Math.floor(normalizedLevel / EXP_MILESTONE_INTERVAL) * EXP_MILESTONE_BONUS;
  return Math.round(BASE_EXP_REQUIREMENT * growth + milestoneBonus);
}

const initialAttributes = createInitialAttributeState();
if (activeAccount?.attributes && typeof activeAccount.attributes === "object") {
  for (const definition of attributeDefinitions) {
    const rawValue = activeAccount.attributes[definition.key];
    if (Number.isFinite(rawValue)) {
      const normalized = Math.max(definition.base, Math.floor(rawValue));
      initialAttributes[definition.key] = normalized;
    }
  }
}

const initialPlayerLevel = normalizeAccountLevel(activeAccount?.level);
const initialPlayerMaxExp = getExpForNextLevel(initialPlayerLevel);
const initialPlayerExp = Math.min(
  normalizeAccountExp(activeAccount?.exp),
  initialPlayerMaxExp
);

const playerStats = {
  name: activeAccount?.catName ?? fallbackAccount.catName,
  handle: activeAccount?.handle ?? fallbackAccount.handle,
  callSign: activeAccount?.callSign ?? fallbackAccount.callSign,
  starterId: activeAccount?.starterId ?? fallbackAccount.starterId,
  level: initialPlayerLevel,
  rank: rankThresholds[0].title,
  exp: initialPlayerExp,
  maxExp: initialPlayerMaxExp,
  hp: 85,
  maxHp: 100,
  mp: 40,
  maxMp: 60,
  statPoints: Number.isFinite(activeAccount?.statPoints)
    ? Math.max(0, Math.floor(activeAccount.statPoints))
    : getStatPointsForLevel(initialPlayerLevel),
  attributes: initialAttributes,
  attackPower: 0,
  speedRating: 0
};

applyAttributeScaling(playerStats, { preservePercent: true });

const playerSpriteState = createSpriteState("starter sprite");
let activePlayerSpriteKey = null;

function setPlayerSpriteFromStarter() {
  const starter = findStarterCharacter(playerStats.starterId);
  const spriteSources = starter?.sprite;
  const candidateSources = [];

  if (Array.isArray(spriteSources)) {
    candidateSources.push(...spriteSources);
  } else if (typeof spriteSources === "string" && spriteSources) {
    candidateSources.push(spriteSources);
  }

  if (typeof starter?.image === "string" && starter.image) {
    candidateSources.push(starter.image);
  }

  const fallbackPalette =
    starter && typeof starter.palette === "object"
      ? starter.palette
      : defaultStarterDefinition.palette;
  const fallbackSprite = createStarterSpriteDataUrl(fallbackPalette);
  candidateSources.push(fallbackSprite);

  const uniqueSources = candidateSources.filter((candidate, index, all) => {
    return typeof candidate === "string" && candidate && all.indexOf(candidate) === index;
  });

  if (uniqueSources.length === 0) {
    activePlayerSpriteKey = null;
    playerSpriteState.handleError();
    return;
  }

  const sourceKey = uniqueSources.join("|");
  if (sourceKey === activePlayerSpriteKey && playerSpriteState.isReady()) {
    return;
  }

  activePlayerSpriteKey = sourceKey;
  playerSpriteState.setSource(uniqueSources);
}

setPlayerSpriteFromStarter();

const defaultMessage =
  "Check the Recruit Missions panel for onboarding tasks. Use A/D or ←/→ to move. Press Space to jump.";
let messageTimerId = 0;
const fallbackGuideName = "Nova Mason";
let lobbyGuideName = fallbackGuideName;
let defaultMissionAuthor = fallbackGuideName;

function showMessage(message, duration = 5200) {
  if (messageTimerId && typeof runtimeGlobal.clearTimeout === "function") {
    runtimeGlobal.clearTimeout(messageTimerId);
    messageTimerId = 0;
  }

  const meta = {};
  let text = "";

  if (typeof message === "string") {
    text = message;
  } else if (message && typeof message === "object") {
    if (typeof message.text === "string") {
      text = message.text;
    }
    for (const [key, value] of Object.entries(message)) {
      if (key === "text") {
        continue;
      }
      meta[key] = value;
    }
  }

  const fallbackDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const providedDuration = Number.isFinite(meta.duration) ? Math.max(0, meta.duration) : null;
  const resolvedDuration = providedDuration ?? fallbackDuration;
  meta.duration = resolvedDuration;

  if (typeof ui?.setMessage === "function") {
    ui.setMessage(text, meta);
  }

  if (resolvedDuration > 0) {
    const reset = () => {
      messageTimerId = 0;
      if (typeof ui?.setMessage === "function") {
        ui.setMessage(defaultMessage, { silent: true, duration: 0 });
      }
    };

    if (typeof runtimeGlobal.setTimeout === "function") {
      messageTimerId = runtimeGlobal.setTimeout(reset, resolvedDuration);
    } else if (typeof setTimeout === "function") {
      messageTimerId = setTimeout(reset, resolvedDuration);
    }
  }
}

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

function gainExperience(amount) {
  const normalizedAmount = Number.isFinite(amount) ? Math.floor(amount) : 0;
  if (normalizedAmount <= 0) {
    return false;
  }

  const maxLevelCap = maxAccountLevel ?? Number.POSITIVE_INFINITY;
  let currentLevel = Math.max(1, Math.floor(playerStats.level ?? 1));
  let currentExp = Math.max(0, Math.floor(playerStats.exp ?? 0)) + normalizedAmount;
  let currentMaxExp = Math.max(
    1,
    Math.floor(playerStats.maxExp ?? getExpForNextLevel(currentLevel))
  );
  let availableStatPoints = Math.max(0, Math.floor(playerStats.statPoints ?? 0));
  let leveledUp = false;

  while (currentExp >= currentMaxExp && currentLevel < maxLevelCap) {
    currentExp -= currentMaxExp;
    currentLevel += 1;
    availableStatPoints += getStatPointsForLevel(currentLevel);
    currentMaxExp = getExpForNextLevel(currentLevel);
    leveledUp = true;
  }

  if (currentLevel >= maxLevelCap) {
    currentLevel = maxLevelCap;
    currentMaxExp = getExpForNextLevel(currentLevel);
    currentExp = Math.min(currentExp, currentMaxExp);
  }

  playerStats.level = currentLevel;
  playerStats.exp = currentExp;
  playerStats.maxExp = currentMaxExp;
  playerStats.statPoints = availableStatPoints;

  updateRankFromLevel();

  if (leveledUp) {
    applyAttributeScaling(playerStats, { preservePercent: false });
    playerStats.hp = playerStats.maxHp;
    playerStats.mp = playerStats.maxMp;
  }

  if (ui && typeof ui.refresh === "function") {
    ui.refresh(playerStats);
  }

  if (leveledUp) {
    refreshMissionDisplay();
  }

  syncActiveAccountProgress();

  return leveledUp;
}

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

function initializeInterface() {
  ui = createInterface(playerStats, {
    onRequestLogin: requestAccountLogin,
    onRequestLogout: handleLogout,
    onRequestWalletLogin: requestWalletLogin,
    onRequestWalletDisconnect: requestWalletDisconnect,
    onSelectAccount(callSign) {
      activateStoredAccount(callSign);
    },
    portalLevelRequirement: portalRequiredLevel
  });
  app.innerHTML = "";
  app.append(ui.root);

  const initialStarter = findStarterCharacter(playerStats.starterId);
  ui.setAccount(activeAccount, initialStarter);
  syncWalletUi();
}

initializeInterface();

function refreshStoredAccountDirectory() {
  if (!ui || typeof ui.setStoredAccounts !== "function") {
    return;
  }

  const snapshot = getStoredAccountsSnapshot();
  ui.setStoredAccounts(snapshot, activeAccountCallSign);
}

function applyActiveAccount(account) {
  if (!account) {
    return false;
  }

  activeAccount = account;
  activeAccountCallSign = account.callSign ?? null;

  const layoutSnapshot = sanitizeLobbyLayoutSnapshot(account.lobbyLayout);
  if (layoutSnapshot) {
    applyLobbyLayoutSnapshot(defaultLobbyLayout);
    if (areLayoutsEqual(layoutSnapshot, defaultLobbyLayout)) {
      clearLobbyLayoutSnapshot();
    } else {
      applyLobbyLayoutSnapshot(layoutSnapshot);
      saveLobbyLayoutSnapshot(layoutSnapshot);
    }
  } else {
    applyLobbyLayoutSnapshot(defaultLobbyLayout);
    clearLobbyLayoutSnapshot();
  }

  if (layoutEditor && typeof layoutEditor.setHasCustomLayout === "function") {
    layoutEditor.setHasCustomLayout(hasCustomLobbyLayout);
  }
  if (typeof ui.setLayoutResetAvailable === "function") {
    ui.setLayoutResetAvailable(hasCustomLobbyLayout);
  }

  playerStats.name = account.catName;
  playerStats.handle = account.handle;
  playerStats.callSign = account.callSign;
  playerStats.starterId = isValidStarterId(account.starterId)
    ? account.starterId
    : defaultStarterCharacter.id;
  const normalizedLevel = normalizeAccountLevel(account.level);
  playerStats.level = normalizedLevel;
  playerStats.maxExp = getExpForNextLevel(normalizedLevel);
  playerStats.exp = Math.min(
    normalizeAccountExp(account.exp),
    playerStats.maxExp
  );
  playerStats.attributes = sanitizeAttributeValues(account.attributes);
  playerStats.statPoints = Number.isFinite(account.statPoints)
    ? Math.max(0, Math.floor(account.statPoints))
    : Math.max(0, Math.floor(getStatPointsForLevel(normalizedLevel)));
  applyAttributeScaling(playerStats, { preservePercent: false });
  playerStats.hp = playerStats.maxHp;
  playerStats.mp = playerStats.maxMp;
  updateRankFromLevel();
  setPlayerSpriteFromStarter();
  const chosenStarter = findStarterCharacter(playerStats.starterId);
  ui.setAccount(account, chosenStarter);
  ui.refresh(playerStats);
  syncMiniGameProfile();
  refreshStoredAccountDirectory();
  syncWalletUi();
  return true;
}

function activateStoredAccount(callSign, options = {}) {
  if (!callSign) {
    return false;
  }

  const account = storedAccounts[callSign];
  if (!account) {
    return false;
  }

  if (!applyActiveAccount(account)) {
    return false;
  }

  persistStoredAccounts();

  const announce = options.announce !== false;
  if (announce) {
    const message =
      options.message ?? {
        text: `Profile switched to ${account.catName}. Mission systems synced.`,
        author: "Mission Command",
        channel: "mission"
      };
    showMessage(message, 5200);
  } else {
    showMessage(defaultMessage, 0);
  }

  return true;
}

refreshStoredAccountDirectory();

let onboardingInstance = null;
let previousBodyOverflow = "";
let miniGameOverlayState = null;
let miniGameBodyOverflow = "";
let miniGameActive = false;

if (!activeAccount) {
  requestAccountLogin();
}

function requestAccountLogin() {
  if (!activeWalletAddress) {
    requestWalletLogin();
    return;
  }

  const initialAccount = activeAccount
    ? { ...activeAccount }
    : { starterId: playerStats.starterId, walletAddress: activeWalletAddress };
  const savedAccounts = getStoredAccountsSnapshot();
  openOnboarding(initialAccount, savedAccounts);
}

function handleLogout() {
  closeOnboarding();
  activeAccount = null;
  activeAccountCallSign = null;
  const persisted = persistStoredAccounts();
  playerStats.name = fallbackAccount.catName;
  playerStats.handle = fallbackAccount.handle;
  playerStats.callSign = fallbackAccount.callSign;
  playerStats.starterId = fallbackAccount.starterId;
  playerStats.level = 1;
  playerStats.exp = 0;
  playerStats.maxExp = getExpForNextLevel(1);
  playerStats.statPoints = getStatPointsForLevel(1);
  playerStats.attributes = createInitialAttributeState();
  applyAttributeScaling(playerStats, { preservePercent: false });
  playerStats.hp = playerStats.maxHp;
  playerStats.mp = playerStats.maxMp;
  updateRankFromLevel();
  setPlayerSpriteFromStarter();
  const starter = findStarterCharacter(playerStats.starterId);
  ui.setAccount(null, starter);
  ui.refresh(playerStats);
  refreshStoredAccountDirectory();
  clearFirstSessionChecklist();
  if (persisted) {
    showMessage("You have logged out. Create your Astrocat account to begin your mission.", 0);
  } else {
    showMessage(
      {
        text:
          "Storage is unavailable, so your logout might not persist after refreshing. Enable storage to fully sign out.",
        author: "Mission Command",
        channel: "mission"
      },
      7000
    );
  }
  syncMiniGameProfile();
  syncWalletUi({ callSign: null });
}

function completeAccountSetup(account, options = {}) {
  const { welcome = true, persist = true } = options;
  const previousAccounts = { ...storedAccounts };
  const previousActiveCallSign = activeAccountCallSign;
  const sanitized = rememberAccount(account);
  if (!sanitized) {
    return false;
  }

  if (persist) {
    const persisted = persistStoredAccounts();
    if (!persisted) {
      storedAccounts = previousAccounts;
      activeAccountCallSign = previousActiveCallSign;
      showMessage(
        {
          text:
            "We couldn't save your Astrocat profile because storage is unavailable. Enable storage and try again.",
          author: "Mission Command",
          channel: "mission"
        },
        7000
      );
      return false;
    }
  }
  applyActiveAccount(sanitized);
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
  beginFirstSessionChecklist();
  return true;
}

function openOnboarding(initialAccount = null, savedAccounts = []) {
  if (onboardingInstance) {
    onboardingInstance.focus();
    return;
  }

  previousBodyOverflow = document.body.style.overflow;
  const experience = createOnboardingExperience({
    initialAccount,
    savedAccounts,
    walletAddress: activeWalletAddress,
    onComplete(account) {
      if (completeAccountSetup(account)) {
        closeOnboarding();
      }
    }
  });

  onboardingInstance = experience;

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

function syncMiniGameProfile() {
  if (typeof window === "undefined") {
    return;
  }

  const frame = miniGameOverlayState?.frame;
  if (!frame) {
    return;
  }

  const { contentWindow } = frame;
  if (!contentWindow) {
    return;
  }

  const targetOrigin = computeMiniGameOrigin() || window.location.origin;

  const profile = {
    type: "astrocat:minigame-profile",
    playerName: playerStats.name,
    handle: playerStats.handle,
    callSign: playerStats.callSign,
    starterId: playerStats.starterId,
    level: playerStats.level,
    rank: playerStats.rank,
    exp: playerStats.exp,
    maxExp: playerStats.maxExp,
    statPoints: playerStats.statPoints
  };

  const activeLoadout = getMiniGameLoadoutBySlot(
    miniGameLoadoutState?.slots,
    miniGameLoadoutState?.activeSlot
  );
  if (activeLoadout) {
    profile.loadout = {
      slot: activeLoadout.slot,
      name: activeLoadout.name,
      characterId: activeLoadout.characterId,
      weaponId: activeLoadout.weaponId,
      skinId: activeLoadout.skinId,
      trailId: activeLoadout.trailId
    };
  }

  contentWindow.postMessage(profile, targetOrigin);
}

function openMiniGame() {
  if (miniGameActive || typeof document === "undefined") {
    if (miniGameOverlayState?.closeButton) {
      try {
        miniGameOverlayState.closeButton.focus({ preventScroll: true });
      } catch (error) {
        miniGameOverlayState.closeButton.focus();
      }
    }
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "minigame-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "AstroCats mini game console");

  const modal = document.createElement("div");
  modal.className = "minigame-modal";

  const header = document.createElement("div");
  header.className = "minigame-header";

  const title = document.createElement("h2");
  title.className = "minigame-title";
  title.textContent = "Starcade Console";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "minigame-close";
  closeButton.textContent = "Back to lobby";
  header.append(title, closeButton);

  const description = document.createElement("p");
  description.className = "minigame-description";
  description.textContent =
    "The cabinet spins up the AstroCats3 mini game in an in-universe console.";

  let supportLinkRef = null;

  const frame = document.createElement("iframe");
  frame.className = "minigame-frame";
  frame.src = miniGameEntryPoint;
  frame.title = "AstroCats mini game";
  frame.loading = "lazy";
  frame.setAttribute("allow", "fullscreen; gamepad *; xr-spatial-tracking");
  frame.addEventListener("load", () => {
    syncMiniGameProfile();
  });
  frame.addEventListener("error", () => {
    const previousEntry = miniGameEntryPoint;
    const nextEntry = advanceMiniGameEntryPoint();
    if (!nextEntry || nextEntry === previousEntry) {
      return;
    }
    frame.src = nextEntry;
    if (supportLinkRef) {
      supportLinkRef.href = nextEntry;
    }
    if (typeof console !== "undefined") {
      console.warn(
        "Retrying AstroCats3 mini game load with a fallback entry point.",
        { previous: previousEntry, next: nextEntry }
      );
    }
  });

  const support = document.createElement("p");
  support.className = "minigame-support";
  support.textContent = "Trouble loading? ";
  const supportLink = document.createElement("a");
  supportLinkRef = supportLink;
  supportLink.href = miniGameEntryPoint;
  supportLink.target = "_blank";
  supportLink.rel = "noopener noreferrer";
  supportLink.textContent = "Open the mini game in a new tab";
  support.append(supportLink, ".");

  modal.append(header, description, frame, support);
  overlay.append(modal);

  const handleBackdropClick = (event) => {
    if (event.target === overlay) {
      closeMiniGame();
    }
  };
  overlay.addEventListener("click", handleBackdropClick);

  const handleEscape = (event) => {
    if (event.code === "Escape") {
      event.preventDefault();
      closeMiniGame();
    }
  };
  window.addEventListener("keydown", handleEscape);

  closeButton.addEventListener("click", () => {
    closeMiniGame();
  });

  document.body.append(overlay);
  miniGameBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  keys.clear();
  justPressed.clear();
  player.vx = 0;
  player.vy = 0;

  miniGameOverlayState = {
    root: overlay,
    closeButton,
    frame,
    supportLink,
    handleBackdropClick,
    handleEscape
  };
  miniGameActive = true;

  syncMiniGameProfile();

  try {
    closeButton.focus({ preventScroll: true });
  } catch (error) {
    closeButton.focus();
  }
}

function closeMiniGame() {
  if (!miniGameActive) {
    return;
  }

  miniGameActive = false;

  if (miniGameOverlayState?.root) {
    const { root, handleBackdropClick } = miniGameOverlayState;
    if (handleBackdropClick) {
      root.removeEventListener("click", handleBackdropClick);
    }
    root.remove();
  }

  if (miniGameOverlayState?.handleEscape) {
    window.removeEventListener("keydown", miniGameOverlayState.handleEscape);
  }

  if (typeof document !== "undefined") {
    document.body.style.overflow = miniGameBodyOverflow;
  }

  miniGameOverlayState = null;
  miniGameBodyOverflow = "";
  keys.clear();
  justPressed.clear();
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

if (ui?.backgroundVideo && ui?.canvasBackground) {
  initializeCanvasBackgroundVideo(
    ui.backgroundVideo,
    ui.canvasBackground,
    backgroundVideoSources
  );
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Unable to acquire 2D context");
}

let renderScale = 1;
let devicePixelScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
let fallbackBackgroundGradient = null;
let fallbackGradientKey = "";
const promptFont = "20px 'Segoe UI', sans-serif";
let promptMetricsCache = { text: "", width: 0, height: 0, ascent: 0, descent: 0 };

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
  const ascent =
    typeof metrics.actualBoundingBoxAscent === "number"
      ? metrics.actualBoundingBoxAscent
      : typeof metrics.fontBoundingBoxAscent === "number"
        ? metrics.fontBoundingBoxAscent
        : 16;
  const descent =
    typeof metrics.actualBoundingBoxDescent === "number"
      ? metrics.actualBoundingBoxDescent
      : typeof metrics.fontBoundingBoxDescent === "number"
        ? metrics.fontBoundingBoxDescent
        : 4;
  const height = ascent + descent;
  promptMetricsCache = { text, width: metrics.width, height, ascent, descent };
  return promptMetricsCache;
};

// Clamp the backing canvas resolution so high-DPI displays do not force the
// browser to push millions of pixels every frame. This keeps the UI sharp while
// avoiding runaway render costs on mobile and 4K screens.
const MAX_CANVAS_PIXEL_WIDTH = 1920;
const MAX_CANVAS_PIXEL_HEIGHT = 1080;
let lastCanvasCssWidth = 0;
let lastCanvasCssHeight = 0;
let lastCanvasPixelWidth = 0;
let lastCanvasPixelHeight = 0;

const updateCanvasScale = () => {
  if (typeof window === "undefined") {
    return;
  }

  const baseDpr = window.devicePixelRatio || 1;
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

  let effectiveDpr = baseDpr;
  const maxWidthDpr = MAX_CANVAS_PIXEL_WIDTH / (viewport.width * nextScale);
  const maxHeightDpr = MAX_CANVAS_PIXEL_HEIGHT / (viewport.height * nextScale);
  if (Number.isFinite(maxWidthDpr) && maxWidthDpr > 0) {
    effectiveDpr = Math.min(effectiveDpr, maxWidthDpr);
  }
  if (Number.isFinite(maxHeightDpr) && maxHeightDpr > 0) {
    effectiveDpr = Math.min(effectiveDpr, maxHeightDpr);
  }

  if (!Number.isFinite(effectiveDpr) || effectiveDpr <= 0) {
    effectiveDpr = 1;
  }

  const targetWidth = viewport.width * nextScale;
  const targetHeight = viewport.height * nextScale;
  const cssWidth = Math.round(targetWidth);
  const cssHeight = Math.round(targetHeight);
  const pixelWidth = Math.round(targetWidth * effectiveDpr);
  const pixelHeight = Math.round(targetHeight * effectiveDpr);

  if (cssWidth !== lastCanvasCssWidth) {
    canvas.style.width = `${cssWidth}px`;
    lastCanvasCssWidth = cssWidth;
  }

  if (cssHeight !== lastCanvasCssHeight) {
    canvas.style.height = `${cssHeight}px`;
    lastCanvasCssHeight = cssHeight;
  }

  if (pixelWidth !== lastCanvasPixelWidth) {
    canvas.width = pixelWidth;
    lastCanvasPixelWidth = pixelWidth;
  }

  if (pixelHeight !== lastCanvasPixelHeight) {
    canvas.height = pixelHeight;
    lastCanvasPixelHeight = pixelHeight;
  }

  renderScale = nextScale;
  devicePixelScale = effectiveDpr;
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

const lobbySpriteScale = 1.25;

const groundY = viewport.height - 96;
const playerWidth = Math.round(72 * 1.1 * lobbySpriteScale);
const playerHeight = Math.round(81 * 1.1 * lobbySpriteScale);

const playerStartX = Math.round(viewport.width / 2 - playerWidth / 2);

const player = {
  x: playerStartX,
  y: groundY - playerHeight,
  width: playerWidth,
  height: playerHeight,
  vx: 0,
  vy: 0,
  direction: 1,
  onGround: false,
  appearance: playerAppearance
};

const CAMERA_BASE_MARGIN = Math.round(viewport.width * 0.3);
const CAMERA_MAX_MARGIN = Math.floor((viewport.width - player.width) / 2);
const CAMERA_MARGIN = Math.min(
  Math.max(CAMERA_BASE_MARGIN, 0),
  Math.max(CAMERA_MAX_MARGIN, 0)
);
const CAMERA_LEFT_LIMIT = CAMERA_MARGIN;
const CAMERA_RIGHT_LIMIT = viewport.width - CAMERA_MARGIN;

function clampCameraScroll(scroll) {
  if (!Number.isFinite(scroll)) {
    return 0;
  }

  const maxScroll =
    Number.isFinite(worldWrapWidth) && worldWrapWidth > viewport.width
      ? worldWrapWidth - viewport.width
      : 0;

  if (scroll < 0) {
    return 0;
  }

  if (scroll > maxScroll) {
    return maxScroll;
  }

  return scroll;
}

function updateCameraScrollPosition() {
  const playerScreenLeft = player.x - cameraScrollX;
  const playerScreenRight = playerScreenLeft + player.width;
  let nextScroll = cameraScrollX;

  if (playerScreenLeft < CAMERA_LEFT_LIMIT) {
    nextScroll = player.x - CAMERA_LEFT_LIMIT;
  } else if (playerScreenRight > CAMERA_RIGHT_LIMIT) {
    nextScroll = player.x + player.width - CAMERA_RIGHT_LIMIT;
  }

  cameraScrollX = clampCameraScroll(nextScroll);
}

const platforms = [
  {
    id: "platform-a",
    label: "Platform A",
    x: 140,
    y: groundY - 120,
    width: 160,
    height: 18
  },
  {
    id: "platform-b",
    label: "Platform B",
    x: 468,
    y: groundY - 180,
    width: 200,
    height: 18
  },
  {
    id: "platform-c",
    label: "Platform C",
    x: 724,
    y: groundY - 80,
    width: 150,
    height: 18
  }
];

const crystals = [
  { x: 220, y: groundY - 36, radius: 12, collected: false },
  { x: 520, y: groundY - 220, radius: 12, collected: false },
  { x: 780, y: groundY - 116, radius: 12, collected: false },
  { x: 360, y: groundY - 156, radius: 12, collected: false },
  { x: 640, y: groundY - 36, radius: 12, collected: false }
];

const CRYSTAL_SPRINT_TARGET_MS = 35000;
let portalCharge = 0;
let portalCharged = false;
let portalCompleted = false;
let crystalRunStartTime = 0;

const portal = {
  id: "portal",
  label: "Portal Gateway",
  x: viewport.width - 140,
  y: groundY - 120,
  width: 100,
  height: 140,
  interactionPadding: 36
};

const guideBaseX = 320;
const guideBaseWidth = 42;
const guideBaseHeight = 54;
const guideWidth = Math.round(guideBaseWidth * 1.1);
const guideHeight = Math.round(guideBaseHeight * 1.1);
const guideFloatOffset = 6;
const guideCenterX = guideBaseX + guideBaseWidth / 2;
const guideX = Math.round(guideCenterX - guideWidth / 2);
const guideY = groundY - guideFloatOffset - guideHeight;

const scaleLobbyEntity = (entity) => {
  if (!entity || typeof entity !== "object") {
    return entity;
  }

  const scaledWidth = Math.round(entity.width * lobbySpriteScale);
  const scaledHeight = Math.round(entity.height * lobbySpriteScale);
  const bottom = entity.y + entity.height;
  const centerX = entity.x + entity.width / 2;

  return {
    ...entity,
    width: scaledWidth,
    height: scaledHeight,
    x: Math.round(centerX - scaledWidth / 2),
    y: Math.round(bottom - scaledHeight)
  };
};

const interactables = [
  {
    id: "bulletin-board",
    type: "bulletin",
    label: "Star Bulletin Board",
    missionId: "mission-broadcast",
    x: 24,
    y: groundY - 82,
    width: 64,
    height: 82
  },
  {
    id: "treasure-chest",
    type: "chest",
    label: "Treasure Chest",
    x: 84,
    y: groundY - 46,
    width: 44,
    height: 36,
    opened: false
  },
  {
    id: "starcade-cabinet",
    type: "arcade",
    label: "Starcade Cabinet",
    x: 520,
    y: groundY - 102,
    width: 68,
    height: 102
  },
  {
    id: "nova-guide",
    type: "npc",
    name: "Nova Mason",
    label: "Nova Mason the Guide",
    x: guideX,
    y: guideY,
    width: guideWidth,
    height: guideHeight,
    missionId: "mission-briefing",
    dialogue: [
      "Welcome to the Astrocat Lobby! The Recruit Missions panel tracks your onboarding tasks.",
      "The bulletin board lets you broadcast your arrival across the cosmos.",
      "Need to sync up? Use the comms console to follow Mission Control."
    ],
    lineIndex: 0
  },
  {
    id: "mana-fountain",
    type: "fountain",
    label: "Mana Fountain",
    x: 840,
    y: groundY - 68,
    width: 48,
    height: 52,
    charges: 2
  },
  {
    id: "comms-console",
    type: "comms",
    label: "Comms Console",
    missionId: "mission-follow",
    x: 880,
    y: groundY - 78,
    width: 56,
    height: 78
  }
].map((interactable) => scaleLobbyEntity(interactable));

const lobbyGuideInteractable = interactables.find((entry) => entry.id === "nova-guide");
lobbyGuideName =
  typeof lobbyGuideInteractable?.name === "string" && lobbyGuideInteractable.name.trim()
    ? lobbyGuideInteractable.name.trim()
    : fallbackGuideName;
defaultMissionAuthor = lobbyGuideName;

if (ui) {
  ui.addFeedMessage({
    author: lobbyGuideName,
    channel: "mission",
    text: `${lobbyGuideName} reporting! I'm by the mission board if you want the grand tour.`,
    timestamp: Date.now() - 1000 * 60 * 24
  });
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
}

function getInteractableDisplayName(interactable, fallback = lobbyGuideName) {
  if (!interactable || typeof interactable !== "object") {
    return fallback;
  }

  const rawName =
    typeof interactable.name === "string" ? interactable.name.trim() : "";
  return rawName || fallback;
}

function normaliseLayoutCoordinate(value, fallback) {
  if (Number.isFinite(value)) {
    return Math.round(value);
  }
  if (Number.isFinite(fallback)) {
    return Math.round(fallback);
  }
  return 0;
}

function captureLobbyLayoutSnapshot() {
  const snapshot = {
    interactables: {},
    platforms: {},
    portal: {
      x: normaliseLayoutCoordinate(portal.x, portal.x),
      y: normaliseLayoutCoordinate(portal.y, portal.y)
    }
  };

  for (const interactable of interactables) {
    const id = interactable.id ?? interactable.type;
    if (!id) {
      continue;
    }
    snapshot.interactables[id] = {
      x: normaliseLayoutCoordinate(interactable.x, interactable.x),
      y: normaliseLayoutCoordinate(interactable.y, interactable.y)
    };
  }

  platforms.forEach((platform, index) => {
    const id = platform.id ?? String(index);
    snapshot.platforms[id] = {
      x: normaliseLayoutCoordinate(platform.x, platform.x),
      y: normaliseLayoutCoordinate(platform.y, platform.y)
    };
  });

  return snapshot;
}

function applyLobbyLayoutSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  let applied = false;

  const overrides = snapshot.interactables;
  if (overrides && typeof overrides === "object") {
    for (const interactable of interactables) {
      const id = interactable.id ?? interactable.type;
      if (!id) {
        continue;
      }
      const override = overrides[id];
      if (!override || typeof override !== "object") {
        continue;
      }
      if ("x" in override) {
        const nextX = normaliseLayoutCoordinate(override.x, interactable.x);
        if (Number.isFinite(nextX)) {
          interactable.x = nextX;
          applied = true;
        }
      }
      if ("y" in override) {
        const nextY = normaliseLayoutCoordinate(override.y, interactable.y);
        if (Number.isFinite(nextY)) {
          interactable.y = nextY;
          applied = true;
        }
      }
    }
  }

  const platformOverrides = snapshot.platforms;
  if (platformOverrides && typeof platformOverrides === "object") {
    platforms.forEach((platform, index) => {
      const id = platform.id ?? String(index);
      const override = platformOverrides[id];
      if (!override || typeof override !== "object") {
        return;
      }
      if ("x" in override) {
        const nextX = normaliseLayoutCoordinate(override.x, platform.x);
        if (Number.isFinite(nextX)) {
          platform.x = nextX;
          applied = true;
        }
      }
      if ("y" in override) {
        const nextY = normaliseLayoutCoordinate(override.y, platform.y);
        if (Number.isFinite(nextY)) {
          platform.y = nextY;
          applied = true;
        }
      }
    });
  }

  if (snapshot.portal && typeof snapshot.portal === "object") {
    const nextPortalX = normaliseLayoutCoordinate(snapshot.portal.x, portal.x);
    const nextPortalY = normaliseLayoutCoordinate(snapshot.portal.y, portal.y);
    if (Number.isFinite(nextPortalX)) {
      portal.x = nextPortalX;
      applied = true;
    }
    if (Number.isFinite(nextPortalY)) {
      portal.y = nextPortalY;
      applied = true;
    }
  }

  return applied;
}

function areLayoutsEqual(candidate, reference) {
  if (!candidate && !reference) {
    return true;
  }
  if (!candidate || !reference) {
    return false;
  }

  const referenceInteractables = reference.interactables ?? {};
  const candidateInteractables = candidate.interactables ?? {};
  const interactableIds = new Set([
    ...Object.keys(referenceInteractables),
    ...Object.keys(candidateInteractables)
  ]);

  for (const id of interactableIds) {
    const referenceEntry = referenceInteractables[id];
    const candidateEntry = candidateInteractables[id];
    const referenceX = normaliseLayoutCoordinate(referenceEntry?.x, 0);
    const referenceY = normaliseLayoutCoordinate(referenceEntry?.y, 0);
    const candidateX = normaliseLayoutCoordinate(candidateEntry?.x, referenceX);
    const candidateY = normaliseLayoutCoordinate(candidateEntry?.y, referenceY);
    if (referenceX !== candidateX || referenceY !== candidateY) {
      return false;
    }
  }

  const referencePlatforms = reference.platforms ?? {};
  const candidatePlatforms = candidate.platforms ?? {};
  const platformIds = new Set([
    ...Object.keys(referencePlatforms),
    ...Object.keys(candidatePlatforms)
  ]);

  for (const id of platformIds) {
    const referenceEntry = referencePlatforms[id];
    const candidateEntry = candidatePlatforms[id];
    const referenceX = normaliseLayoutCoordinate(referenceEntry?.x, 0);
    const referenceY = normaliseLayoutCoordinate(referenceEntry?.y, 0);
    const candidateX = normaliseLayoutCoordinate(candidateEntry?.x, referenceX);
    const candidateY = normaliseLayoutCoordinate(candidateEntry?.y, referenceY);
    if (referenceX !== candidateX || referenceY !== candidateY) {
      return false;
    }
  }

  const referencePortalX = normaliseLayoutCoordinate(
    reference.portal?.x,
    reference.portal?.x
  );
  const referencePortalY = normaliseLayoutCoordinate(
    reference.portal?.y,
    reference.portal?.y
  );
  const candidatePortalX = normaliseLayoutCoordinate(
    candidate.portal?.x,
    referencePortalX
  );
  const candidatePortalY = normaliseLayoutCoordinate(
    candidate.portal?.y,
    referencePortalY
  );

  return referencePortalX === candidatePortalX && referencePortalY === candidatePortalY;
}

const defaultLobbyLayout = captureLobbyLayoutSnapshot();
savedLobbyLayout = loadLobbyLayoutSnapshot();
hasCustomLobbyLayout = Boolean(
  savedLobbyLayout && !areLayoutsEqual(savedLobbyLayout, defaultLobbyLayout)
);

const activeAccountLobbyLayout = sanitizeLobbyLayoutSnapshot(activeAccount?.lobbyLayout);
if (activeAccountLobbyLayout) {
  applyLobbyLayoutSnapshot(defaultLobbyLayout);
  if (areLayoutsEqual(activeAccountLobbyLayout, defaultLobbyLayout)) {
    clearLobbyLayoutSnapshot();
  } else {
    applyLobbyLayoutSnapshot(activeAccountLobbyLayout);
    saveLobbyLayoutSnapshot(activeAccountLobbyLayout);
  }
} else if (hasCustomLobbyLayout) {
  applyLobbyLayoutSnapshot(savedLobbyLayout);
}

let worldWrapWidth = computeWorldWrapWidth();
const worldWrapOffsetsScratch = [0, 0, 0];
const worldWrapRenderOffsetsScratch = [];
const getWorldOffsetsAround = (value) =>
  computeWorldOffsetsAround(value, worldWrapWidth, worldWrapOffsetsScratch);
const getWorldWrapOffsetsForView = (cameraOffset, viewportWidth = viewport.width, margin = 0) =>
  computeWorldWrapOffsetsForView(
    cameraOffset,
    viewportWidth,
    worldWrapWidth,
    worldWrapRenderOffsetsScratch,
    margin
  );

function computeWorldWrapWidth() {
  const extents = [];

  const trackExtent = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      extents.push(value);
    }
  };

  for (const platform of platforms) {
    trackExtent(platform.x + platform.width);
  }

  for (const interactable of interactables) {
    trackExtent(interactable.x + (interactable.width ?? 0));
  }

  for (const crystal of crystals) {
    trackExtent(crystal.x + (crystal.radius ?? 0));
  }

  trackExtent(portal.x + portal.width);

  const furthestExtent = extents.length > 0 ? Math.max(...extents) : viewport.width;
  const margin = Math.max(viewport.width * 0.15, 180);
  const baseWidth = Math.max(viewport.width, furthestExtent + margin);
  const rounding = 20;
  return Math.ceil(baseWidth / rounding) * rounding;
}

const missionDefinitions = [
  {
    id: "mission-briefing",
    title: "Receive Your Briefing",
    description: `Check in with ${lobbyGuideName} and soak up every sparkling tip about the lobby.`,
    flavor: `${lobbyGuideName}'s pep talk smells faintly of stardust and optimism.`,
    xp: 160,
    requiredLevel: 1
  },
  {
    id: "mission-broadcast",
    title: "Broadcast Your Arrival",
    description: "Visit the bulletin board and beam a jubilant enlistment post into the feed.",
    flavor: "The board lights up like a constellation when you sign it.",
    xp: 130,
    requiredLevel: 1
  },
  {
    id: "mission-follow",
    title: "Follow Mission Control",
    description: "Sync with the comms console so Mission Control can cheer every victory.",
    flavor: "Their welcome ping feels like a confetti cannon for your inbox.",
    xp: 150,
    requiredLevel: 1
  },
  {
    id: "mission-community-post",
    title: "Post to the Community Board",
    description: "Send an upbeat transmission to a fellow explorer's call sign.",
    flavor: "The reply lights ripple like aurora when kindness travels fast.",
    xp: 180,
    requiredLevel: 2
  },
  {
    id: "mission-crystal-charge",
    title: "Charge the Portal Core",
    description: "Collect every lobby crystal to flood the dormant portal with light.",
    flavor: `${lobbyGuideName} swears the crackling glow makes your whiskers sparkle.`,
    xp: 210,
    requiredLevel: 2
  },
  {
    id: "mission-crystal-sprint",
    title: "Crystal Sprint Champion",
    description: "Complete a full crystal run before the chrono hits 00:35.",
    flavor: "You leave comet tails in your wake when you dash this fast.",
    xp: 240,
    requiredLevel: 3
  },
  {
    id: "mission-combo-challenge",
    title: "Combo Celebration",
    description: "Hit a x12 streak or better in the Starcade to wow Mission Control.",
    flavor: "Every extra beam in the combo shower is basically a dance party.",
    xp: 260,
    requiredLevel: 4
  },
  {
    id: "mission-portal-dive",
    title: "Dive Through the Portal",
    description: "Stabilize the charged portal and take the triumphant step forward.",
    flavor: "Crossing the threshold feels like surfing sunlight.",
    xp: 320,
    requiredLevel: 3
  }
];

const CHECKLIST_EVENTS = {
  CRYSTAL_COLLECTED: "crystal-collected",
  NPC_INTERACTION: "npc-interaction",
  MINI_GAME_LAUNCHED: "mini-game-launched"
};

const firstSessionChecklistDefinition = {
  id: "checklist-first-session",
  title: "First Session Checklist",
  description: "Warm up the lobby systems with these quick wins.",
  tasks: [
    {
      id: "collect-first-crystal",
      label: "Collect your first crystal",
      description: "Crystals power the portal. Walk through one to scoop it up.",
      event: CHECKLIST_EVENTS.CRYSTAL_COLLECTED,
      condition: (context = {}) => Boolean(context.first)
    },
    {
      id: "greet-lobby-guide",
      label: "Greet a lobby guide",
      description: "Approach Nova Mason (or another guide) and press E to chat.",
      event: CHECKLIST_EVENTS.NPC_INTERACTION
    },
    {
      id: "launch-starcade",
      label: "Open the Starcade cabinet",
      description: "Press E near the arcade to boot the Starcade mini-game.",
      event: CHECKLIST_EVENTS.MINI_GAME_LAUNCHED
    }
  ]
};

class ChecklistManager {
  constructor(definition, options = {}) {
    this.definition = definition ?? {};
    this.tasks = Array.isArray(this.definition.tasks)
      ? this.definition.tasks.map((task) => ({ ...task, completed: Boolean(task.completed) }))
      : [];
    this.onComplete = typeof options.onComplete === "function" ? options.onComplete : null;
    this.completed = this.tasks.every((task) => task.completed);
    this.dock = null;
    this.taskItems = new Map();

    this.root = document.createElement("section");
    this.root.className = "mission-log mission-log--checklist";
    this.root.dataset.checklistId = this.definition.id ?? "checklist";

    this.title = document.createElement("h2");
    this.title.className = "mission-log__title";
    this.title.textContent = this.definition.title ?? "Checklist";

    this.summary = document.createElement("p");
    this.summary.className = "mission-log__summary";

    this.description = document.createElement("p");
    this.description.className = "mission-log__requirement";
    if (this.definition.description) {
      this.description.textContent = this.definition.description;
      this.description.hidden = false;
    } else {
      this.description.textContent = "";
      this.description.hidden = true;
    }

    this.list = document.createElement("ul");
    this.list.className = "mission-log__list";

    this.root.append(this.title, this.summary, this.description, this.list);

    this.buildTaskItems();
    this.updateSummary();

    if (options.dock) {
      this.mount(options.dock);
    }
  }

  buildTaskItems() {
    this.list.innerHTML = "";
    this.taskItems.clear();
    for (const task of this.tasks) {
      const item = document.createElement("li");
      item.className = "mission-log__item mission-log__item--checklist";
      if (task.completed) {
        item.classList.add("is-completed");
      }

      const status = document.createElement("span");
      status.className = "mission-log__status";
      status.textContent = task.completed ? "✓" : "•";

      const content = document.createElement("div");
      content.className = "mission-log__content";

      const label = document.createElement("p");
      label.className = "mission-log__name";
      label.textContent = task.label ?? "Checklist task";

      const detail = document.createElement("p");
      detail.className = "mission-log__description";
      if (task.description) {
        detail.textContent = task.description;
        detail.hidden = false;
      } else {
        detail.textContent = "";
        detail.hidden = true;
      }

      if (task.description) {
        content.append(label, detail);
      } else {
        content.append(label);
      }
      item.append(status, content);
      this.list.append(item);
      this.taskItems.set(task.id, { item, status, detail });
    }
  }

  mount(dock) {
    if (!dock) {
      return;
    }
    this.dock = dock;
    this.dock.hidden = false;
    this.dock.innerHTML = "";
    this.dock.append(this.root);
  }

  notify(eventName, context = {}) {
    if (!eventName || this.completed) {
      return false;
    }
    let updated = false;
    for (const task of this.tasks) {
      if (task.completed || task.event !== eventName) {
        continue;
      }
      if (!this.evaluateCondition(task, context)) {
        continue;
      }
      if (this.completeTask(task)) {
        updated = true;
      }
    }
    if (updated) {
      this.updateSummary();
    }
    return updated;
  }

  evaluateCondition(task, context) {
    if (typeof task.condition === "function") {
      try {
        return task.condition(context, task) !== false;
      } catch (error) {
        return false;
      }
    }
    return true;
  }

  markTaskComplete(taskId) {
    if (!taskId || this.completed) {
      return false;
    }
    const task = this.tasks.find((entry) => entry.id === taskId);
    if (!task || task.completed) {
      return false;
    }
    const completed = this.completeTask(task);
    if (completed) {
      this.updateSummary();
    }
    return completed;
  }

  completeTask(task) {
    if (!task || task.completed) {
      return false;
    }
    task.completed = true;
    const entry = this.taskItems.get(task.id);
    if (entry) {
      entry.item.classList.add("is-completed");
      entry.status.textContent = "✓";
    }
    const allComplete = this.tasks.every((candidate) => candidate.completed);
    if (allComplete && !this.completed) {
      this.completed = true;
      this.root.classList.add("mission-log--complete");
      this.updateSummary();
      if (typeof this.onComplete === "function") {
        this.onComplete(this);
      }
    }
    return true;
  }

  updateSummary() {
    const total = this.tasks.length;
    const completed = this.tasks.filter((task) => task.completed).length;
    if (total === 0) {
      this.summary.textContent = "No onboarding tasks right now.";
    } else if (completed >= total && total > 0) {
      this.summary.textContent = "All onboarding steps complete!";
    } else {
      this.summary.textContent = `${completed} / ${total} tasks complete`;
    }
  }

  syncWithWorldState(state = {}) {
    if (!state || typeof state !== "object") {
      return;
    }
    if (state.portalCharge > 0) {
      this.markTaskComplete("collect-first-crystal");
    }
    if (state.npcInteracted) {
      this.markTaskComplete("greet-lobby-guide");
    }
    if (state.miniGameActive) {
      this.markTaskComplete("launch-starcade");
    }
  }

  destroy() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    if (this.dock) {
      this.dock.hidden = true;
      this.dock.innerHTML = "";
    }
    this.taskItems.clear();
    this.tasks = [];
    this.completed = true;
    this.root = null;
    this.summary = null;
    this.description = null;
    this.dock = null;
  }
}

let firstSessionChecklistManager = null;

function clearFirstSessionChecklist() {
  if (firstSessionChecklistManager) {
    firstSessionChecklistManager.destroy();
    firstSessionChecklistManager = null;
  }
}

function beginFirstSessionChecklist() {
  if (!ui || typeof ui.getChecklistContainer !== "function") {
    return null;
  }
  const container = ui.getChecklistContainer();
  if (!container) {
    return null;
  }

  clearFirstSessionChecklist();

  firstSessionChecklistManager = new ChecklistManager(firstSessionChecklistDefinition, {
    dock: container,
    onComplete(instance) {
      showMessage(
        {
          text: "First session checklist complete! Mission Control is impressed.",
          author: "Mission Command",
          channel: "mission"
        },
        5200
      );
      setTimeout(() => {
        if (instance) {
          instance.destroy();
        }
        if (firstSessionChecklistManager === instance) {
          firstSessionChecklistManager = null;
        }
      }, 2200);
    }
  });

  const npcInteracted = interactables.some(
    (entry) => entry && entry.type === "npc" && typeof entry.lineIndex === "number" && entry.lineIndex > 0
  );

  firstSessionChecklistManager.syncWithWorldState({
    portalCharge,
    npcInteracted,
    miniGameActive
  });

  return firstSessionChecklistManager;
}

function notifyFirstSessionChecklist(eventName, context) {
  if (!firstSessionChecklistManager) {
    return;
  }
  firstSessionChecklistManager.notify(eventName, context);
}

const missions = missionDefinitions.map((mission) => ({
  ...mission,
  completed: false,
  unlocked: (mission.requiredLevel ?? 1) <= 1
}));

const missionRegistry = new Map(missions.map((mission) => [mission.id, mission]));

function refreshMissionDisplay() {
  if (!ui || typeof ui.updateMissions !== "function") {
    return;
  }
  const level = playerStats.level ?? 1;
  for (const mission of missions) {
    const requirement = Math.max(1, mission.requiredLevel ?? 1);
    mission.unlocked = level >= requirement;
  }
  ui.updateMissions(missions, level);
}

function completeMission(missionId) {
  if (!missionId) {
    return {
      completed: false,
      alreadyComplete: false,
      locked: false,
      leveledUp: false,
      mission: null
    };
  }

  const mission = missionRegistry.get(missionId);
  if (!mission) {
    return {
      completed: false,
      alreadyComplete: false,
      locked: false,
      leveledUp: false,
      mission: null
    };
  }

  if (mission.completed) {
    return {
      completed: false,
      alreadyComplete: true,
      locked: false,
      leveledUp: false,
      mission
    };
  }

  const requirement = Math.max(1, mission.requiredLevel ?? 1);
  if ((playerStats.level ?? 1) < requirement) {
    mission.unlocked = false;
    return {
      completed: false,
      alreadyComplete: false,
      locked: true,
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
    locked: false,
    leveledUp,
    mission
  };
}

const keys = new Set();
const justPressed = new Set();
const frameJustPressed = new Set();
const emptyJustPressedSet = new Set();
let currentJustPressed = justPressed;

function wasKeyJustPressed(code) {
  return currentJustPressed.has(code);
}

const movementKeyCodes = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD"
]);

let activeMovementInputCount = 0;

const applyScrollLock = () => {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const body = document.body;
  if (root && !root.classList.contains("is-scroll-locked")) {
    root.classList.add("is-scroll-locked");
  }
  if (body && !body.classList.contains("is-scroll-locked")) {
    body.classList.add("is-scroll-locked");
  }
};

const releaseScrollLock = () => {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const body = document.body;
  if (root) {
    root.classList.remove("is-scroll-locked");
  }
  if (body) {
    body.classList.remove("is-scroll-locked");
  }
};

const incrementMovementInput = () => {
  activeMovementInputCount += 1;
  if (activeMovementInputCount === 1) {
    applyScrollLock();
  }
};

const decrementMovementInput = () => {
  if (activeMovementInputCount === 0) {
    return;
  }
  activeMovementInputCount -= 1;
  if (activeMovementInputCount === 0) {
    releaseScrollLock();
  }
};

const resetMovementInput = () => {
  activeMovementInputCount = 0;
  releaseScrollLock();
};

const pressVirtualKey = (code) => {
  if (!code) {
    return;
  }
  if (!keys.has(code)) {
    justPressed.add(code);
    if (movementKeyCodes.has(code)) {
      incrementMovementInput();
    }
  }
  keys.add(code);
};

const releaseVirtualKey = (code) => {
  if (!code) {
    return;
  }
  const wasActive = keys.delete(code);
  if (wasActive && movementKeyCodes.has(code)) {
    decrementMovementInput();
  }
};

const interactiveTagNames = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

const isInteractiveElement = (target) => {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  let element = target;
  while (element && element instanceof Element) {
    if (element.isContentEditable) {
      return true;
    }
    const tagName = element.tagName;
    if (tagName && interactiveTagNames.has(tagName)) {
      return true;
    }
    element = element.parentElement;
  }

  return false;
};

window.addEventListener("keydown", (event) => {
  if (onboardingInstance) {
    return;
  }

  const interactive = isInteractiveElement(event.target);
  if (movementKeyCodes.has(event.code) && !interactive) {
    event.preventDefault();
  }
  if (interactive) {
    return;
  }

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
  resetMovementInput();
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

layoutEditor = createLobbyLayoutEditor({
  canvas,
  surface: ui.canvasSurface,
  interactables,
  platforms,
  portal,
  defaultLayout: defaultLobbyLayout,
  captureLayout: captureLobbyLayoutSnapshot,
  applyLayoutSnapshot: applyLobbyLayoutSnapshot,
  saveLayoutSnapshot: saveLobbyLayoutSnapshot,
  clearLayoutSnapshot: clearLobbyLayoutSnapshot,
  refreshWorldBounds: () => {
    worldWrapWidth = computeWorldWrapWidth();
    cameraScrollX = clampCameraScroll(cameraScrollX);
  },
  getCameraOffset: () => cameraScrollX,
  getWorldWidth: () => worldWrapWidth,
  initialHasCustomLayout: hasCustomLobbyLayout,
  onStateChange: ({ active, hasCustomLayout }) => {
    if (typeof ui.setLayoutEditingActive === "function") {
      ui.setLayoutEditingActive(active);
    }
    if (typeof ui.setLayoutResetAvailable === "function") {
      ui.setLayoutResetAvailable(hasCustomLayout);
    }
  }
});

if (ui.layoutCustomizeButton) {
  ui.layoutCustomizeButton.addEventListener("click", () => {
    if (!layoutEditor) {
      return;
    }
    layoutEditor.toggle();
  });
}

if (ui.layoutResetButton) {
  ui.layoutResetButton.addEventListener("click", () => {
    if (!layoutEditor) {
      return;
    }
    layoutEditor.resetLayout();
  });
}

if (typeof ui.setLayoutEditingActive === "function") {
  ui.setLayoutEditingActive(false);
}
if (typeof ui.setLayoutResetAvailable === "function") {
  ui.setLayoutResetAvailable(layoutEditor?.hasCustomLayout?.() ?? hasCustomLobbyLayout);
}

if (activeAccount) {
  showMessage(defaultMessage, 0);
} else {
  showMessage("Create your Astrocat account to begin your mission.", 0);
}
ui.updateCrystals(0, crystals.length);
ui.refresh(playerStats);
refreshMissionDisplay();

const update = createUpdate({
  state: {
    player,
    playerStats,
    portal,
    crystals,
    interactables,
    platforms,
    groundY,
    portalRequiredLevel,
    getPortalCharge: () => portalCharge,
    setPortalCharge: (value) => {
      portalCharge = value;
    },
    isPortalCharged: () => portalCharged,
    setPortalCharged: (value) => {
      portalCharged = value;
    },
    isPortalCompleted: () => portalCompleted,
    setPortalCompleted: (value) => {
      portalCompleted = value;
    },
    getCrystalRunStartTime: () => crystalRunStartTime,
    setCrystalRunStartTime: (value) => {
      crystalRunStartTime = value;
    },
    getParallaxScroll: () => parallaxScroll,
    setParallaxScroll: (value) => {
      parallaxScroll = value;
    },
    getLayoutEditor: () => layoutEditor,
    isMiniGameActive: () => miniGameActive,
    getCameraScrollX: () => cameraScrollX,
    getRenderScale: () => renderScale,
    viewport
  },
  world: {
    getWorldOffsetsAround,
    createWorldInstance,
    isNear,
    getInteractableDisplayName
  },
  movementHint: {
    isVisible: () => movementHintVisible,
    setVisible: (value) => {
      movementHintVisible = value;
    },
    isAcknowledged: () => movementHintAcknowledged,
    wasShownThisSession: () => movementHintShownThisSession,
    setShownThisSession: (value) => {
      movementHintShownThisSession = value;
    },
    getIdleTime: () => movementHintIdleTime,
    setIdleTime: (value) => {
      movementHintIdleTime = value;
    },
    dismiss: dismissMovementHint
  },
  input: {
    keys,
    wasKeyJustPressed
  },
  ui,
  audio,
  notifyFirstSessionChecklist,
  showMessage,
  gainExperience,
  completeMission,
  openMiniGame,
  effects: {
    queueEffect,
    createJumpDustEffect,
    createCrystalBurstEffect,
    createPortalActivationEffect,
    createScreenShakeEffect
  },
  updateCameraScrollPosition,
  constants: {
    MOVEMENT_HINT_IDLE_THRESHOLD,
    PARALLAX_IDLE_SCROLL_SPEED,
    CHECKLIST_EVENTS,
    CRYSTAL_SPRINT_TARGET_MS
  },
  utils: { clamp }
});

const renderState = {
  getRenderScale: () => renderScale,
  getDevicePixelScale: () => devicePixelScale,
  getCameraScrollX: () => cameraScrollX,
  viewport,
  getWorldWrapOffsetsForView: (cameraOffset, viewportWidth = viewport.width, margin = 0) =>
    computeWorldWrapOffsetsForView(
      cameraOffset,
      viewportWidth,
      worldWrapWidth,
      worldWrapRenderOffsetsScratch,
      margin
    ),
  wrapOffset,
  parallaxLayers,
  getParallaxScroll: () => parallaxScroll,
  groundY,
  getFallbackBackgroundGradient,
  getBackgroundVideoState: () =>
    typeof ui?.getBackgroundVideoState === "function"
      ? ui.getBackgroundVideoState()
      : "disabled",
  platformSprite,
  platforms,
  isWorldInstanceVisible,
  createWorldInstance,
  portal,
  isPortalCharged: () => portalCharged,
  interactables,
  crystals,
  player,
  getLayoutEditor: () => layoutEditor,
  ui,
  playerSpriteState,
  playerAppearance,
  promptFont,
  getPromptMetrics,
  sprites: {
    chestSprite,
    arcadeSprite,
    fountainSprite,
    guideSprite,
    crystalSprite
  }
};

const renderFrame = createRender(renderState);

startGameLoop(
  (delta) => update(delta),
  (timestamp) => renderFrame(ctx, timestamp),
  {
    justPressed,
    frameJustPressed,
    emptyJustPressedSet,
    setCurrentJustPressed: (set) => {
      currentJustPressed = set;
    },
    clearJustPressed: () => {
      justPressed.clear();
    }
  }
);

function createLobbyLayoutEditor(options = {}) {
  const {
    canvas: editorCanvas,
    surface: surfaceElement,
    interactables: editableInteractables = [],
    platforms: editablePlatforms = [],
    portal: portalEntity = null,
    defaultLayout = null,
    captureLayout,
    applyLayoutSnapshot: applyLayout,
    saveLayoutSnapshot: persistLayoutSnapshot,
    clearLayoutSnapshot: clearLayoutSnapshot,
    refreshWorldBounds,
    getCameraOffset,
    getWorldWidth,
    getWorldOffsets = getWorldOffsetsAround,
    initialHasCustomLayout = false,
    onStateChange
  } = options;

  if (!editorCanvas || !surfaceElement) {
    return {
      activate() {},
      deactivate() {},
      toggle() {},
      resetLayout() {},
      drawOverlay() {},
      isActive: () => false,
      hasCustomLayout: () => Boolean(initialHasCustomLayout)
    };
  }

  const editableEntities = [];

  for (const interactable of editableInteractables) {
    if (!interactable || typeof interactable !== "object") {
      continue;
    }
    const rawLabel =
      interactable.label ??
      interactable.name ??
      interactable.type ??
      interactable.id ??
      "Asset";
    const label = typeof rawLabel === "string" ? rawLabel.trim() : String(rawLabel ?? "");
    editableEntities.push({
      entity: interactable,
      label
    });
  }

  editablePlatforms.forEach((platform, index) => {
    if (!platform || typeof platform !== "object") {
      return;
    }
    const defaultLabel = `Platform ${index + 1}`;
    const rawLabel = platform.label ?? platform.name ?? platform.id ?? defaultLabel;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : String(rawLabel ?? defaultLabel);
    const platformWidth = typeof platform.width === "number" ? platform.width : 0;
    const platformHeight = typeof platform.height === "number" ? platform.height : 0;
    const horizontalPadding =
      platformWidth > 0 ? Math.max(12, Math.min(48, Math.round(platformWidth * 0.08))) : 12;
    const verticalPadding =
      platformHeight > 0 ? Math.max(24, Math.min(48, Math.round(platformHeight * 2))) : 24;
    editableEntities.push({
      entity: platform,
      label,
      hitboxPadding: {
        x: horizontalPadding,
        y: verticalPadding
      }
    });
  });

  if (portalEntity && typeof portalEntity === "object") {
    const rawLabel = portalEntity.label ?? portalEntity.name ?? portalEntity.id ?? "Portal";
    const label = typeof rawLabel === "string" ? rawLabel.trim() : String(rawLabel ?? "Portal");
    editableEntities.push({ entity: portalEntity, label });
  }

  const hint = document.createElement("div");
  hint.className = "layout-editor__hint";
  hint.textContent = "Drag assets to reposition them. Lock the layout when you are done.";
  surfaceElement.append(hint);

  const state = {
    active: false,
    pointerId: null,
    dragging: null,
    hasCustomLayout: Boolean(initialHasCustomLayout)
  };

  const emitState = () => {
    if (typeof onStateChange === "function") {
      onStateChange({ active: state.active, hasCustomLayout: state.hasCustomLayout });
    }
  };

  const setCustomLayoutState = (value) => {
    const next = Boolean(value);
    if (state.hasCustomLayout !== next) {
      state.hasCustomLayout = next;
      emitState();
      return true;
    }
    return false;
  };

  const persistLayout = () => {
    if (typeof captureLayout !== "function") {
      setCustomLayoutState(false);
      return;
    }
    const snapshot = captureLayout();
    const isDefault = defaultLayout ? areLayoutsEqual(snapshot, defaultLayout) : false;
    if (isDefault) {
      if (typeof clearLayoutSnapshot === "function") {
        clearLayoutSnapshot();
      }
    } else if (typeof persistLayoutSnapshot === "function") {
      persistLayoutSnapshot(snapshot);
    }
    if (!setCustomLayoutState(!isDefault)) {
      emitState();
    }
    if (typeof refreshWorldBounds === "function") {
      refreshWorldBounds();
    }
  };

  const cancelDrag = () => {
    if (state.pointerId !== null) {
      try {
        editorCanvas.releasePointerCapture(state.pointerId);
      } catch (error) {
        // Ignore release errors on unsupported browsers.
      }
    }
    state.pointerId = null;
    state.dragging = null;
    surfaceElement.classList.remove("is-dragging");
  };

  const getWorldPosition = (event) => {
    const rect = editorCanvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    const ratioX = rect.width > 0 ? cssX / rect.width : 0;
    const ratioY = rect.height > 0 ? cssY / rect.height : 0;
    const cameraOffset = typeof getCameraOffset === "function" ? getCameraOffset() : 0;
    return {
      x: cameraOffset + ratioX * viewport.width,
      y: ratioY * viewport.height
    };
  };

  const findEntityAt = (worldX, worldY) => {
    const offsets = typeof getWorldOffsets === "function" ? getWorldOffsets(worldX) : [0];
    let best = null;
    let bestDistance = Infinity;

    for (const entry of editableEntities) {
      const entity = entry.entity;
      if (!entity) {
        continue;
      }
      const width = entity.width ?? 0;
      const height = entity.height ?? 0;
      if (!(width > 0) || !(height > 0)) {
        continue;
      }
      const paddingX = entry.hitboxPadding && typeof entry.hitboxPadding.x === "number"
        ? Math.max(0, entry.hitboxPadding.x)
        : 0;
      const paddingY = entry.hitboxPadding && typeof entry.hitboxPadding.y === "number"
        ? Math.max(0, entry.hitboxPadding.y)
        : Math.max(0, height < 32 ? Math.round((32 - height) / 2) : 0);
      for (const offset of offsets) {
        const candidateX = (entity.x ?? 0) + offset;
        const candidateY = entity.y ?? 0;
        const hitLeft = candidateX - paddingX;
        const hitRight = candidateX + width + paddingX;
        const hitTop = candidateY - paddingY;
        const hitBottom = candidateY + height + paddingY;
        const withinX = worldX >= hitLeft && worldX <= hitRight;
        const withinY = worldY >= hitTop && worldY <= hitBottom;
        if (!withinX || !withinY) {
          continue;
        }
        const pointerOffsetX = Math.max(0, Math.min(width, worldX - candidateX));
        const pointerOffsetY = Math.max(0, Math.min(height, worldY - candidateY));
        const anchorX = candidateX + pointerOffsetX;
        const anchorY = candidateY + pointerOffsetY;
        const dx = worldX - anchorX;
        const dy = worldY - anchorY;
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = {
            entity,
            label: entry.label,
            offset,
            pointerOffsetX,
            pointerOffsetY
          };
        }
      }
    }

    return best;
  };

  const updateEntityPosition = (worldX, worldY) => {
    if (!state.dragging) {
      return;
    }
    const { entity, offset, pointerOffsetX, pointerOffsetY } = state.dragging;
    const width = entity.width ?? 0;
    const height = entity.height ?? 0;
    const wrapWidth = typeof getWorldWidth === "function" ? getWorldWidth() : viewport.width;
    const minX = Math.round(-viewport.width);
    const maxX = Math.round(Math.max(wrapWidth, viewport.width) + viewport.width);
    const minY = Math.round(-viewport.height * 0.25);
    const maxY = Math.round(Math.max(groundY - height, minY + viewport.height));
    const targetX = worldX - pointerOffsetX - offset;
    const targetY = worldY - pointerOffsetY;
    entity.x = clamp(Math.round(targetX), minX, maxX);
    entity.y = clamp(Math.round(targetY), minY, maxY);
    state.dragging.moved = true;
  };

  const handlePointerDown = (event) => {
    if (!state.active) {
      return;
    }
    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }
    const world = getWorldPosition(event);
    const selection = findEntityAt(world.x, world.y);
    if (!selection) {
      return;
    }
    state.pointerId = event.pointerId;
    state.dragging = { ...selection, moved: false };
    surfaceElement.classList.add("is-dragging");
    event.preventDefault();
    if (typeof editorCanvas.setPointerCapture === "function") {
      try {
        editorCanvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture errors.
      }
    }
  };

  const handlePointerMove = (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }
    event.preventDefault();
    const world = getWorldPosition(event);
    updateEntityPosition(world.x, world.y);
  };

  const handlePointerUp = (event) => {
    if (state.pointerId !== null && event.pointerId !== state.pointerId) {
      return;
    }
    if (event.type !== "pointercancel") {
      event.preventDefault();
    }
    const moved = Boolean(state.dragging?.moved);
    cancelDrag();
    if (moved) {
      persistLayout();
    } else {
      emitState();
    }
  };

  const addListeners = () => {
    editorCanvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const removeListeners = () => {
    editorCanvas.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
  };

  const activate = () => {
    if (state.active) {
      return;
    }
    state.active = true;
    surfaceElement.classList.add("is-editing");
    hint.classList.add("is-visible");
    keys.clear();
    justPressed.clear();
    resetMovementInput();
    addListeners();
    emitState();
  };

  const deactivate = ({ persist = false } = {}) => {
    if (!state.active) {
      if (persist) {
        persistLayout();
      }
      return;
    }
    state.active = false;
    hint.classList.remove("is-visible");
    surfaceElement.classList.remove("is-editing");
    cancelDrag();
    removeListeners();
    if (persist) {
      persistLayout();
    } else {
      emitState();
    }
  };

  const toggle = () => {
    if (state.active) {
      deactivate({ persist: true });
    } else {
      activate();
    }
  };

  const resetLayout = () => {
    if (typeof applyLayout === "function" && defaultLayout) {
      applyLayout(defaultLayout);
    }
    persistLayout();
  };

  const drawOverlay = (context) => {
    if (!state.active || !context) {
      return;
    }
    const cameraOffset = typeof getCameraOffset === "function" ? getCameraOffset() : 0;
    context.save();
    context.translate(-cameraOffset, 0);
    for (const entry of editableEntities) {
      const entity = entry.entity;
      if (!entity) {
        continue;
      }
      const width = entity.width ?? 0;
      const height = entity.height ?? 0;
      if (!(width > 0) || !(height > 0)) {
        continue;
      }
      context.save();
      context.lineWidth = 2;
      const isActive = state.dragging && state.dragging.entity === entity;
      context.strokeStyle = isActive
        ? "rgba(255, 214, 102, 0.95)"
        : "rgba(255, 255, 255, 0.55)";
      context.setLineDash(isActive ? [6, 6] : [10, 10]);
      context.strokeRect(entity.x, entity.y, width, height);
      context.setLineDash([]);
      if (entry.label) {
        context.font = "18px 'Baloo 2', 'Segoe UI', sans-serif";
        context.fillStyle = "rgba(18, 24, 48, 0.7)";
        context.textBaseline = "bottom";
        const textX = entity.x + 6;
        const textY = Math.max(entity.y - 6, 24);
        context.fillText(entry.label, textX, textY);
      }
      context.restore();
    }
    context.restore();
  };

  return {
    activate,
    deactivate,
    toggle,
    resetLayout,
    drawOverlay,
    isActive: () => state.active,
    hasCustomLayout: () => Boolean(state.hasCustomLayout),
    setHasCustomLayout: (value) => {
      setCustomLayoutState(value);
    }
  };
}

const worldInstanceCache = new WeakMap();

function createWorldInstance(entity, offset) {
  if (!entity || !Number.isFinite(offset) || offset === 0) {
    return entity;
  }

  let instance = worldInstanceCache.get(entity);
  if (!instance) {
    instance = {};
    worldInstanceCache.set(entity, instance);
  }

  Object.assign(instance, entity);

  if (typeof entity.x === "number") {
    instance.x = entity.x + offset;
  } else {
    delete instance.x;
  }

  if (typeof entity.promptAnchorX === "number") {
    instance.promptAnchorX = entity.promptAnchorX + offset;
  } else {
    delete instance.promptAnchorX;
  }

  return instance;
}

function isWorldInstanceVisible(x, width, cameraOffset, margin = 96) {
  const left = cameraOffset - margin;
  const right = cameraOffset + viewport.width + margin;
  return x + width > left && x < right;
}

function createOnboardingExperience(config = {}) {
  const {
    initialAccount = null,
    onComplete,
    savedAccounts = [],
    walletAddress = null
  } = config;

  const idSuffix = Math.random().toString(36).slice(2, 8);
  const root = document.createElement("div");
  root.className = "onboarding-overlay";

  const modal = document.createElement("div");
  modal.className = "onboarding-modal";
  root.append(modal);

  const heading = document.createElement("h2");
  heading.className = "onboarding-heading";
  heading.textContent = walletAddress
    ? "Finalize your Astrocat profile"
    : "Connect your wallet to begin";
  modal.append(heading);

  const intro = document.createElement("p");
  intro.className = "onboarding-intro";
  intro.textContent = walletAddress
    ? "Your Solana wallet will be linked to this pilot profile. Choose your Astrocat and lock in your stats before launch."
    : "Link a Solana wallet from the toolbar to generate your call sign and customize your Astrocat.";
  modal.append(intro);

  const stepsList = document.createElement("ol");
  stepsList.className = "onboarding-steps";
  const stepDetails = [
    {
      title: "Link your wallet",
      description:
        "A unique call sign is generated for the connected wallet. Copy it so you can reference it later."
    },
    {
      title: "Choose your Astrocat",
      description:
        "Preview each companion and spend your bonus stat points to lock in a launch-ready build."
    },
    {
      title: "Confirm your pilot",
      description:
        "Name your Astrocat and save the profile to your wallet before heading to the launch bay."
    }
  ];

  stepDetails.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = "onboarding-steps__item";
    const badge = document.createElement("span");
    badge.className = "onboarding-steps__badge";
    badge.textContent = `Step ${index + 1}`;
    const title = document.createElement("span");
    title.className = "onboarding-steps__title";
    title.textContent = step.title;
    const detail = document.createElement("p");
    detail.className = "onboarding-steps__detail";
    detail.textContent = step.description;
    item.append(badge, title, detail);
    stepsList.append(item);
  });
  modal.append(stepsList);

  const layout = document.createElement("div");
  layout.className = "onboarding-layout";
  modal.append(layout);

  const supportColumn = document.createElement("div");
  supportColumn.className = "onboarding-column onboarding-column--support";
  layout.append(supportColumn);
  const walletHint = document.createElement("p");
  walletHint.className = "onboarding-hint";
  walletHint.textContent = walletAddress
    ? `Linked wallet · ${formatWalletAddress(walletAddress)}`
    : "Connect your Solana wallet from the toolbar to generate a call sign.";
  supportColumn.append(walletHint);


  const primaryColumn = document.createElement("div");
  primaryColumn.className = "onboarding-column onboarding-column--primary";
  layout.append(primaryColumn);

  const selectableAccounts = Array.isArray(savedAccounts)
    ? savedAccounts
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({ ...entry }))
    : [];

  if (selectableAccounts.length > 0) {
    const savedSection = document.createElement("div");
    savedSection.className = "onboarding-saved";

    const savedTitle = document.createElement("h3");
    savedTitle.className = "onboarding-saved__title";
    savedTitle.textContent = "Saved profiles on this device";

    const savedHint = document.createElement("p");
    savedHint.className = "onboarding-saved__hint";
    savedHint.textContent =
      "Reconnect with the wallet tied to a profile to resume progress instantly.";

    const savedList = document.createElement("ul");
    savedList.className = "onboarding-saved__list";

    for (const profile of selectableAccounts) {
      const item = document.createElement("li");
      item.className = "onboarding-saved__item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "onboarding-saved__button";
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      const handleLabel =
        profile && typeof profile.callSign === "string" && profile.callSign
          ? `@${profile.callSign}`
          : "Unknown";
      const nameLabel =
        profile && typeof profile.catName === "string" && profile.catName
          ? profile.catName
          : "Unnamed";
      button.textContent = `${handleLabel} · ${nameLabel}`;
      item.append(button);
      savedList.append(item);
    }

    savedSection.append(savedTitle, savedHint, savedList);
    supportColumn.append(savedSection);
  }

  const form = document.createElement("form");
  form.className = "onboarding-form onboarding-form--create";
  primaryColumn.append(form);

  const callSignField = document.createElement("div");
  callSignField.className = "onboarding-field onboarding-field--static onboarding-field--wide";
  const callSignLabel = document.createElement("span");
  callSignLabel.className = "onboarding-label";
  callSignLabel.textContent = "Assigned call sign";
  const callSignValue = document.createElement("span");
  callSignValue.className = "onboarding-call-sign";
  const callSignDisplay = document.createElement("div");
  callSignDisplay.className = "onboarding-call-sign__display";
  callSignDisplay.append(callSignValue);
  const callSignCopyButton = document.createElement("button");
  callSignCopyButton.type = "button";
  callSignCopyButton.className = "onboarding-call-sign__copy";
  callSignCopyButton.textContent = "Copy call sign";
  callSignCopyButton.setAttribute("aria-label", "Copy your assigned call sign");
  callSignDisplay.append(callSignCopyButton);
  const callSignHint = document.createElement("p");
  callSignHint.className = "onboarding-hint";
  callSignHint.textContent = "We'll pin it to Saved Profiles on this device once you finish.";
  const callSignNote = document.createElement("p");
  callSignNote.className = "onboarding-call-sign__note";
  callSignNote.textContent =
    "This call sign is linked to your wallet. Copy it for your records before you launch.";
  const callSignCopyFeedback = document.createElement("span");
  callSignCopyFeedback.className = "onboarding-call-sign__feedback";
  callSignCopyFeedback.setAttribute("role", "status");
  callSignCopyFeedback.setAttribute("aria-live", "polite");
  callSignCopyFeedback.hidden = true;
  const callSignActions = document.createElement("div");
  callSignActions.className = "onboarding-call-sign__actions";
  callSignActions.append(callSignCopyButton, callSignCopyFeedback);
  callSignField.append(callSignLabel, callSignDisplay, callSignHint, callSignNote, callSignActions);

  const availableStarters =
    Array.isArray(starterCharacters) && starterCharacters.length > 0
      ? starterCharacters
      : [defaultStarterCharacter];
  let activeStarterIndex = isValidStarterId(initialAccount?.starterId)
    ? availableStarters.findIndex((entry) => entry.id === initialAccount.starterId)
    : availableStarters.findIndex((entry) => entry.id === defaultStarterCharacter.id);
  if (activeStarterIndex < 0) {
    activeStarterIndex = 0;
  }
  let selectedStarterId =
    availableStarters[activeStarterIndex]?.id ?? defaultStarterCharacter.id;

  const starterField = document.createElement("div");
  starterField.className = "onboarding-field onboarding-field--wide onboarding-field--starter";
  const starterLabel = document.createElement("span");
  starterLabel.className = "onboarding-label";
  starterLabel.textContent = "Choose your Astrocat";
  const starterCarousel = document.createElement("div");
  starterCarousel.className = "starter-carousel";
  starterCarousel.setAttribute("aria-label", "Starter selection");

  const prevStarterButton = document.createElement("button");
  prevStarterButton.type = "button";
  prevStarterButton.className = "starter-carousel__control starter-carousel__control--prev";
  prevStarterButton.setAttribute("aria-label", "Previous Astrocat");
  prevStarterButton.innerHTML = "&#x2039;";

  const nextStarterButton = document.createElement("button");
  nextStarterButton.type = "button";
  nextStarterButton.className = "starter-carousel__control starter-carousel__control--next";
  nextStarterButton.setAttribute("aria-label", "Next Astrocat");
  nextStarterButton.innerHTML = "&#x203A;";

  const starterViewport = document.createElement("div");
  starterViewport.className = "starter-carousel__viewport";
  const starterTrack = document.createElement("div");
  starterTrack.className = "starter-carousel__track";
  starterViewport.append(starterTrack);

  const starterIndicators = document.createElement("div");
  starterIndicators.className = "starter-carousel__indicators";

  starterCarousel.append(
    prevStarterButton,
    starterViewport,
    nextStarterButton,
    starterIndicators
  );

  const starterInfo = document.createElement("div");
  starterInfo.className = "starter-carousel__info";
  const starterName = document.createElement("h3");
  starterName.className = "starter-carousel__name";
  const starterTagline = document.createElement("p");
  starterTagline.className = "starter-carousel__tagline";
  const starterDescription = document.createElement("p");
  starterDescription.className = "starter-carousel__description";
  starterInfo.append(starterName, starterTagline, starterDescription);

  const starterHint = document.createElement("p");
  starterHint.className = "onboarding-hint";
  starterHint.textContent =
    "Cycle through the crew portraits to meet each Astrocat before choosing your companion.";

  starterField.append(starterLabel, starterCarousel, starterInfo, starterHint);

  const creationBaseAttributes = createInitialAttributeState();
  const creationAllocation = {};
  for (const definition of attributeDefinitions) {
    creationAllocation[definition.key] = 0;
  }
  let remainingCreationPoints = CHARACTER_CREATION_POINTS;

  const statsField = document.createElement("div");
  statsField.className = "onboarding-field onboarding-field--wide onboarding-field--stats";
  const statsHeader = document.createElement("div");
  statsHeader.className = "stat-allocation__header";
  const statsLabel = document.createElement("span");
  statsLabel.className = "onboarding-label";
  statsLabel.textContent = "Allocate stat points";
  const statsPointsRemaining = document.createElement("span");
  statsPointsRemaining.className = "stat-allocation__points";
  statsHeader.append(statsLabel, statsPointsRemaining);
  const statsHint = document.createElement("p");
  statsHint.className = "onboarding-hint";
  statsHint.textContent =
    `Distribute ${CHARACTER_CREATION_POINTS} bonus points to shape your launch-ready build.`;
  const statsList = document.createElement("div");
  statsList.className = "stat-allocation__list";
  const statsError = document.createElement("p");
  statsError.className = "stat-allocation__error";
  statsError.hidden = true;
  statsField.append(statsHeader, statsHint, statsList, statsError);

  const starterSlides = [];
  const starterDots = [];
  const statRows = new Map();

  function normalizeCreationAllocation(bonusSource = {}) {
    const normalized = {};
    let used = 0;
    for (const definition of attributeDefinitions) {
      const raw = bonusSource?.[definition.key];
      const bonus = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
      normalized[definition.key] = bonus;
      used += bonus;
    }
    if (used > CHARACTER_CREATION_POINTS) {
      let overflow = used - CHARACTER_CREATION_POINTS;
      const reducers = attributeDefinitions
        .map((definition) => ({
          key: definition.key,
          bonus: normalized[definition.key]
        }))
        .sort((a, b) => b.bonus - a.bonus || a.key.localeCompare(b.key));
      for (const entry of reducers) {
        while (entry.bonus > 0 && overflow > 0) {
          entry.bonus -= 1;
          normalized[entry.key] -= 1;
          overflow -= 1;
        }
        if (overflow === 0) {
          break;
        }
      }
      used = CHARACTER_CREATION_POINTS;
    }
    return { allocation: normalized, used: Math.min(used, CHARACTER_CREATION_POINTS) };
  }

  function updateAllocationUI() {
    const pointsLabel =
      remainingCreationPoints === 1
        ? "1 pt remaining"
        : `${remainingCreationPoints} pts remaining`;
    statsPointsRemaining.textContent = pointsLabel;
    for (const definition of attributeDefinitions) {
      const row = statRows.get(definition.key);
      if (!row) {
        continue;
      }
      const baseValue = creationBaseAttributes[definition.key];
      const bonus = creationAllocation[definition.key] ?? 0;
      const total = baseValue + bonus;
      row.value.textContent = `${total}`;
      row.value.title =
        bonus > 0 ? `${baseValue} base + ${bonus} bonus` : `${baseValue} base`;
      row.decrease.disabled = bonus === 0;
      row.increase.disabled = remainingCreationPoints === 0;
    }
    statsError.hidden = true;
  }

  function applyStarterAllocation(starter, resetAllocation) {
    if (!resetAllocation) {
      updateAllocationUI();
      return;
    }
    const normalized = normalizeCreationAllocation(starter?.recommendedAllocation ?? {});
    for (const definition of attributeDefinitions) {
      creationAllocation[definition.key] = normalized.allocation[definition.key] ?? 0;
    }
    remainingCreationPoints = Math.max(
      0,
      CHARACTER_CREATION_POINTS - normalized.used
    );
    updateAllocationUI();
  }

  function adjustAllocation(attributeKey, delta) {
    if (!Object.prototype.hasOwnProperty.call(creationAllocation, attributeKey) || delta === 0) {
      return;
    }
    const current = creationAllocation[attributeKey] ?? 0;
    if (delta > 0) {
      if (remainingCreationPoints === 0) {
        return;
      }
      creationAllocation[attributeKey] = current + 1;
      remainingCreationPoints = Math.max(0, remainingCreationPoints - 1);
    } else if (delta < 0) {
      if (current === 0) {
        return;
      }
      creationAllocation[attributeKey] = current - 1;
      remainingCreationPoints = Math.min(
        CHARACTER_CREATION_POINTS,
        remainingCreationPoints + 1
      );
    }
    statsError.hidden = true;
    updateAllocationUI();
  }

  function setActiveStarter(index, options = {}) {
    if (availableStarters.length === 0) {
      return;
    }
    const length = availableStarters.length;
    const normalizedIndex = ((index % length) + length) % length;
    activeStarterIndex = normalizedIndex;
    const starter = availableStarters[normalizedIndex] ?? defaultStarterCharacter;
    selectedStarterId = starter.id ?? defaultStarterCharacter.id;
    starterTrack.style.transform = `translateX(-${normalizedIndex * 100}%)`;
    starterSlides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === normalizedIndex);
    });
    starterDots.forEach((button, buttonIndex) => {
      const isActive = buttonIndex === normalizedIndex;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    starterName.textContent = starter.name ?? "Astrocat";
    starterTagline.textContent = starter.tagline ?? "";
    starterDescription.textContent = starter.description ?? "";
    const preserveAllocation = options.preserveAllocation === true;
    applyStarterAllocation(starter, !preserveAllocation);
  }

  availableStarters.forEach((starter, index) => {
    const slide = document.createElement("figure");
    slide.className = "starter-carousel__slide";
    const image = document.createElement("img");
    image.className = "starter-carousel__image";
    image.src = starter.image;
    image.alt = `${starter.name} portrait`;
    slide.append(image);
    slide.addEventListener("click", () => {
      setActiveStarter(index);
    });
    starterTrack.append(slide);
    starterSlides.push(slide);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "starter-carousel__indicator";
    dot.setAttribute("aria-label", `Select ${starter.name}`);
    dot.addEventListener("click", () => {
      setActiveStarter(index);
    });
    starterIndicators.append(dot);
    starterDots.push(dot);
  });

  prevStarterButton.addEventListener("click", () => {
    if (availableStarters.length <= 1) {
      return;
    }
    setActiveStarter(activeStarterIndex - 1);
  });
  nextStarterButton.addEventListener("click", () => {
    if (availableStarters.length <= 1) {
      return;
    }
    setActiveStarter(activeStarterIndex + 1);
  });
  prevStarterButton.disabled = availableStarters.length <= 1;
  nextStarterButton.disabled = availableStarters.length <= 1;

  for (const definition of attributeDefinitions) {
    const item = document.createElement("div");
    item.className = "stat-allocation__item";
    const meta = document.createElement("div");
    meta.className = "stat-allocation__meta";
    const label = document.createElement("span");
    label.className = "stat-allocation__label";
    label.textContent = definition.label;
    const hint = document.createElement("p");
    hint.className = "stat-allocation__hint";
    hint.textContent = definition.description;
    meta.append(label, hint);
    const controls = document.createElement("div");
    controls.className = "stat-allocation__controls";
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.className = "stat-allocation__button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", `Remove point from ${definition.label}`);
    decrease.addEventListener("click", () => adjustAllocation(definition.key, -1));
    const value = document.createElement("span");
    value.className = "stat-allocation__value";
    const increase = document.createElement("button");
    increase.type = "button";
    increase.className = "stat-allocation__button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", `Add point to ${definition.label}`);
    increase.addEventListener("click", () => adjustAllocation(definition.key, 1));
    controls.append(decrease, value, increase);
    item.append(meta, controls);
    statsList.append(item);
    statRows.set(definition.key, { value, increase, decrease });
  }

  if (initialAccount?.attributes && typeof initialAccount.attributes === "object") {
    const bonusSource = {};
    for (const definition of attributeDefinitions) {
      const raw = initialAccount.attributes?.[definition.key];
      if (Number.isFinite(raw)) {
        const normalizedValue = Math.max(definition.base, Math.floor(raw));
        bonusSource[definition.key] = Math.max(0, normalizedValue - definition.base);
      }
    }
    const normalized = normalizeCreationAllocation(bonusSource);
    for (const definition of attributeDefinitions) {
      creationAllocation[definition.key] = normalized.allocation[definition.key] ?? 0;
    }
    remainingCreationPoints = Math.max(
      0,
      CHARACTER_CREATION_POINTS - normalized.used
    );
  }

  setActiveStarter(activeStarterIndex, {
    preserveAllocation: Boolean(initialAccount?.attributes)
  });

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
  nameInput.autocomplete = "nickname";
  nameLabel.setAttribute("for", nameInput.id);
  const nameHint = document.createElement("p");
  nameHint.className = "onboarding-hint";
  nameHint.textContent = "Give your cosmic companion a memorable title.";
  nameField.append(nameLabel, nameInput, nameHint);

  const formFeedback = document.createElement("p");
  formFeedback.className = "onboarding-feedback";
  formFeedback.hidden = true;
  formFeedback.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "onboarding-actions";
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "onboarding-submit";
  submitButton.textContent = walletAddress ? "Link profile" : "Connect wallet to continue";
  submitButton.disabled = !walletAddress;
  actions.append(submitButton);

  form.append(
    callSignField,
    starterField,
    statsField,
    nameField,
    formFeedback,
    actions
  );

  let callSignCopyFeedbackTimer = null;
  let callSignCopyButtonTimer = null;
  const defaultCopyCallSignLabel = callSignCopyButton.textContent;

  function resetCallSignCopyFeedback() {
    if (callSignCopyFeedbackTimer) {
      clearTimeout(callSignCopyFeedbackTimer);
      callSignCopyFeedbackTimer = null;
    }
    callSignCopyFeedback.textContent = "";
    callSignCopyFeedback.hidden = true;
    callSignCopyFeedback.classList.remove("is-success", "is-error");
  }

  function resetCallSignCopyButton() {
    if (callSignCopyButtonTimer) {
      clearTimeout(callSignCopyButtonTimer);
      callSignCopyButtonTimer = null;
    }
    callSignCopyButton.disabled = false;
    callSignCopyButton.textContent = defaultCopyCallSignLabel;
  }

  function resetCallSignCopyUI() {
    resetCallSignCopyFeedback();
    resetCallSignCopyButton();
  }

  function announceCallSignCopyFeedback(message, variant) {
    resetCallSignCopyFeedback();
    callSignCopyFeedback.textContent = message;
    if (variant === "error") {
      callSignCopyFeedback.classList.add("is-error");
    } else {
      callSignCopyFeedback.classList.add("is-success");
    }
    callSignCopyFeedback.hidden = false;
    callSignCopyFeedbackTimer = setTimeout(() => {
      resetCallSignCopyFeedback();
    }, 4000);
  }

  function formatCallSignDisplay(value) {
    const normalized =
      typeof value === "string" ? value.replace(/\D+/g, "").slice(0, callSignLength) : "";
    if (!normalized) {
      return { text: "Generating…", raw: "" };
    }
    const leading = normalized.slice(0, 2);
    const trailing = normalized.slice(2);
    const formatted = trailing ? `${leading} ${trailing}` : leading;
    return { text: `@${formatted}`, raw: normalized };
  }

  function updateCallSignDisplay(value) {
    const formatted = formatCallSignDisplay(value);
    callSignValue.textContent = formatted.text;
    callSignValue.dataset.rawCallSign = formatted.raw;
    callSignValue.title = formatted.raw ? `Call sign @${formatted.raw}` : "Generating call sign";
    callSignValue.setAttribute(
      "aria-label",
      formatted.raw ? `Assigned call sign @${formatted.raw}` : "Generating call sign"
    );
    if (formatted.raw) {
      resetCallSignCopyUI();
    }
  }

  async function copyCallSignToClipboard(value) {
    if (!value) {
      return false;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (error) {
      // Ignore and fall through to the legacy path.
    }

    if (typeof document === "undefined") {
      return false;
    }

    try {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      helper.style.pointerEvents = "none";
      document.body.append(helper);
      helper.focus();
      helper.select();
      helper.setSelectionRange(0, helper.value.length);
      const succeeded = document.execCommand("copy");
      helper.remove();
      return succeeded;
    } catch (error) {
      return false;
    }
  }

  let pendingCallSign = null;

  callSignCopyButton.addEventListener("click", async () => {
    resetCallSignCopyUI();
    callSignCopyButton.disabled = true;
    callSignCopyButton.textContent = "Copying…";
    const rawCallSign = callSignValue.dataset.rawCallSign || pendingCallSign || "";
    if (!rawCallSign) {
      callSignCopyButton.disabled = false;
      callSignCopyButton.textContent = defaultCopyCallSignLabel;
      announceCallSignCopyFeedback("Call sign is generating. Try again in a moment.", "error");
      return;
    }

    let success = await copyCallSignToClipboard(`@${rawCallSign}`);
    if (!success) {
      success = await copyCallSignToClipboard(rawCallSign);
    }

    if (success) {
      callSignCopyButton.textContent = "Copied!";
      callSignCopyButton.disabled = false;
      callSignCopyButtonTimer = setTimeout(() => {
        resetCallSignCopyButton();
      }, 2400);
      announceCallSignCopyFeedback("Call sign copied. Keep it safe!", "success");
    } else {
      callSignCopyButton.disabled = false;
      callSignCopyButton.textContent = defaultCopyCallSignLabel;
      announceCallSignCopyFeedback("Copy failed — jot the digits down manually.", "error");
    }
  });

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
  updateCallSignDisplay(pendingCallSign);

  if (initialAccount?.catName) {
    nameInput.value = initialAccount.catName;
  }

  nameInput.addEventListener("input", () => {
    nameInput.setCustomValidity("");
    formFeedback.hidden = true;
    formFeedback.textContent = "";
    formFeedback.classList.remove("is-error", "is-success");
  });

  const defaultSubmitText = submitButton.textContent;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    formFeedback.hidden = true;
    formFeedback.textContent = "";
    formFeedback.classList.remove("is-error", "is-success");

    if (!walletAddress) {
      formFeedback.textContent = "Connect your Solana wallet to create this profile.";
      formFeedback.classList.add("is-error");
      formFeedback.hidden = false;
      return;
    }

    const trimmedName = nameInput.value.trim().replace(/\s+/g, " ");
    if (!trimmedName) {
      nameInput.setCustomValidity("Name your astrocat to continue.");
      nameInput.reportValidity();
      return;
    }

    if (remainingCreationPoints > 0) {
      statsError.textContent =
        remainingCreationPoints === 1
          ? "Allocate your remaining stat point to continue."
          : `Allocate your remaining ${remainingCreationPoints} stat points to continue.`;
      statsError.hidden = false;
      try {
        statsField.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (error) {
        statsField.scrollIntoView();
      }
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Linking…";

    try {
      const attributeSnapshot = createInitialAttributeState();
      for (const definition of attributeDefinitions) {
        const baseValue = attributeSnapshot[definition.key];
        const bonus = creationAllocation[definition.key] ?? 0;
        attributeSnapshot[definition.key] = baseValue + bonus;
      }

      const sanitized = sanitizeAccount({
        callSign: pendingCallSign,
        catName: trimmedName,
        starterId: selectedStarterId,
        attributes: attributeSnapshot,
        walletAddress,
        walletType: "solana"
      });

      if (!sanitized) {
        formFeedback.textContent = "Unable to prepare your profile. Try again.";
        formFeedback.classList.add("is-error");
        formFeedback.hidden = false;
        return;
      }

      pendingCallSign = sanitized.callSign;
      selectedStarterId = sanitized.starterId;
      const sanitizedStarterIndex = availableStarters.findIndex(
        (entry) => entry.id === sanitized.starterId
      );
      if (sanitizedStarterIndex >= 0) {
        setActiveStarter(sanitizedStarterIndex, { preserveAllocation: true });
      }
      statsError.hidden = true;
      updateAllocationUI();
      updateCallSignDisplay(pendingCallSign);
      nameInput.value = sanitized.catName;

      let completionResult = true;
      if (typeof onComplete === "function") {
        completionResult = onComplete(sanitized);
      }

      if (completionResult === false) {
        formFeedback.textContent = "We couldn't save your profile. Check storage settings and try again.";
        formFeedback.classList.add("is-error");
        formFeedback.hidden = false;
        return;
      }

      formFeedback.textContent = "Profile linked to your wallet.";
      formFeedback.classList.add("is-success");
      formFeedback.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = defaultSubmitText;
    }
  });

  return {
    root,
    focus() {
      try {
        nameInput.focus({ preventScroll: true });
      } catch (error) {
        nameInput.focus();
      }
    },
    close() {
      root.remove();
    }
  };
}

function createMiniGameLoadoutPanel(initialState, options = {}) {
  const { onLoadoutsChange, playerLevel = 1 } = options;
  const storageAvailable = Boolean(getLocalStorage());
  let currentState = sanitizeMiniGameLoadoutsState(initialState);
  let activeSlotId =
    currentState.activeSlot &&
    getMiniGameLoadoutBySlot(currentState.slots, currentState.activeSlot)
      ? currentState.activeSlot
      : currentState.slots[0]?.slot ?? null;
  let currentPlayerLevel = Math.max(1, Math.floor(playerLevel));
  const spacecraftOptionElements = new Map();

  const root = document.createElement("section");
  root.className = "loadout-panel";

  const idSuffix = Math.random().toString(36).slice(2);

  const header = document.createElement("div");
  header.className = "loadout-panel__header";
  const title = document.createElement("h2");
  title.className = "loadout-panel__title";
  title.textContent = "Mini Game Loadout";
  const description = document.createElement("p");
  description.className = "loadout-panel__description";
  description.textContent = storageAvailable
    ? "Choose your Starcade preset before launching the arcade cabinet."
    : "Storage is unavailable, so presets will reset when you leave this page.";
  header.append(title, description);
  root.append(header);

  const form = document.createElement("div");
  form.className = "loadout-panel__form";
  root.append(form);

  function createField(labelText, control) {
    const field = document.createElement("div");
    field.className = "loadout-panel__field";
    const label = document.createElement("label");
    label.className = "loadout-panel__label";
    label.textContent = labelText;
    label.setAttribute("for", control.id);
    field.append(label, control);
    return field;
  }

  function createPreviewItem(labelText, modifier) {
    const item = document.createElement("article");
    item.className = `loadout-preview__item loadout-preview__item--${modifier}`;

    const label = document.createElement("p");
    label.className = "loadout-preview__label";
    label.textContent = labelText;

    const media = document.createElement("div");
    media.className = "loadout-preview__media";

    const image = document.createElement("img");
    image.className = "loadout-preview__image";
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";
    media.append(image);

    const name = document.createElement("h3");
    name.className = "loadout-preview__name";

    const meta = document.createElement("p");
    meta.className = "loadout-preview__meta";
    meta.hidden = true;

    const summaryBlurb = document.createElement("p");
    summaryBlurb.className = "loadout-preview__summary";
    summaryBlurb.hidden = true;

    item.append(label, media, name, meta, summaryBlurb);

    return {
      root: item,
      image,
      name,
      meta,
      summary: summaryBlurb
    };
  }

  function isSpacecraftUnlocked(option) {
    if (!option) {
      return false;
    }
    const requirement = Math.max(1, Math.floor(option.requiredLevel ?? 1));
    return currentPlayerLevel >= requirement;
  }

  function getDefaultSpacecraftOption() {
    return (
      miniGameSpacecraftOptions.find((option) => isSpacecraftUnlocked(option)) ??
      miniGameSpacecraftOptions[0] ??
      null
    );
  }

  function resolveSpacecraftSelection(candidateId) {
    const candidate = miniGameSpacecraftOptions.find((option) => option.id === candidateId) ?? null;
    if (candidate && isSpacecraftUnlocked(candidate)) {
      return candidate;
    }
    return getDefaultSpacecraftOption();
  }

  function updateSpacecraftOptionStates() {
    for (const option of miniGameSpacecraftOptions) {
      const element = spacecraftOptionElements.get(option.id);
      if (!element) {
        continue;
      }
      const baseLabel = element.dataset.baseLabel ?? option.name;
      const requirement = Math.max(1, Math.floor(option.requiredLevel ?? 1));
      const unlocked = isSpacecraftUnlocked(option);
      element.disabled = !unlocked;
      element.textContent = unlocked
        ? baseLabel
        : `${baseLabel} — Unlocks at Level ${requirement}`;

      const tooltipSegments = [];
      if (option.summary) {
        tooltipSegments.push(option.summary);
      }
      if (Array.isArray(option.positives) && option.positives.length > 0) {
        tooltipSegments.push(`Positives: ${option.positives.join("; ")}`);
      }
      if (Array.isArray(option.negatives) && option.negatives.length > 0) {
        tooltipSegments.push(`Negatives: ${option.negatives.join("; ")}`);
      }
      if (!unlocked) {
        tooltipSegments.push(`Requires Level ${requirement}.`);
      }
      element.title = tooltipSegments.join("\n");
    }
  }

  function enforceSpacecraftAvailability() {
    const fallback = getDefaultSpacecraftOption();
    if (!fallback) {
      return;
    }

    let mutated = false;
    const adjustedSlots = currentState.slots.map((entry) => {
      const spacecraft = miniGameSpacecraftOptions.find((option) => option.id === entry.characterId);
      if (!spacecraft || isSpacecraftUnlocked(spacecraft)) {
        return entry;
      }
      mutated = true;
      return { ...entry, characterId: fallback.id };
    });

    if (mutated) {
      currentState = sanitizeMiniGameLoadoutsState({
        slots: adjustedSlots,
        activeSlot: currentState.activeSlot
      });
    }
  }

  const slotSelect = document.createElement("select");
  slotSelect.className = "loadout-panel__select";
  slotSelect.id = `miniGameLoadoutSlot-${idSuffix}`;
  const slotField = createField("Preset slot", slotSelect);
  form.append(slotField);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = `miniGameLoadoutName-${idSuffix}`;
  nameInput.className = "loadout-panel__input";
  nameInput.maxLength = miniGameMaxLoadoutNameLength;
  nameInput.placeholder = "Custom preset name";
  nameInput.autocomplete = "off";
  const nameField = createField("Preset name", nameInput);
  form.append(nameField);

  const spacecraftSelect = document.createElement("select");
  spacecraftSelect.id = `miniGameLoadoutSpacecraft-${idSuffix}`;
  spacecraftSelect.className = "loadout-panel__select";
  for (const option of miniGameSpacecraftOptions) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.name;
    element.dataset.baseLabel = option.name;
    spacecraftOptionElements.set(option.id, element);
    spacecraftSelect.append(element);
  }
  updateSpacecraftOptionStates();
  const spacecraftField = createField("Spacecraft", spacecraftSelect);
  form.append(spacecraftField);

  const weaponSelect = document.createElement("select");
  weaponSelect.id = `miniGameLoadoutWeapon-${idSuffix}`;
  weaponSelect.className = "loadout-panel__select";
  for (const option of miniGameWeaponOptions) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.name;
    weaponSelect.append(element);
  }
  const weaponField = createField("Weapon", weaponSelect);
  form.append(weaponField);

  const suitSelect = document.createElement("select");
  suitSelect.id = `miniGameLoadoutSuit-${idSuffix}`;
  suitSelect.className = "loadout-panel__select";
  for (const option of miniGameSuitOptions) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.name;
    suitSelect.append(element);
  }
  const suitField = createField("Suit", suitSelect);
  form.append(suitField);

  const streamSelect = document.createElement("select");
  streamSelect.id = `miniGameLoadoutStream-${idSuffix}`;
  streamSelect.className = "loadout-panel__select";
  for (const option of miniGameStreamOptions) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.name;
    streamSelect.append(element);
  }
  const streamField = createField("Stream", streamSelect);
  form.append(streamField);

  const previewContainer = document.createElement("div");
  previewContainer.className = "loadout-preview";
  const spacecraftPreview = createPreviewItem("Spacecraft visual", "spacecraft");
  const weaponPreview = createPreviewItem("Weapon profile", "weapon");
  previewContainer.append(spacecraftPreview.root, weaponPreview.root);
  form.append(previewContainer);

  const summary = document.createElement("div");
  summary.className = "loadout-summary";
  const summaryHeader = document.createElement("div");
  summaryHeader.className = "loadout-summary__header";
  const summaryTitle = document.createElement("span");
  summaryTitle.className = "loadout-summary__title";
  summaryTitle.textContent = "Preset overview";
  const activeBadge = document.createElement("span");
  activeBadge.className = "loadout-summary__active-badge";
  activeBadge.textContent = "Equipped preset";
  summaryHeader.append(summaryTitle, activeBadge);
  summary.append(summaryHeader);

  const summaryList = document.createElement("dl");
  summaryList.className = "loadout-summary__list";
  summary.append(summaryList);

  function createSummaryRow(labelText) {
    const term = document.createElement("dt");
    term.className = "loadout-summary__label";
    term.textContent = labelText;
    const value = document.createElement("dd");
    value.className = "loadout-summary__value";
    value.textContent = "—";
    summaryList.append(term, value);
    return value;
  }

  const summaryValues = {
    spacecraft: createSummaryRow("Spacecraft"),
    weapon: createSummaryRow("Weapon"),
    suit: createSummaryRow("Suit"),
    stream: createSummaryRow("Stream")
  };

  root.append(summary);

  const equipButton = document.createElement("button");
  equipButton.type = "button";
  equipButton.className = "loadout-panel__equip";
  equipButton.textContent = "Equip this preset";
  root.append(equipButton);

  const statusMessage = document.createElement("p");
  statusMessage.className = "loadout-panel__status";
  root.append(statusMessage);

  const baseStatusMessage = storageAvailable
    ? "Changes save automatically for the Starcade console."
    : "Changes are kept for this session only.";
  let statusResetId = 0;

  function cloneState(state) {
    return {
      slots: Array.isArray(state?.slots)
        ? state.slots.map((entry) => ({ ...entry }))
        : [],
      activeSlot: state?.activeSlot ?? null
    };
  }

  function emitChange(persisted) {
    if (typeof onLoadoutsChange !== "function") {
      return;
    }
    onLoadoutsChange(cloneState(currentState), { persisted });
  }

  function setStatus(message, type = "info") {
    const text = message ?? "";
    statusMessage.textContent = text || baseStatusMessage;
    statusMessage.classList.remove("is-success", "is-error");
    if (type === "success") {
      statusMessage.classList.add("is-success");
    } else if (type === "error") {
      statusMessage.classList.add("is-error");
    }
    if (statusResetId) {
      window.clearTimeout(statusResetId);
      statusResetId = 0;
    }
    if (type === "success" && text) {
      statusResetId = window.setTimeout(() => {
        statusMessage.textContent = baseStatusMessage;
        statusMessage.classList.remove("is-success", "is-error");
        statusResetId = 0;
      }, 3200);
    }
  }

  function applyPreview(display, entry, options = {}) {
    if (!display) {
      return;
    }

    const {
      root: previewRoot,
      image,
      name,
      meta,
      summary: summaryBlurb
    } = display;

    const {
      fallbackName = "Select a preset",
      altPrefix = "",
      metaKey = "",
      summaryKey = "summary"
    } = options;

    if (entry) {
      name.textContent = entry.name ?? fallbackName;
      name.hidden = false;

      const metaValue = metaKey ? entry[metaKey] ?? "" : "";
      meta.textContent = metaValue;
      meta.hidden = !metaValue;

      const summarySegments = [];
      if (summaryKey) {
        const baseSummary = entry[summaryKey];
        if (typeof baseSummary === "string" && baseSummary.trim()) {
          summarySegments.push(baseSummary.trim());
        }
      }
      const positiveTraits = Array.isArray(entry.positives) ? entry.positives.filter((item) => typeof item === "string" && item.trim()) : [];
      if (positiveTraits.length > 0) {
        summarySegments.push(`Positives: ${positiveTraits.join("; ")}.`);
      }
      const negativeTraits = Array.isArray(entry.negatives) ? entry.negatives.filter((item) => typeof item === "string" && item.trim()) : [];
      if (negativeTraits.length > 0) {
        summarySegments.push(`Negatives: ${negativeTraits.join("; ")}.`);
      }
      const combinedSummary = summarySegments.join(" ").trim();
      summaryBlurb.textContent = combinedSummary;
      summaryBlurb.hidden = combinedSummary.length === 0;

      const hasImage = typeof entry.image === "string" && entry.image;
      if (hasImage) {
        image.src = entry.image;
        const altName = entry.name ?? fallbackName;
        image.alt = altPrefix ? `${altPrefix} ${altName}`.trim() : altName ?? "";
        image.hidden = false;
      } else {
        image.removeAttribute("src");
        image.alt = "";
        image.hidden = true;
      }

      previewRoot.classList.toggle("is-empty", !hasImage);
      return;
    }

    name.textContent = fallbackName;
    name.hidden = false;
    meta.textContent = "";
    meta.hidden = true;
    summaryBlurb.textContent = "";
    summaryBlurb.hidden = true;
    image.removeAttribute("src");
    image.alt = "";
    image.hidden = true;
    previewRoot.classList.add("is-empty");
  }

  function updatePreviewDisplays(spacecraft, weapon) {
    applyPreview(spacecraftPreview, spacecraft, {
      fallbackName: "Select a spacecraft",
      altPrefix: "Spacecraft render for",
      metaKey: "role"
    });
    applyPreview(weaponPreview, weapon, {
      fallbackName: "Select a weapon",
      altPrefix: "Weapon hologram for",
      metaKey: "classification"
    });
  }

  function rebuildSlotOptions() {
    slotSelect.innerHTML = "";
    for (const entry of currentState.slots) {
      const option = document.createElement("option");
      option.value = entry.slot;
      option.textContent = entry.name;
      slotSelect.append(option);
    }
    if (activeSlotId && currentState.slots.some((entry) => entry.slot === activeSlotId)) {
      slotSelect.value = activeSlotId;
    } else if (slotSelect.options.length > 0) {
      activeSlotId = slotSelect.options[0].value;
      slotSelect.value = activeSlotId;
    }
  }

  function setSelectValue(select, value, fallback) {
    if (!select) {
      return;
    }
    const candidates = Array.from(select.options, (option) => option.value);
    if (value && candidates.includes(value)) {
      select.value = value;
      return;
    }
    if (fallback && candidates.includes(fallback)) {
      select.value = fallback;
      return;
    }
    if (candidates.length > 0) {
      select.value = candidates[0];
    }
  }

  function getCurrentLoadout() {
    return getMiniGameLoadoutBySlot(currentState.slots, activeSlotId);
  }

  function updateActiveIndicators() {
    const activeLoadout = getCurrentLoadout();
    const isActive = Boolean(activeLoadout && currentState.activeSlot === activeLoadout.slot);
    activeBadge.hidden = !isActive;
    equipButton.disabled = !activeLoadout || isActive;
    if (isActive) {
      equipButton.textContent = "Equipped";
    } else if (storageAvailable) {
      equipButton.textContent = "Equip this preset";
    } else {
      equipButton.textContent = "Equip for this session";
    }
  }

  function updateSummary(loadout) {
    const spacecraft = resolveSpacecraftSelection(loadout?.characterId);
    const weapon =
      miniGameWeaponOptions.find((option) => option.id === loadout?.weaponId) ??
      miniGameWeaponOptions[0] ??
      null;
    const suit =
      miniGameSuitOptions.find((option) => option.id === loadout?.skinId) ??
      miniGameSuitOptions[0] ??
      null;
    const stream =
      miniGameStreamOptions.find((option) => option.id === loadout?.trailId) ??
      miniGameStreamOptions[0] ??
      null;

    summaryValues.spacecraft.textContent = spacecraft
      ? spacecraft.role
        ? `${spacecraft.name} — ${spacecraft.role}`
        : spacecraft.name
      : "—";
    const spacecraftTooltip = [];
    if (spacecraft?.summary) {
      spacecraftTooltip.push(spacecraft.summary);
    }
    if (Array.isArray(spacecraft?.positives) && spacecraft.positives.length > 0) {
      spacecraftTooltip.push(`Positives: ${spacecraft.positives.join("; ")}`);
    }
    if (Array.isArray(spacecraft?.negatives) && spacecraft.negatives.length > 0) {
      spacecraftTooltip.push(`Negatives: ${spacecraft.negatives.join("; ")}`);
    }
    summaryValues.spacecraft.title = spacecraftTooltip.join("\n");

    summaryValues.weapon.textContent = weapon ? weapon.name : "—";
    summaryValues.weapon.title = weapon?.summary ?? "";

    summaryValues.suit.textContent = suit ? suit.name : "—";
    summaryValues.stream.textContent = stream ? stream.name : "—";

    updatePreviewDisplays(spacecraft, weapon);
  }

  function applyFormValues(loadout) {
    enforceSpacecraftAvailability();
    const resolved = loadout ?? getCurrentLoadout() ?? currentState.slots[0] ?? null;
    const defaultSpacecraft = getDefaultSpacecraftOption();
    const spacecraft = resolveSpacecraftSelection(resolved?.characterId);
    const spacecraftId = spacecraft?.id ?? defaultSpacecraft?.id ?? "";
    const normalizedLoadout = resolved
      ? { ...resolved, characterId: spacecraftId || resolved.characterId }
      : resolved;
    if (resolved) {
      nameInput.value = resolved.name;
      setSelectValue(spacecraftSelect, spacecraftId, defaultSpacecraft?.id);
      setSelectValue(weaponSelect, resolved.weaponId, miniGameWeaponOptions[0]?.id);
      setSelectValue(suitSelect, resolved.skinId, miniGameSuitOptions[0]?.id);
      setSelectValue(streamSelect, resolved.trailId, miniGameStreamOptions[0]?.id);
    }
    if (activeSlotId) {
      slotSelect.value = activeSlotId;
    }
    updateSummary(normalizedLoadout);
    updateActiveIndicators();
  }

  function persistState({ message, type } = {}) {
    let persisted = false;
    if (storageAvailable) {
      persisted = saveMiniGameLoadoutsToStorage(currentState);
      if (persisted) {
        const current = getCurrentLoadout();
        const fallbackMessage = current ? `Saved ${current.name}.` : "Preset saved.";
        setStatus(message ?? fallbackMessage, type ?? "success");
      } else {
        setStatus("Unable to save loadout. Try again.", "error");
      }
    } else {
      const current = getCurrentLoadout();
      const fallbackMessage = current
        ? `${current.name} is ready for this session.`
        : "Preset updated for this session.";
      const fallbackType = type ?? "success";
      setStatus(message ?? fallbackMessage, fallbackType);
    }
    emitChange(persisted);
    return persisted;
  }

  function updateSlot(patch) {
    if (!activeSlotId) {
      return;
    }
    const index = currentState.slots.findIndex((entry) => entry.slot === activeSlotId);
    if (index === -1) {
      return;
    }
    const previous = currentState.slots[index];
    const slotMeta = resolveMiniGameLoadoutSlotMeta(previous.slot, index);
    const normalizedPatch = patch ? { ...patch } : {};
    if (typeof normalizedPatch.characterId === "string") {
      const resolvedSpacecraft = resolveSpacecraftSelection(normalizedPatch.characterId);
      normalizedPatch.characterId = resolvedSpacecraft?.id ?? normalizedPatch.characterId;
    }
    const candidate = { ...previous, ...normalizedPatch };
    const sanitized = sanitizeMiniGameLoadout(candidate, slotMeta, index);
    if (isSameMiniGameLoadout(sanitized, previous)) {
      applyFormValues(previous);
      return;
    }

    currentState = sanitizeMiniGameLoadoutsState({
      slots: currentState.slots.map((entry, idx) => (idx === index ? sanitized : entry)),
      activeSlot: currentState.activeSlot
    });
    activeSlotId = sanitized.slot;
    rebuildSlotOptions();
    applyFormValues(sanitized);
    persistState();
  }

  slotSelect.addEventListener("change", () => {
    activeSlotId = slotSelect.value;
    const loadout = getMiniGameLoadoutBySlot(currentState.slots, activeSlotId);
    if (loadout) {
      activeSlotId = loadout.slot;
    }
    applyFormValues(loadout);
  });

  let nameUpdateTimer = 0;
  nameInput.addEventListener("input", () => {
    if (nameUpdateTimer) {
      window.clearTimeout(nameUpdateTimer);
    }
    nameUpdateTimer = window.setTimeout(() => {
      nameUpdateTimer = 0;
      updateSlot({ name: nameInput.value });
    }, 260);
  });
  nameInput.addEventListener("blur", () => {
    if (nameUpdateTimer) {
      window.clearTimeout(nameUpdateTimer);
      nameUpdateTimer = 0;
    }
    updateSlot({ name: nameInput.value });
  });

  spacecraftSelect.addEventListener("change", () => {
    updateSlot({ characterId: spacecraftSelect.value });
  });
  weaponSelect.addEventListener("change", () => {
    updateSlot({ weaponId: weaponSelect.value });
  });
  suitSelect.addEventListener("change", () => {
    updateSlot({ skinId: suitSelect.value });
  });
  streamSelect.addEventListener("change", () => {
    updateSlot({ trailId: streamSelect.value });
  });

  equipButton.addEventListener("click", () => {
    const loadout = getCurrentLoadout();
    if (!loadout) {
      return;
    }
    currentState = sanitizeMiniGameLoadoutsState({
      slots: currentState.slots,
      activeSlot: loadout.slot
    });
    activeSlotId = loadout.slot;
    updateActiveIndicators();
    const equipMessage = storageAvailable
      ? `Equipped ${loadout.name}.`
      : `Equipped ${loadout.name} for this session.`;
    persistState({ message: equipMessage, type: "success" });
  });

  rebuildSlotOptions();
  enforceSpacecraftAvailability();
  applyFormValues(getCurrentLoadout());
  setStatus(baseStatusMessage);

  return {
    root,
    refresh(nextState, context = {}) {
      currentState = sanitizeMiniGameLoadoutsState(nextState);
      if (typeof context.playerLevel === "number" && Number.isFinite(context.playerLevel)) {
        currentPlayerLevel = Math.max(1, Math.floor(context.playerLevel));
      }
      updateSpacecraftOptionStates();
      enforceSpacecraftAvailability();
      activeSlotId =
        currentState.activeSlot &&
        getMiniGameLoadoutBySlot(currentState.slots, currentState.activeSlot)
          ? currentState.activeSlot
          : currentState.slots[0]?.slot ?? activeSlotId;
      rebuildSlotOptions();
      applyFormValues(getCurrentLoadout());
      setStatus(baseStatusMessage);
    },
    setPlayerLevel(level) {
      if (typeof level !== "number" || !Number.isFinite(level)) {
        return;
      }
      currentPlayerLevel = Math.max(1, Math.floor(level));
      updateSpacecraftOptionStates();
      enforceSpacecraftAvailability();
      applyFormValues(getCurrentLoadout());
    },
    getState() {
      return cloneState(currentState);
    }
  };
}

function createInterface(stats, options = {}) {
  const {
    onRequestLogin,
    onRequestLogout,
    onRequestWalletLogin,
    onRequestWalletDisconnect,
    portalLevelRequirement = 1
  } = options;
  const root = document.createElement("div");
  root.className = "game-root";

  const interfaceRoot = document.createElement("div");
  interfaceRoot.className = "lobby-shell";

  let accountLoggedIn = Boolean(stats?.callSign);
  let walletUiState = {
    available: false,
    connected: false,
    address: null,
    callSign: isValidCallSign(stats?.callSign) ? stats.callSign : null
  };

  const walletControls = createWalletToolbarSection({
    onConnect: onRequestWalletLogin,
    onDisconnect: onRequestWalletDisconnect
  });

  const toolbar = createToolbar(walletControls);
  const toolbarContent = document.createElement("div");
  toolbarContent.className = "lobby-shell__content";
  toolbarContent.append(root);

  interfaceRoot.append(toolbar, toolbarContent);

  function createWalletToolbarSection(handlers = {}) {
    const { onConnect, onDisconnect } = handlers;

    const container = document.createElement("div");
    container.className = "site-toolbar__wallet";
    container.dataset.state = "missing";

    const label = document.createElement("span");
    label.className = "wallet-status__label";
    label.textContent = "Solana Wallet";

    const infoRow = document.createElement("div");
    infoRow.className = "wallet-status__row";

    const callSignBadge = document.createElement("span");
    callSignBadge.className = "wallet-status__call-sign";
    callSignBadge.hidden = true;

    const addressText = document.createElement("span");
    addressText.className = "wallet-status__address";
    addressText.textContent = "Install Phantom to connect.";

    infoRow.append(callSignBadge, addressText);

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "wallet-status__action";
    actionButton.textContent = "Get Phantom";

    container.append(label, infoRow, actionButton);

    function openInstallPage() {
      const url = getPhantomInstallUrl();
      if (typeof window !== "undefined" && url) {
        try {
          window.open(url, "_blank", "noreferrer");
        } catch (error) {
          window.location.href = url;
        }
      }
    }

    function update(nextState = {}) {
      const state = {
        available: false,
        connected: false,
        callSign: null,
        address: null,
        ...nextState
      };

      container.dataset.state = state.available
        ? state.connected
          ? "connected"
          : "ready"
        : "missing";

      if (state.connected && state.callSign) {
        callSignBadge.hidden = false;
        callSignBadge.textContent = `@${state.callSign}`;
      } else {
        callSignBadge.hidden = true;
        callSignBadge.textContent = "";
      }

      if (!state.available) {
        addressText.textContent = "Install Phantom to connect.";
        actionButton.textContent = "Get Phantom";
        actionButton.disabled = false;
        actionButton.onclick = openInstallPage;
      } else if (!state.connected) {
        addressText.textContent = "Ready to connect";
        actionButton.textContent = "Connect Wallet";
        actionButton.disabled = typeof onConnect !== "function";
        actionButton.onclick = () => {
          if (typeof onConnect === "function") {
            onConnect();
          }
        };
      } else {
        addressText.textContent = state.address
          ? formatWalletAddress(state.address)
          : "Connected";
        actionButton.textContent = "Disconnect";
        actionButton.disabled = typeof onDisconnect !== "function";
        actionButton.onclick = () => {
          if (typeof onDisconnect === "function") {
            onDisconnect();
          }
        };
      }
    }

    update();

    return {
      root: container,
      setState: update
    };
  }

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "canvas-wrapper";

  const canvasSurface = document.createElement("div");
  canvasSurface.className = "canvas-surface";

  const canvasBackground = document.createElement("div");
  canvasBackground.className = "canvas-background";
  canvasBackground.dataset.state = "disabled";
  canvasBackground.hidden = true;

  const backgroundVideo = document.createElement("video");
  backgroundVideo.className = "canvas-background__video";
  backgroundVideo.setAttribute("aria-hidden", "true");
  backgroundVideo.tabIndex = -1;
  backgroundVideo.poster = backgroundImageUrl;
  try {
    backgroundVideo.playsInline = true;
    backgroundVideo.muted = true;
    backgroundVideo.loop = true;
    backgroundVideo.preload = "auto";
    backgroundVideo.defaultMuted = true;
    if (typeof backgroundVideo.disablePictureInPicture === "boolean") {
      backgroundVideo.disablePictureInPicture = true;
    }
  } catch (error) {
    // Older browsers may not support these properties; ignore failures silently.
  }
  if (typeof backgroundVideo.setAttribute === "function") {
    backgroundVideo.setAttribute("playsinline", "");
    backgroundVideo.setAttribute("muted", "");
    backgroundVideo.setAttribute("loop", "");
    backgroundVideo.setAttribute("preload", "auto");
  }

  canvasBackground.append(backgroundVideo);
  canvasSurface.append(canvasBackground);
  canvasWrapper.append(canvasSurface);

  const chatBoard = createChatBoardSection();
  canvasWrapper.append(chatBoard.root);

  const panel = document.createElement("aside");
  panel.className = "stats-panel";
  panel.id = "about";

  const title = document.createElement("h1");
  title.textContent = "Astrocat Lobby";
  panel.append(title);

  const hudHint = document.createElement("p");
  hudHint.className = "hud-panel__hint";
  hudHint.textContent =
    "Your profile is displayed below. Access other lobby systems via the console buttons.";
  panel.append(hudHint);

  const hudButtons = document.createElement("div");
  hudButtons.className = "hud-panel__actions";
  panel.append(hudButtons);

  const layoutCustomizeButton = document.createElement("button");
  layoutCustomizeButton.type = "button";
  layoutCustomizeButton.className = "hud-panel__button";
  layoutCustomizeButton.textContent = "Customize Layout";
  layoutCustomizeButton.setAttribute("aria-pressed", "false");
  hudButtons.append(layoutCustomizeButton);

  const layoutResetButton = document.createElement("button");
  layoutResetButton.type = "button";
  layoutResetButton.className = "hud-panel__button";
  layoutResetButton.textContent = "Reset Layout";
  layoutResetButton.disabled = true;
  layoutResetButton.setAttribute("aria-disabled", "true");
  hudButtons.append(layoutResetButton);

  let hudPopupSequence = 0;

  function registerHudPopup({
    id,
    label,
    title: popupTitle,
    description: popupDescription,
    nodes,
    sections
  }) {
    const overlay = document.createElement("div");
    const overlayId = id || `hud-popup-${++hudPopupSequence}`;
    overlay.id = overlayId;
    overlay.className = "hud-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");

    overlay.hidden = true;

    const modal = document.createElement("div");
    modal.className = "hud-modal";

    const header = document.createElement("div");
    header.className = "hud-modal__header";

    const heading = document.createElement("h2");
    heading.className = "hud-modal__title";
    heading.textContent = popupTitle;
    const headingId = `${overlayId}-title`;
    heading.id = headingId;
    overlay.setAttribute("aria-labelledby", headingId);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "hud-modal__close";
    closeButton.textContent = "Close";

    header.append(heading, closeButton);

    const content = document.createElement("div");
    content.className = "hud-modal__content";

    if (popupDescription) {
      const description = document.createElement("p");
      description.className = "hud-modal__description";
      description.textContent = popupDescription;
      content.append(description);
    }

    const layout = document.createElement("div");
    layout.className = "hud-modal__layout";
    content.append(layout);

    const sectionsContainer = document.createElement("div");
    sectionsContainer.className = "hud-modal__sections";

    function isNode(value) {
      if (typeof Node === "function") {
        return value instanceof Node;
      }
      return Boolean(value && typeof value === "object" && typeof value.nodeType === "number");
    }

    function normaliseNodes(input) {
      if (!input) {
        return [];
      }
      if (Array.isArray(input)) {
        return input.filter((candidate) => isNode(candidate));
      }
      return isNode(input) ? [input] : [];
    }

    const resolvedSections = [];
    const providedSections = Array.isArray(sections) ? sections : [];
    for (const entry of providedSections) {
      if (!entry) {
        continue;
      }
      const sectionNodes = normaliseNodes(
        entry.nodes ?? entry.node ?? entry.content ?? entry.children ?? entry.element
      );
      if (sectionNodes.length === 0) {
        continue;
      }
      resolvedSections.push({
        id: entry.id,
        heading: entry.heading ?? entry.title ?? entry.label ?? null,
        description: entry.description ?? entry.summary ?? null,
        navLabel: entry.navLabel ?? entry.heading ?? entry.title ?? null,
        nodes: sectionNodes
      });
    }

    if (resolvedSections.length === 0) {
      const fallbackNodes = normaliseNodes(nodes);
      let fallbackIndex = 0;
      for (const node of fallbackNodes) {
        fallbackIndex += 1;
        const nodeTitle = node?.dataset?.hudTitle ?? null;
        resolvedSections.push({
          id: node?.id || `${overlayId}-section-${fallbackIndex}`,
          heading: nodeTitle,
          description: node?.dataset?.hudDescription ?? null,
          navLabel: nodeTitle,
          nodes: [node]
        });
      }
    }

    let navList = null;
    let navEntries = [];

    if (resolvedSections.length > 1) {
      const nav = document.createElement("nav");
      nav.className = "hud-modal__nav";
      nav.setAttribute("aria-label", `${popupTitle} sections`);

      const navTitle = document.createElement("p");
      navTitle.className = "hud-modal__nav-title";
      navTitle.textContent = "Quick sections";
      nav.append(navTitle);

      navList = document.createElement("ul");
      navList.className = "hud-modal__nav-list";
      nav.append(navList);

      layout.append(nav);
    }

    layout.append(sectionsContainer);

    navEntries = [];
    let sectionIndex = 0;

    for (const sectionDefinition of resolvedSections) {
      sectionIndex += 1;
      const section = document.createElement("section");
      section.className = "hud-modal__section";
      const sectionId = sectionDefinition.id || `${overlayId}-section-${sectionIndex}`;
      section.id = sectionId;

      if (sectionDefinition.heading || sectionDefinition.description) {
        const sectionHeader = document.createElement("div");
        sectionHeader.className = "hud-modal__section-header";
        if (sectionDefinition.heading) {
          const sectionTitle = document.createElement("h3");
          sectionTitle.className = "hud-modal__section-title";
          sectionTitle.textContent = sectionDefinition.heading;
          sectionHeader.append(sectionTitle);
        }
        if (sectionDefinition.description) {
          const sectionSummary = document.createElement("p");
          sectionSummary.className = "hud-modal__section-description";
          sectionSummary.textContent = sectionDefinition.description;
          sectionHeader.append(sectionSummary);
        }
        section.append(sectionHeader);
      }

      const sectionContent = document.createElement("div");
      sectionContent.className = "hud-modal__section-content";
      for (const node of sectionDefinition.nodes) {
        sectionContent.append(node);
      }
      section.append(sectionContent);
      sectionsContainer.append(section);

      if (navList) {
        const navItem = document.createElement("li");
        navItem.className = "hud-modal__nav-item";
        const navButton = document.createElement("button");
        navButton.type = "button";
        navButton.className = "hud-modal__nav-button";
        navButton.textContent =
          sectionDefinition.navLabel || sectionDefinition.heading || `Section ${sectionIndex}`;
        navButton.setAttribute("aria-controls", sectionId);
        navButton.addEventListener("click", () => {
          try {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (error) {
            section.scrollIntoView();
          }
          setActiveNav(sectionId);
        });
        navItem.append(navButton);
        navList.append(navItem);
        navEntries.push({ id: sectionId, button: navButton, section });
      }
    }

    function setActiveNav(activeId) {
      for (const entry of navEntries) {
        const isActive = entry.id === activeId;
        entry.button.classList.toggle("is-active", isActive);
        entry.button.setAttribute("aria-current", isActive ? "true" : "false");
      }
    }

    let navObserver = null;
    if (navEntries.length > 0 && typeof IntersectionObserver === "function") {
      navObserver = new IntersectionObserver(
        (entries) => {
          let best = null;
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
          if (best) {
            setActiveNav(best.target.id);
          }
        },
        { root: sectionsContainer, threshold: [0.25, 0.5, 0.75] }
      );
      for (const entry of navEntries) {
        navObserver.observe(entry.section);
      }
    }

    modal.append(header, content);
    overlay.append(modal);

    const mountTarget =
      typeof document !== "undefined" && document.body
        ? document.body
        : typeof document !== "undefined"
          ? document.documentElement
          : null;
    if (mountTarget) {
      mountTarget.append(overlay);
    } else {
      panel.append(overlay);
    }

    let previousFocus = null;
    let previousBodyOverflow = "";
    let previousRootOverflow = "";

    const handleBackdropClick = (event) => {
      if (event.target === overlay) {
        close();
      }
    };

    const handleEscape = (event) => {
      if (event.code === "Escape") {
        event.preventDefault();
        close();
      }
    };

    function open() {
      if (!overlay.hidden) {
        return;
      }

      previousFocus =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (typeof document !== "undefined") {
        const root = document.documentElement;
        if (root) {
          previousRootOverflow = root.style.overflow;
          root.style.overflow = "hidden";
        }
        if (document.body) {
          previousBodyOverflow = document.body.style.overflow;
          document.body.style.overflow = "hidden";
        }
      }

      sectionsContainer.scrollTop = 0;
      if (navEntries.length > 0) {
        const first = navEntries[0];
        setActiveNav(first.id);
      }

      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      overlay.addEventListener("click", handleBackdropClick);
      window.addEventListener("keydown", handleEscape);

      try {
        closeButton.focus({ preventScroll: true });
      } catch (error) {
        closeButton.focus();
      }
    }

    function close() {
      if (overlay.hidden) {
        return;
      }

      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.removeEventListener("click", handleBackdropClick);
      window.removeEventListener("keydown", handleEscape);

      if (typeof document !== "undefined") {
        const root = document.documentElement;
        if (root) {
          root.style.overflow = previousRootOverflow;
        }
        if (document.body) {
          document.body.style.overflow = previousBodyOverflow;
        }
      }

      if (navObserver) {
        navObserver.disconnect();
        for (const { section } of navEntries) {
          navObserver.observe(section);
        }
      }

      if (previousFocus) {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch (error) {
          previousFocus.focus();
        }
      }
    }

    closeButton.addEventListener("click", () => {
      close();
    });

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "hud-panel__button";
    trigger.textContent = label;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", overlayId);
    trigger.addEventListener("click", () => {
      open();
    });

    hudButtons.append(trigger);

    return { overlay, open, close, trigger };
  }

  const subtitle = document.createElement("p");
  subtitle.className = "player-subtitle";

  const accountCard = document.createElement("section");
  accountCard.className = "account-card account-card--empty";

  const accountHeader = document.createElement("div");
  accountHeader.className = "account-card__header";

  const accountHeading = document.createElement("span");
  accountHeading.className = "account-card__title";
  accountHeading.textContent = "Your Astrocat Profile";

  const accountHandle = document.createElement("div");
  accountHandle.className = "account-card__handle is-placeholder";
  const accountHandleLabel = document.createElement("span");
  accountHandleLabel.className = "account-card__handle-label";
  accountHandleLabel.textContent = "Call sign";
  const accountHandleValue = document.createElement("span");
  accountHandleValue.className = "account-card__handle-value";
  accountHandleValue.textContent = "-----";
  accountHandle.append(accountHandleLabel, accountHandleValue);

  accountHeader.append(accountHeading, accountHandle);
  accountCard.append(accountHeader);

  const accountProfiles = document.createElement("div");
  accountProfiles.className = "account-card__profiles";
  accountProfiles.hidden = true;

  const accountProfilesLabel = document.createElement("span");
  accountProfilesLabel.className = "account-card__profiles-label";
  accountProfilesLabel.textContent = "Saved profiles";

  const accountProfilesSelect = document.createElement("select");
  accountProfilesSelect.className = "account-card__profiles-select";
  accountProfilesSelect.setAttribute("aria-label", "Select a saved profile");

  let accountProfilesSelection = "";
  accountProfilesSelect.addEventListener("change", () => {
    const selected = accountProfilesSelect.value;
    if (!selected || selected === accountProfilesSelection) {
      accountProfilesSelection = selected;
      return;
    }
    accountProfilesSelection = selected;
    if (typeof onSelectAccount === "function") {
      onSelectAccount(selected);
    }
  });

  accountProfiles.append(accountProfilesLabel, accountProfilesSelect);
  accountCard.append(accountProfiles);

  const accountStarter = document.createElement("div");
  accountStarter.className = "account-card__starter";
  const accountStarterImage = document.createElement("img");
  accountStarterImage.className = "account-card__starter-image";
  accountStarterImage.alt = "Starter preview";
  const accountStarterInfo = document.createElement("div");
  accountStarterInfo.className = "account-card__starter-info";
  const accountCatName = document.createElement("p");
  accountCatName.className = "account-card__cat-name is-placeholder";
  accountCatName.textContent = "Name your Astrocat to begin your mission.";
  const accountStarterName = document.createElement("span");
  accountStarterName.className = "account-card__starter-name";
  const accountStarterTagline = document.createElement("span");
  accountStarterTagline.className = "account-card__starter-tagline";
  accountStarterInfo.append(accountCatName, accountStarterName, accountStarterTagline);
  accountStarter.append(accountStarterImage, accountStarterInfo);
  accountCard.append(accountStarter);

  const accountActions = document.createElement("div");
  accountActions.className = "account-card__actions";
  const loginButton = document.createElement("button");
  loginButton.type = "button";
  loginButton.className = "account-card__action";
  loginButton.textContent = "Log in";
  loginButton.addEventListener("click", () => {
    if (walletUiState.available && typeof onRequestWalletLogin === "function") {
      onRequestWalletLogin();
      return;
    }
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
    if (walletUiState.connected && typeof onRequestWalletDisconnect === "function") {
      onRequestWalletDisconnect();
      return;
    }
    if (typeof onRequestLogout === "function") {
      onRequestLogout();
    }
  });
  accountActions.append(loginButton, logoutButton);
  accountCard.append(accountActions);

  const statsContainer = document.createElement("div");
  statsContainer.className = "stats-container";
  statsContainer.classList.add("stats-modal__overview");

  const statsSummary = document.createElement("div");
  statsSummary.className = "stats-summary";
  const statsSummaryRows = new Map();
  const statsSummaryDefinitions = [
    { key: "level", label: "Level", valueClass: "stats-summary__value--accent" },
    { key: "rank", label: "Rank" },
    { key: "statPoints", label: "Unspent Points" },
    { key: "expProgress", label: "EXP Progress", fullWidth: true }
  ];
  for (const definition of statsSummaryDefinitions) {
    const row = document.createElement("div");
    row.className = "stats-summary__row";
    if (definition.fullWidth) {
      row.classList.add("stats-summary__row--full");
    }
    const label = document.createElement("span");
    label.className = "stats-summary__label";
    label.textContent = definition.label;
    const value = document.createElement("span");
    value.className = "stats-summary__value";
    if (definition.valueClass) {
      value.classList.add(definition.valueClass);
    }
    value.textContent = "—";
    row.append(label, value);
    statsSummary.append(row);
    statsSummaryRows.set(definition.key, value);
  }
  statsContainer.append(statsSummary);

  const hpBar = createStatBar("HP", "linear-gradient(90deg,#ff9a9e,#ff4e50)");
  const mpBar = createStatBar("MP", "linear-gradient(90deg,#74f2ff,#4fa9ff)");
  const expBar = createStatBar("EXP", "linear-gradient(90deg,#fddb92,#d1fdff)");

  const attributePanel = document.createElement("section");
  attributePanel.className = "attribute-panel";
  attributePanel.classList.add("stats-modal__allocation");

  const attributeHeader = document.createElement("div");
  attributeHeader.className = "attribute-panel__header";
  const attributeTitle = document.createElement("h2");
  attributeTitle.className = "attribute-panel__title";
  attributeTitle.textContent = "Stat Allocation";
  const statPointsBadge = document.createElement("span");
  statPointsBadge.className = "attribute-panel__points";
  attributeHeader.append(attributeTitle, statPointsBadge);
  attributePanel.append(attributeHeader);

  const attributeHint = document.createElement("p");
  attributeHint.className = "attribute-panel__hint";
  attributePanel.append(attributeHint);

  const attributeList = document.createElement("div");
  attributeList.className = "attribute-panel__list";
  attributePanel.append(attributeList);

  const attributeRows = new Map();
  for (const definition of attributeDefinitions) {
    const row = document.createElement("div");
    row.className = "attribute-panel__row";

    const info = document.createElement("div");
    info.className = "attribute-panel__info";
    const name = document.createElement("span");
    name.className = "attribute-panel__name";
    name.textContent = definition.label;
    const description = document.createElement("span");
    description.className = "attribute-panel__description";
    description.textContent = definition.description;
    info.append(name, description);

    const controls = document.createElement("div");
    controls.className = "attribute-panel__controls";
    const value = document.createElement("span");
    value.className = "attribute-panel__value";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attribute-panel__action";
    button.textContent = "+";
    button.setAttribute(
      "aria-label",
      `Spend a stat point to increase ${definition.label}`
    );
    button.addEventListener("click", () => {
      allocateStatPoint(definition.key);
    });
    controls.append(value, button);

    row.append(info, controls);
    attributeList.append(row);
    attributeRows.set(definition.key, { value, button });
  }

  const derivedStatsDefinitions = [
    { key: "maxHp", label: "Max Health" },
    { key: "maxMp", label: "Max Energy" },
    { key: "attackPower", label: "Attack Power" },
    { key: "speedRating", label: "Speed" }
  ];
  const derivedStatsList = document.createElement("dl");
  derivedStatsList.className = "attribute-panel__derived";
  const derivedStatRows = new Map();
  for (const definition of derivedStatsDefinitions) {
    const term = document.createElement("dt");
    term.className = "attribute-panel__derived-label";
    term.textContent = definition.label;
    const detail = document.createElement("dd");
    detail.className = "attribute-panel__derived-value";
    detail.textContent = "—";
    derivedStatsList.append(term, detail);
    derivedStatRows.set(definition.key, detail);
  }
  attributePanel.append(derivedStatsList);

  const loadoutPanel = createMiniGameLoadoutPanel(miniGameLoadoutState, {
    playerLevel: stats?.level ?? 1,
    onLoadoutsChange(nextState) {
      miniGameLoadoutState = nextState;
      syncMiniGameProfile();
    }
  });
  miniGameLoadoutState = loadoutPanel.getState();

  const crystalsLabel = document.createElement("p");
  crystalsLabel.className = "crystal-label";

  const message = document.createElement("p");
  message.className = "message";

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
    `Tag a call sign (e.g. ${callSignExample}) in your message to deliver it to another Astrocat.`;

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
      commsInput.placeholder =
        `Message another Astrocat by tagging their call sign (e.g. ${callSignExample})`;
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

    const targetCallSign = extractMentionedCallSign(rawMessage);
    if (!targetCallSign) {
      const errorText = `Include a call sign like ${callSignExample} to route your message.`;
      commsInput.setCustomValidity(errorText);
      commsInput.reportValidity();
      commsFeedback.textContent = errorText;
      commsFeedback.classList.add("is-error");
      commsFeedback.hidden = false;
      return;
    }

    commsInput.setCustomValidity("");
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

    const communityMission = completeMission("mission-community-post");
    if (communityMission.completed) {
      const xpAward = communityMission.mission?.xp ?? 0;
      let message =
        `Your call sign sparkles across the community board. +${xpAward} EXP.`;
      if (communityMission.leveledUp) {
        message += ` Level up! You reached level ${playerStats.level}.`;
      }
      showMessage(
        { text: message, author: "Mission Command", channel: "mission" },
        5600
      );
    } else if (communityMission.locked) {
      const required = Math.max(1, communityMission.mission?.requiredLevel ?? 1);
      showMessage(
        {
          text: `Reach Level ${required} to log community transmissions for the Recruit Missions board.`,
          author: "Mission Command",
          channel: "mission"
        },
        4200
      );
    }

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
  const applyMissionState = (missionState, playerLevel = 1) => {
    const normalizedState = Array.isArray(missionState) ? missionState : [];
    const total = normalizedState.length;
    const unlocked = normalizedState.filter((mission) => mission.unlocked).length;
    const completed = normalizedState.filter((mission) => mission.completed).length;
    const locked = Math.max(0, total - unlocked);
    if (total === 0) {
      missionSummary.textContent = "No missions available";
    } else {
      const denominator = unlocked > 0 ? unlocked : total;
      let summaryText = `${completed} / ${denominator} completed`;
      if (locked > 0) {
        summaryText += ` · ${locked} locked`;
      }
      missionSummary.textContent = summaryText;
    }
    missionList.innerHTML = "";
    for (const mission of normalizedState) {
      const item = document.createElement("li");
      item.className = "mission-log__item";
      if (mission.completed) {
        item.classList.add("is-completed");
      }
      if (!mission.unlocked) {
        item.classList.add("is-locked");
      }

      const status = document.createElement("span");
      status.className = "mission-log__status";
      status.textContent = mission.completed ? "✓" : mission.unlocked ? "•" : "🔒";

      const content = document.createElement("div");
      content.className = "mission-log__content";

      const name = document.createElement("p");
      name.className = "mission-log__name";
      name.textContent = mission.title;

      const description = document.createElement("p");
      description.className = "mission-log__description";
      description.textContent = mission.description;

      const flavor = document.createElement("p");
      flavor.className = "mission-log__flavor";
      if (mission.flavor) {
        flavor.textContent = mission.flavor;
        flavor.hidden = false;
      } else {
        flavor.textContent = "";
        flavor.hidden = true;
      }

      const reward = document.createElement("span");
      reward.className = "mission-log__reward";
      const xpText = `+${mission.xp} EXP`;
      if (mission.unlocked) {
        reward.textContent = xpText;
        reward.classList.remove("is-locked");
      } else {
        const requirement = Math.max(1, mission.requiredLevel ?? 1);
        reward.textContent = `${xpText} · Unlocks at Level ${requirement}`;
        reward.classList.add("is-locked");
      }

      if (mission.flavor) {
        content.append(name, description, flavor, reward);
      } else {
        content.append(name, description, reward);
      }
      item.append(status, content);
      missionList.append(item);
    }
  };

  const scheduleMissionRender = createFrameScheduler((missionState, level) => {
    applyMissionState(missionState, level);
  });

  const instructionItems = [
    { action: "Move", keys: "A/D or ←/→" },
    { action: "Jump", keys: "Space or W/↑" },
    { action: "Interact", keys: "E (near objects)" }
  ];
  function buildInstructionList() {
    const list = document.createElement("ul");
    list.className = "instruction-list";

    for (const entry of instructionItems) {
      const item = document.createElement("li");
      item.className = "instruction-list__item";

      const action = document.createElement("span");
      action.className = "instruction-list__action";
      action.textContent = entry.action;

      const keys = document.createElement("span");
      keys.className = "instruction-list__keys";
      keys.textContent = entry.keys;

      item.append(action, keys);
      list.append(item);
    }

    return list;
  }

  const instructions = buildInstructionList();

  const profileSection = document.createElement("section");
  profileSection.className = "hud-panel__profile";
  profileSection.append(subtitle, accountCard, crystalsLabel, message);
  panel.insertBefore(profileSection, hudButtons);

  const checklistDock = document.createElement("div");
  checklistDock.className = "hud-panel__checklist";
  checklistDock.hidden = true;
  panel.insertBefore(checklistDock, hudButtons);

  registerHudPopup({
    id: "hud-stats",
    label: "Stats",
    title: "Pilot Stats",
    description: "Review your pilot vitals and prepare for the next launch without leaving the lobby.",
    sections: [
      {
        id: "hud-stats-overview",
        heading: "Pilot Overview",
        description: "Vitals, rank, and resource bars update as you progress.",
        nodes: [statsContainer]
      },
      {
        id: "hud-stats-allocation",
        heading: "Allocate Points",
        description: "Spend stat points to tailor your play style before the next mission.",
        nodes: [attributePanel]
      }
    ]
  });

  registerHudPopup({
    id: "hud-loadouts",
    label: "Loadouts",
    title: "Mini Game Loadouts",
    description: "Save, compare, and equip custom presets so you are always mission ready.",
    sections: [
      {
        id: "hud-loadouts-management",
        heading: "Preset Management",
        description: "Organize your favorite builds and swap between them instantly.",
        nodes: [loadoutPanel.root]
      }
    ]
  });

  registerHudPopup({
    id: "hud-comms",
    label: "Comms",
    title: "Comms Center",
    description: "Send transmissions to fellow pilots and monitor the chatter targeted at your call sign.",
    sections: [
      {
        id: "hud-comms-inbox",
        heading: "Inbox & Transmissions",
        description: "Messages addressed to your call sign land here. Log in to join the conversation.",
        nodes: [commsSection]
      }
    ]
  });

  registerHudPopup({
    id: "hud-missions",
    label: "Missions",
    title: "Mission Log",
    description: "Track story objectives, contract work, and training opportunities at a glance.",
    sections: [
      {
        id: "hud-missions-board",
        heading: "Assignments",
        description: "Review mission requirements and rewards before you deploy.",
        nodes: [missionSection]
      }
    ]
  });

  registerHudPopup({
    id: "hud-controls",
    label: "Controls",
    title: "Pilot Controls",
    description: "Keep these essential bindings handy while you navigate the lobby.",
    sections: [
      {
        id: "hud-controls-shortcuts",
        heading: "Flight Deck Shortcuts",
        description: "Keyboard inputs for movement, jumping, and interactions.",
        nodes: [instructions]
      }
    ]
  });

  const movementHintState = {
    root: null,
    body: null,
    acknowledgeButton: null,
    visible: false,
    onAcknowledge: null
  };

  function ensureMovementHintElement() {
    if (movementHintState.root) {
      return movementHintState;
    }

    const overlay = document.createElement("div");
    overlay.className = "movement-hint";
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("role", "status");

    const title = document.createElement("p");
    title.className = "movement-hint__title";
    title.textContent = "Need a refresher?";

    const body = document.createElement("div");
    body.className = "movement-hint__body";
    const list = buildInstructionList();
    list.classList.add("movement-hint__list");
    body.append(list);

    const footer = document.createElement("div");
    footer.className = "movement-hint__footer";
    const acknowledgeButton = document.createElement("button");
    acknowledgeButton.type = "button";
    acknowledgeButton.className = "movement-hint__ack";
    acknowledgeButton.textContent = "Got it";
    acknowledgeButton.addEventListener("click", () => {
      if (typeof movementHintState.onAcknowledge === "function") {
        movementHintState.onAcknowledge();
      } else if (movementHintState.root) {
        movementHintState.root.classList.remove("is-visible");
        movementHintState.root.setAttribute("aria-hidden", "true");
        movementHintState.visible = false;
        movementHintState.onAcknowledge = null;
      }
    });
    footer.append(acknowledgeButton);

    overlay.append(title, body, footer);
    canvasSurface.append(overlay);

    movementHintState.root = overlay;
    movementHintState.body = body;
    movementHintState.acknowledgeButton = acknowledgeButton;

    return movementHintState;
  }

  function refreshMovementHintInstructions() {
    const state = ensureMovementHintElement();
    if (!state.body) {
      return;
    }

    state.body.textContent = "";
    const list = buildInstructionList();
    list.classList.add("movement-hint__list");
    state.body.append(list);
  }

  function positionMovementHintOverlay(target, options = {}) {
    const state = ensureMovementHintElement();
    const { root } = state;
    if (!root || !target) {
      return;
    }

    const cameraOffset = Number.isFinite(options.cameraOffset)
      ? options.cameraOffset
      : 0;
    const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
    const viewportWidth = Number.isFinite(options.viewportWidth)
      ? options.viewportWidth
      : null;
    const viewportHeight = Number.isFinite(options.viewportHeight)
      ? options.viewportHeight
      : null;

    const targetWidth = typeof target.width === "number" ? target.width : 0;
    const targetX = (typeof target.x === "number" ? target.x : 0) - cameraOffset;
    const centerX = targetX + targetWidth / 2;
    const anchorTop =
      typeof target.promptAnchorY === "number"
        ? target.promptAnchorY
        : typeof target.y === "number"
          ? target.y
          : 0;
    const anchorHeight = typeof target.height === "number" ? target.height : 0;
    const tailGap = Math.min(14, Math.max(6, anchorHeight ? anchorHeight * 0.12 : 8));

    let clampedX = centerX;
    if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
      const margin = 24;
      clampedX = Math.max(margin, Math.min(centerX, viewportWidth - margin));
    }

    const anchorY = anchorTop - tailGap;
    const surfaceWidth = canvasSurface.clientWidth;
    const surfaceHeight = canvasSurface.clientHeight;
    const canvasWidth =
      Number.isFinite(viewportWidth) && viewportWidth > 0
        ? viewportWidth * scale
        : surfaceWidth;
    const canvasHeight =
      Number.isFinite(viewportHeight) && viewportHeight > 0
        ? viewportHeight * scale
        : surfaceHeight;
    const offsetX = (surfaceWidth - canvasWidth) / 2;
    const offsetY = (surfaceHeight - canvasHeight) / 2;

    const computedLeft = offsetX + clampedX * scale;
    const computedTop = offsetY + anchorY * scale;

    root.style.left = `${Number.isFinite(computedLeft) ? computedLeft : 0}px`;
    root.style.top = `${Number.isFinite(computedTop) ? computedTop : 0}px`;
  }

  root.append(canvasWrapper, panel);

  function setStatsSummaryValue(key, text) {
    const target = statsSummaryRows.get(key);
    if (!target) {
      return;
    }
    target.textContent = text;
  }

  function updateStatsSummary(updatedStats) {
    if (!updatedStats || typeof updatedStats !== "object") {
      for (const value of statsSummaryRows.values()) {
        value.textContent = "—";
      }
      return;
    }

    const baseLevel = Math.max(1, Math.floor(updatedStats.level ?? 1));
    setStatsSummaryValue("level", baseLevel.toString());

    const rank = updatedStats.rank;
    setStatsSummaryValue("rank", rank ? `${rank}` : "—");

    const unspentPoints = Math.max(0, Math.floor(updatedStats.statPoints ?? 0));
    setStatsSummaryValue("statPoints", `${unspentPoints} pts`);

    const exp = typeof updatedStats.exp === "number" ? updatedStats.exp : null;
    const maxExp = typeof updatedStats.maxExp === "number" ? updatedStats.maxExp : null;
    if (exp !== null && maxExp !== null && maxExp > 0) {
      const clampedExp = clamp(exp, 0, maxExp);
      const percent = Math.round((clampedExp / maxExp) * 100);
      setStatsSummaryValue(
        "expProgress",
        `${Math.round(clampedExp)} / ${Math.round(maxExp)} (${percent}%)`
      );
    } else {
      setStatsSummaryValue("expProgress", "—");
    }
  }

  function updateAttributeInterface(updatedStats) {
    const availablePoints = Math.max(0, updatedStats.statPoints ?? 0);
    statPointsBadge.textContent =
      availablePoints === 1 ? "1 point" : `${availablePoints} points`;
    statPointsBadge.classList.toggle("is-empty", availablePoints === 0);
    attributeHint.textContent =
      availablePoints > 0
        ? `You have ${availablePoints} stat ${availablePoints === 1 ? "point" : "points"} to spend. Bonus caches unlock every ${STAT_POINT_MILESTONE_INTERVAL} levels.`
        : `Complete missions to earn stat points. Bonus caches unlock every ${STAT_POINT_MILESTONE_INTERVAL} levels.`;

    for (const definition of attributeDefinitions) {
      const row = attributeRows.get(definition.key);
      if (!row) {
        continue;
      }
      const rawValue = updatedStats.attributes?.[definition.key];
      const value = typeof rawValue === "number" ? rawValue : definition.base;
      row.value.textContent = value.toString();
      row.button.disabled = availablePoints === 0;
    }
  }

  function updateDerivedStatsInterface(updatedStats) {
    for (const definition of derivedStatsDefinitions) {
      const target = derivedStatRows.get(definition.key);
      if (!target) {
        continue;
      }
      const rawValue = updatedStats?.[definition.key];
      target.textContent =
        typeof rawValue === "number" ? Math.round(rawValue).toString() : "—";
    }
  }

  function allocateStatPoint(attributeKey) {
    if (!stats) {
      return;
    }
    const availablePoints = Math.max(0, stats.statPoints ?? 0);
    if (availablePoints <= 0) {
      statPointsBadge.classList.add("attribute-panel__points--pulse");
      setTimeout(() => {
        statPointsBadge.classList.remove("attribute-panel__points--pulse");
      }, 320);
      return;
    }
    if (!stats.attributes) {
      stats.attributes = createInitialAttributeState();
    }
    const currentValue = stats.attributes[attributeKey] ?? 0;
    stats.attributes[attributeKey] = currentValue + 1;
    stats.statPoints = availablePoints - 1;
    applyAttributeScaling(stats);
    syncActiveAccountProgress();
    updateBar(hpBar, stats.hp, stats.maxHp);
    updateBar(mpBar, stats.mp, stats.maxMp);
    updateAttributeInterface(stats);
    updateDerivedStatsInterface(stats);
    updateStatsSummary(stats);
    syncMiniGameProfile();
  }

  function setLayoutEditingActive(active) {
    const isActive = Boolean(active);
    layoutCustomizeButton.textContent = isActive ? "Lock Layout" : "Customize Layout";
    layoutCustomizeButton.setAttribute("aria-pressed", isActive ? "true" : "false");
    layoutCustomizeButton.classList.toggle("hud-panel__button--active", isActive);
  }

  function setLayoutResetAvailable(available) {
    const enabled = Boolean(available);
    layoutResetButton.disabled = !enabled;
    layoutResetButton.setAttribute("aria-disabled", enabled ? "false" : "true");
  }

  updateAttributeInterface(stats);
  updateDerivedStatsInterface(stats);
  updateStatsSummary(stats);

  return {
    root: interfaceRoot,
    canvasWrapper,
    canvasSurface,
    canvasBackground,
    backgroundVideo,
    layoutCustomizeButton,
    layoutResetButton,
    getChecklistContainer() {
      return checklistDock;
    },
    promptText: "",
    promptEntity: null,
    setLayoutEditingActive,
    setLayoutResetAvailable,
    getBackgroundVideo() {
      return backgroundVideo;
    },
    getBackgroundVideoState() {
      return canvasBackground.dataset.state || "disabled";
    },
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
      updateAttributeInterface(updatedStats);
      updateDerivedStatsInterface(updatedStats);
      updateStatsSummary(updatedStats);
      loadoutPanel.setPlayerLevel(updatedStats.level);
      miniGameLoadoutState = loadoutPanel.getState();
      syncMiniGameProfile();
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
      const author = meta.author ?? (channel === "friend" ? "Crewmate" : defaultMissionAuthor);
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
    setPrompt(text, entity) {
      this.promptText = text;
      this.promptEntity = text ? entity ?? null : null;
    },
    showMovementHint(target, options = {}) {
      const state = ensureMovementHintElement();
      if (!state.root) {
        return;
      }

      if (!state.visible || !state.body?.firstChild) {
        refreshMovementHintInstructions();
      }

      state.onAcknowledge =
        typeof options.onAcknowledge === "function" ? options.onAcknowledge : null;

      positionMovementHintOverlay(target, options);
      state.root.classList.add("is-visible");
      state.root.setAttribute("aria-hidden", "false");
      state.visible = true;
    },
    hideMovementHint() {
      const state = movementHintState;
      if (!state.root) {
        return;
      }

      if (state.visible) {
        state.root.classList.remove("is-visible");
        state.root.setAttribute("aria-hidden", "true");
        state.visible = false;
      }

      state.onAcknowledge = null;
    },
    setWalletState(state = {}) {
      walletUiState = { ...walletUiState, ...state };
      if (walletControls && typeof walletControls.setState === "function") {
        walletControls.setState(walletUiState);
      }
      updateAccountActions(accountLoggedIn);
    },
    setAccount(account, starter) {
      updateAccountCard(account, starter);
      updateCommsInterface(account?.callSign);
    },
    setStoredAccounts(accounts, activeCallSign) {
      updateAccountDirectory(accounts, activeCallSign);
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

  function createToolbar(walletSection) {
    const header = document.createElement("header");
    header.className = "site-toolbar";

    applyToolbarBackground(header);

    const inner = document.createElement("div");
    inner.className = "site-toolbar__inner";

    const brandGroup = document.createElement("div");
    brandGroup.className = "site-toolbar__brand-group";

    const brandLink = document.createElement("a");
    brandLink.className = "site-toolbar__brand";
    brandLink.href = "#app";
    brandLink.setAttribute(
      "aria-label",
      "Return to the top of the Astrocat Lobby"
    );

    const brandText = document.createElement("span");
    brandText.className = "site-toolbar__brand-text";
    brandText.textContent = "Astrocat Lobby";
    brandLink.append(brandText);

    attachToolbarBrandImage(brandLink);

    const tagline = document.createElement("span");
    tagline.className = "site-toolbar__tagline";
    tagline.textContent = "Launch into adventure";

    brandGroup.append(brandLink, tagline);

    const nav = document.createElement("nav");
    nav.className = "site-toolbar__nav";

    const list = document.createElement("ul");
    list.className = "site-toolbar__list";

    const links = [
      { label: "X.com", href: "https://x.com", external: true },
      { label: "Medium", href: "https://medium.com", external: true },
      { label: "About", href: "#about", external: false }
    ];

    for (const linkDefinition of links) {
      const item = document.createElement("li");
      item.className = "site-toolbar__item";

      const link = document.createElement("a");
      link.className = "site-toolbar__link";
      link.href = linkDefinition.href;
      link.textContent = linkDefinition.label;

      if (linkDefinition.external) {
        link.target = "_blank";
        link.rel = "noreferrer noopener";
      }

      item.append(link);
      list.append(item);
    }

    nav.append(list);
    inner.append(brandGroup, nav);
    if (walletSection?.root) {
      inner.append(walletSection.root);
    }
    header.append(inner);

    return header;
  }

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
      createLegendBadge("mission", defaultMissionAuthor),
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
    mascotImage.alt = `${defaultMissionAuthor} portrait`;
    mascotImage.decoding = "async";
    mascotImage.hidden = true;

    const mascotPlaceholder = document.createElement("span");
    mascotPlaceholder.className = "chat-board__mascot-placeholder";
    mascotPlaceholder.textContent = computeInitials(defaultMissionAuthor);

    mascotAvatar.append(mascotImage, mascotPlaceholder);
    mascotFigure.append(mascotAvatar);

    const bubble = document.createElement("div");
    bubble.className = "chat-board__bubble";
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");

    const bubbleLabel = document.createElement("span");
    bubbleLabel.className = "chat-board__bubble-label";
    bubbleLabel.textContent = defaultMissionAuthor;

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
        author ?? (resolvedChannel === "friend" ? "Crewmate" : defaultMissionAuthor);
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
        author ?? (resolvedChannel === "friend" ? "Crewmate" : defaultMissionAuthor);

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
        return;
      }

      if (guideSprite && guideSprite.image && guideSprite.image.src) {
        mascotImage.src = guideSprite.image.src;
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

    if (guideSprite && guideSprite.image) {
      if (guideSprite.isReady()) {
        updateMascotSprite();
      } else {
        guideSprite.image.addEventListener("load", updateMascotSprite, { once: true });
      }
    }

    return {
      root: section,
      presentMascot,
      hideMascot,
      addMessage
    };
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
    accountLoggedIn = Boolean(isLoggedIn);

    if (walletUiState.connected) {
      loginButton.textContent = "Switch wallet";
      logoutButton.textContent = "Disconnect";
      logoutButton.hidden = false;
    } else if (walletUiState.available) {
      loginButton.textContent = accountLoggedIn ? "Switch wallet" : "Connect wallet";
      logoutButton.textContent = "Sign out";
      logoutButton.hidden = !accountLoggedIn;
    } else {
      loginButton.textContent = accountLoggedIn ? "Switch account" : "Log in";
      logoutButton.textContent = "Log out";
      logoutButton.hidden = !accountLoggedIn;
    }
  }

  function updateAccountDirectory(entries, activeCallSign) {
    const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
    accountProfilesSelect.innerHTML = "";

    if (list.length === 0) {
      accountProfiles.hidden = true;
      accountProfilesSelection = "";
      return;
    }

    accountProfiles.hidden = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a profile";
    accountProfilesSelect.append(placeholder);

    for (const entry of list) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const option = document.createElement("option");
      option.value = entry.callSign;
      const handleLabel =
        entry.callSign && typeof entry.callSign === "string"
          ? `@${entry.callSign}`
          : typeof entry.handle === "string"
            ? entry.handle
            : "";
      option.textContent = handleLabel ? `${entry.catName} · ${handleLabel}` : entry.catName;
      accountProfilesSelect.append(option);
    }

    const hasActive =
      typeof activeCallSign === "string" &&
      list.some((entry) => entry?.callSign === activeCallSign);
    const nextValue = hasActive ? activeCallSign : "";
    accountProfilesSelect.value = nextValue;
    accountProfilesSelection = nextValue;
  }

  function updateAccountCard(account, starterOverride) {
    const fallbackStarter = starterOverride ?? defaultStarterCharacter;

    accountLoggedIn = Boolean(account);

    if (!account) {
      accountCard.classList.add("account-card--empty");
      accountHandle.classList.add("is-placeholder");
      accountHandleValue.textContent = "-----";
      accountCatName.textContent = "Name your Astrocat to begin your mission.";
      accountCatName.classList.add("is-placeholder");
      accountStarterImage.src = fallbackStarter.image;
      accountStarterImage.alt = fallbackStarter.name;
      accountStarterName.textContent = fallbackStarter.name;
      accountStarterTagline.textContent = fallbackStarter.tagline;
      updateAccountActions(false);
      return;
    }

    const resolvedStarter =
      starterOverride ?? findStarterCharacter(account?.starterId) ?? fallbackStarter;
    accountCard.classList.remove("account-card--empty");
    const callSignLabel = account.callSign ? `@${account.callSign}` : account.handle;
    if (callSignLabel) {
      accountHandleValue.textContent = callSignLabel;
      accountHandle.classList.remove("is-placeholder");
    } else {
      accountHandleValue.textContent = "-----";
      accountHandle.classList.add("is-placeholder");
    }
    const displayName = typeof account.catName === "string" ? account.catName.trim() : "";
    if (displayName) {
      accountCatName.textContent = displayName;
      accountCatName.classList.remove("is-placeholder");
    } else {
      accountCatName.textContent = "Name your Astrocat to begin your mission.";
      accountCatName.classList.add("is-placeholder");
    }
    accountStarterImage.src = resolvedStarter.image;
    accountStarterImage.alt = resolvedStarter.name;
    accountStarterName.textContent = resolvedStarter.name;
    accountStarterTagline.textContent = resolvedStarter.tagline;
    updateAccountActions(true);
  }
}
