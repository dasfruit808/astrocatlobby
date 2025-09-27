// Provide minimal runtime shims before the rest of the lobby bootstraps. These
// ensure the game can execute on browsers that predate modern globals but still
// support ES modules.
(function ensureGlobalThis() {
  if (typeof globalThis === "object") {
    return;
  }

  if (typeof self !== "undefined" && self) {
    self.globalThis = self;
    return;
  }

  if (typeof window !== "undefined" && window) {
    window.globalThis = window;
    return;
  }

  if (typeof global !== "undefined" && global) {
    global.globalThis = global;
  }
})();

const runtimeGlobal =
  typeof globalThis === "object"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
        ? self
        : typeof global !== "undefined"
          ? global
          : {};

// Safari < 15 occasionally exposes URL but without the URLSearchParams helpers.
// Fall back to the anchor element resolver to guarantee relative paths resolve.
if (typeof runtimeGlobal.URL !== "function" && typeof document !== "undefined") {
  runtimeGlobal.URL = function legacyURL(url, base) {
    if (base) {
      const tempDocument = document.implementation.createHTMLDocument("");
      const baseElement = tempDocument.createElement("base");
      baseElement.href = `${base}`;
      tempDocument.head.appendChild(baseElement);
      const anchor = tempDocument.createElement("a");
      anchor.href = `${url}`;
      tempDocument.body.appendChild(anchor);
      return anchor;
    }

    const anchor = document.createElement("a");
    anchor.href = `${url}`;
    return anchor;
  };
}

const backgroundImageUrl = new URL(
  "./assets/LobbyBackground.png",
  import.meta.url
).href;

function normalizePublicRelativePath(relativePath) {
  if (typeof relativePath !== "string") {
    return "";
  }

  return relativePath
    .trim()
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

function getPublicManifest() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const manifest = globalThis.__ASTROCAT_PUBLIC_MANIFEST__;
  return manifest && typeof manifest === "object" ? manifest : null;
}

function readPublicManifestEntry(relativePath) {
  const manifest = getPublicManifest();
  if (!manifest) {
    return null;
  }

  const entry = manifest[relativePath];
  return typeof entry === "string" && entry ? entry : null;
}

function tryFindPublicManifestEntryByBasename(relativePath) {
  const manifest = getPublicManifest();
  if (!manifest) {
    return null;
  }

  const normalized = normalizePublicRelativePath(relativePath);
  const separatorIndex = normalized.lastIndexOf("/");
  const baseName = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
  if (!baseName) {
    return null;
  }

  let fallbackEntry = null;
  for (const key of Object.keys(manifest)) {
    if (key === normalized) {
      continue;
    }

    const manifestSeparatorIndex = key.lastIndexOf("/");
    const manifestBaseName =
      manifestSeparatorIndex >= 0 ? key.slice(manifestSeparatorIndex + 1) : key;
    if (manifestBaseName !== baseName) {
      continue;
    }

    const manifestValue = manifest[key];
    if (typeof manifestValue !== "string" || !manifestValue) {
      continue;
    }

    if (fallbackEntry) {
      return null;
    }

    fallbackEntry = manifestValue;
  }

  return fallbackEntry;
}

function isResolvableBaseHref(baseHref) {
  if (typeof baseHref !== "string") {
    return false;
  }

  const trimmed = baseHref.trim();
  if (!trimmed) {
    return false;
  }

  if (/^(?:about|blob|data|javascript):/i.test(trimmed)) {
    return false;
  }

  return true;
}

function getDocumentBaseHref() {
  if (typeof document !== "undefined" && typeof document.baseURI === "string") {
    if (isResolvableBaseHref(document.baseURI)) {
      return document.baseURI;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.href === "string" &&
    isResolvableBaseHref(window.location.href)
  ) {
    return window.location.href;
  }

  return null;
}

function normaliseHrefForDirectory(baseHref) {
  if (!baseHref) {
    return null;
  }

  const withoutFragment = baseHref.split("#", 1)[0];
  const withoutQuery = withoutFragment.split("?", 1)[0];
  if (!withoutQuery) {
    return null;
  }

  if (withoutQuery.endsWith("/")) {
    return withoutQuery;
  }

  const segments = withoutQuery.split("/");
  const lastSegment = segments[segments.length - 1] ?? "";
  if (!lastSegment || !lastSegment.includes(".")) {
    return `${withoutQuery}/`;
  }

  const trimmed = withoutQuery.replace(/[^/]*$/, "");
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

function normalisePathnameForDirectory(pathname) {
  if (typeof pathname !== "string" || !pathname) {
    return "/";
  }

  let working = pathname;
  if (!working.startsWith("/")) {
    working = `/${working}`;
  }

  if (working.endsWith("/")) {
    return working;
  }

  const segments = working.split("/");
  const lastSegment = segments[segments.length - 1] ?? "";
  if (!lastSegment || !lastSegment.includes(".")) {
    return `${working}/`;
  }

  const trimmed = working.replace(/[^/]*$/, "");
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

function resolveUsingDocumentBase(candidate) {
  const baseHref = getDocumentBaseHref();
  const normalisedBase = normaliseHrefForDirectory(baseHref);
  if (!normalisedBase) {
    return null;
  }

  try {
    return new URL(candidate, normalisedBase).toString();
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      console.warn("Failed to resolve public asset using document base", candidate, error);
    }
  }

  return null;
}

function resolvePublicAssetUrl(relativePath) {
  const normalized = normalizePublicRelativePath(relativePath);
  if (!normalized) {
    return null;
  }

  let manifestEntry = readPublicManifestEntry(normalized);
  if (!manifestEntry) {
    manifestEntry = tryFindPublicManifestEntryByBasename(normalized);
  }
  if (manifestEntry) {
    if (
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(manifestEntry) ||
      manifestEntry.startsWith("//") ||
      manifestEntry.startsWith("/") ||
      manifestEntry.startsWith("./") ||
      manifestEntry.startsWith("../")
    ) {
      return manifestEntry;
    }

    const resolvedFromManifest = resolveUsingDocumentBase(manifestEntry);
    if (resolvedFromManifest) {
      return resolvedFromManifest;
    }

    return manifestEntry;
  }

  const candidate = normalized;

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate) || candidate.startsWith("//")) {
    return candidate;
  }

  if (candidate.startsWith("./") || candidate.startsWith("../")) {
    return candidate;
  }

  const base = import.meta?.env?.BASE_URL ?? "/";

  if (typeof base === "string" && base) {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(base) || base.startsWith("//")) {
      const separator = base.endsWith("/") ? "" : "/";
      return `${base}${separator}${candidate}`;
    }

    if (base.startsWith("/")) {
      const separator = base.endsWith("/") ? "" : "/";
      return `${base}${separator}${candidate}`;
    }

    const merged = `${base}${base.endsWith("/") ? "" : "/"}${candidate}`;
    const resolved = resolveUsingDocumentBase(merged);
    if (resolved) {
      return resolved;
    }
    return merged;
  }

  return `/${candidate}`;
}

function tryCreateAssetManifest() {
  try {
    return import.meta.glob("./assets/*.{png,PNG}", {
      eager: true,
      import: "default"
    });
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      const message =
        error instanceof TypeError && typeof error.message === "string"
          ? "import.meta.glob is unavailable in this environment. Falling back to dynamic loading."
          : "import.meta.glob failed while loading sprite assets. Falling back to dynamic loading.";
      console.warn(message, error);
    }
    return null;
  }
}

const assetManifest = tryCreateAssetManifest();

function tryCreateAudioManifest() {
  try {
    return import.meta.glob("./assets/audio/*.{wav,mp3,ogg}", {
      eager: true,
      import: "default"
    });
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      const message =
        error instanceof TypeError && typeof error.message === "string"
          ? "import.meta.glob is unavailable for audio assets. Falling back to dynamic loading."
          : "import.meta.glob failed while loading audio assets. Falling back to dynamic loading.";
      console.warn(message, error);
    }
    return null;
  }
}

const audioManifest = tryCreateAudioManifest();

const baseCanvasWidth = 960;
const baseCanvasHeight = 540;
// Place a custom background image at public/webpagebackground.png to override
// the gradient page backdrop.

const customPageBackgroundUrl = resolvePublicAssetUrl("webpagebackground.png");
const toolbarBackgroundImageSources = [
  resolvePublicAssetUrl("toolbar-background.png"),
  resolvePublicAssetUrl("AstroCats3/toolbar-background.png")
].filter((candidate, index, all) => {
  if (typeof candidate !== "string" || !candidate) {
    return false;
  }

  return all.indexOf(candidate) === index;
});
const toolbarBrandImageSources = [
  resolvePublicAssetUrl("toolbar-brand.png"),
  resolvePublicAssetUrl("AstroCats3/toolbar-brand.png")
]
  .filter((candidate, index, all) => {
    if (typeof candidate !== "string" || !candidate) {
      return false;
    }

    return all.indexOf(candidate) === index;
  });
let customBackgroundAvailabilityProbe = null;

function shouldUseCustomPageBackground() {
  if (!customPageBackgroundUrl) {
    return Promise.resolve(false);
  }

  if (customBackgroundAvailabilityProbe) {
    return customBackgroundAvailabilityProbe;
  }

  if (typeof fetch !== "function") {
    customBackgroundAvailabilityProbe = Promise.resolve(true);
    return customBackgroundAvailabilityProbe;
  }

  customBackgroundAvailabilityProbe = fetch(customPageBackgroundUrl, {
    method: "HEAD",
    cache: "no-store"
  })
    .then((response) => {
      if (!response) {
        return false;
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (!contentType) {
          return true;
        }

        if (contentType.startsWith("image/")) {
          return true;
        }

        return false;
      }

      if (response.status === 405 || response.status === 501) {
        return true;
      }

      return false;
    })
    .catch(() => false);

  return customBackgroundAvailabilityProbe;
}
// The mini game entry point that loads inside the arcade cabinet overlay.
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
    return new URL("../AstroCats3/index.html", import.meta.url).toString();
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

    shouldUseCustomPageBackground().then((shouldApply) => {
      if (!shouldApply) {
        body.classList.remove("has-custom-background");
        body.style.removeProperty("--page-background-overlay");
        return;
      }

      const pageBackground = new Image();
      pageBackground.decoding = "async";

      const handleLoad = () => {
        body.classList.add("has-custom-background");
        body.style.setProperty(
          "--page-background-overlay",
          `url("${pageBackground.src}")`
        );
      };

      const handleError = () => {
        body.classList.remove("has-custom-background");
        body.style.removeProperty("--page-background-overlay");
      };

      pageBackground.addEventListener("load", handleLoad, { once: true });
      pageBackground.addEventListener("error", handleError, { once: true });
      pageBackground.src = customPageBackgroundUrl;
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
const arcadeSprite = createOptionalSprite("./assets/ArcadeSprite.png");

const app = document.querySelector("#app");
if (!app) {
  throw new Error("Missing #app container");
}

const audio = createAudioManager();
audio.playBackground();

const backgroundImage = new Image();
const backgroundSource = backgroundImageUrl;
let backgroundReady = false;
let backgroundDimensions = { width: 0, height: 0 };
const markBackgroundReady = () => {
  backgroundReady = true;
  backgroundDimensions = {
    width: backgroundImage.naturalWidth || baseCanvasWidth,
    height: backgroundImage.naturalHeight || baseCanvasHeight
  };
};
const handleBackgroundError = () => {
  backgroundReady = false;
  backgroundDimensions = { width: 0, height: 0 };
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
  const assetPath = `./assets/${relativePath}`;

  if (assetManifest && typeof assetManifest === "object") {
    const resolved = assetManifest[assetPath];
    if (typeof resolved === "string" && resolved) {
      return resolved;
    }
  }

  try {
    return new URL(assetPath, import.meta.url).href;
  } catch (error) {
    if (typeof console !== "undefined" && error) {
      console.warn(`Failed to resolve loadout art at ${assetPath}`, error);
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

const miniGamePilotOptions = [
  {
    id: "nova",
    name: "Nova",
    role: "Squad Vanguard",
    summary:
      "Balanced thrusters and pinpoint instincts keep Nova stable during any sortie.",
    image: resolvePanelSpriteAsset("playersprite1.png")
  },
  {
    id: "aurora",
    name: "Aurora",
    role: "Skystreak Ace",
    summary:
      "Aurora’s tuned reactors favour evasive manoeuvres and quick recoveries through dense fields.",
    image: resolvePanelSpriteAsset("playersprite2.png")
  },
  {
    id: "ember",
    name: "Ember",
    role: "Siegebreak Specialist",
    summary:
      "Ember channels heavier ordinance to crack shielded foes when the pressure spikes.",
    image: resolvePanelSpriteAsset("playersprite3.png")
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
    characterId: miniGamePilotOptions[0]?.id ?? "nova",
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
      miniGamePilotOptions,
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

const playerStats = {
  name: activeAccount?.catName ?? fallbackAccount.catName,
  handle: activeAccount?.handle ?? fallbackAccount.handle,
  callSign: activeAccount?.callSign ?? fallbackAccount.callSign,
  starterId: activeAccount?.starterId ?? fallbackAccount.starterId,
  level: 1,
  rank: rankThresholds[0].title,
  exp: 0,
  maxExp: getExpForNextLevel(1),
  hp: 85,
  maxHp: 100,
  mp: 40,
  maxMp: 60,
  statPoints: getStatPointsForLevel(1),
  attributes: createInitialAttributeState(),
  attackPower: 0,
  speedRating: 0
};

applyAttributeScaling(playerStats, { preservePercent: true });

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

const ui = createInterface(playerStats, {
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
let miniGameOverlayState = null;
let miniGameBodyOverflow = "";
let miniGameActive = false;

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
  syncMiniGameProfile();
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
  syncMiniGameProfile();
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

const lobbySpriteScale = 1.25;

const groundY = viewport.height - 96;
const playerWidth = Math.round(72 * 1.1 * lobbySpriteScale);
const playerHeight = Math.round(81 * 1.1 * lobbySpriteScale);

const player = {
  x: viewport.width / 2 - playerWidth / 2,
  y: groundY - playerHeight,
  width: playerWidth,
  height: playerHeight,
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
    type: "arcade",
    label: "Starcade Cabinet",
    x: 520,
    y: groundY - 102,
    width: 68,
    height: 102
  },
  {
    type: "npc",
    name: "Nova",
    label: "Nova the Guide",
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
].map((interactable) => scaleLobbyEntity(interactable));

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
  if (movementKeyCodes.has(event.code) && !isInteractiveElement(event.target)) {
    event.preventDefault();
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

  if (miniGameActive) {
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    ui.setPrompt("");
    return;
  }

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
  let promptTarget = null;

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
      promptTarget = interactable;
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
      promptTarget = interactable;
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
    } else if (interactable.type === "arcade") {
      promptText = "Press E to launch the Starcade";
      promptTarget = interactable;
      if (justPressed.has("KeyE")) {
        audio.playEffect("dialogue");
        openMiniGame();
        showMessage(
          {
            text: "The arcade cabinet hums to life. Press Escape or Back to lobby to return.",
            author: "Mission Log",
            channel: "mission",
            silent: true,
            log: true
          },
          0
        );
      }
    } else if (interactable.type === "fountain") {
      promptText = "Press E to draw power from the fountain";
      promptTarget = interactable;
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
      promptTarget = interactable;
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
      promptTarget = interactable;
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
        promptTarget = portal;
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
        promptTarget = portal;
      } else {
        promptText = "Press E to step through the charged portal";
        promptTarget = portal;
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
      promptTarget = portal;
    }
  }

  ui.setPrompt(promptText, promptTarget);
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

  ctx.fillStyle = getFallbackBackgroundGradient();
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  if (backgroundReady) {
    const { width: sourceWidth, height: sourceHeight } = backgroundDimensions;
    if (sourceWidth > 0 && sourceHeight > 0) {
      const widthScale = viewport.width / sourceWidth;
      const heightScale = viewport.height / sourceHeight;
      const scale = Math.min(widthScale, heightScale);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const offsetX = (viewport.width - drawWidth) / 2;
      const offsetY = (viewport.height - drawHeight) / 2;
      ctx.drawImage(
        backgroundImage,
        0,
        0,
        sourceWidth,
        sourceHeight,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight
      );
    } else {
      ctx.drawImage(backgroundImage, 0, 0, viewport.width, viewport.height);
    }
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
    } else if (interactable.type === "arcade") {
      drawArcade(interactable, time);
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
    drawPromptBubble(ui.promptText, ui.promptEntity || player);
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

function drawPromptBubble(text, entity) {
  if (!text) {
    return;
  }

  const target = entity ?? player;
  ctx.save();
  ctx.font = promptFont;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const metrics = getPromptMetrics(text);
  const paddingX = 18;
  const paddingY = 14;
  const tailHeight = 18;
  const tailHalfWidth = 20;
  const radius = 24;
  const bubbleWidth = metrics.width + paddingX * 2;
  const minimumHeight = 48;
  const bubbleHeight = Math.max(metrics.height + paddingY * 2, minimumHeight);
  const centerX = target.x + target.width / 2;
  const anchorTop =
    typeof target.promptAnchorY === "number" ? target.promptAnchorY : target.y ?? 0;
  const anchorHeight = target.height ?? 0;
  const tailGap = Math.min(14, Math.max(6, anchorHeight ? anchorHeight * 0.12 : 8));
  const marginX = 18;
  let bubbleX = centerX - bubbleWidth / 2;
  bubbleX = Math.max(marginX, Math.min(bubbleX, viewport.width - bubbleWidth - marginX));
  let bubbleY = anchorTop - bubbleHeight - tailHeight - tailGap;
  bubbleY = Math.max(18, bubbleY);
  const tailBaseY = bubbleY + bubbleHeight;
  const tailTipX = Math.max(
    bubbleX + radius + 6,
    Math.min(centerX, bubbleX + bubbleWidth - radius - 6)
  );
  const tailTipY = Math.max(
    tailBaseY + 6,
    Math.min(tailBaseY + tailHeight, anchorTop - Math.max(2, tailGap * 0.5))
  );

  const traceBubblePath = () => {
    ctx.beginPath();
    ctx.moveTo(bubbleX + radius, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
    ctx.quadraticCurveTo(
      bubbleX + bubbleWidth,
      bubbleY,
      bubbleX + bubbleWidth,
      bubbleY + radius
    );
    ctx.lineTo(bubbleX + bubbleWidth, tailBaseY - radius);
    ctx.quadraticCurveTo(
      bubbleX + bubbleWidth,
      tailBaseY,
      bubbleX + bubbleWidth - radius,
      tailBaseY
    );
    ctx.lineTo(tailTipX + tailHalfWidth, tailBaseY);
    ctx.lineTo(tailTipX, tailTipY);
    ctx.lineTo(tailTipX - tailHalfWidth, tailBaseY);
    ctx.lineTo(bubbleX + radius, tailBaseY);
    ctx.quadraticCurveTo(bubbleX, tailBaseY, bubbleX, tailBaseY - radius);
    ctx.lineTo(bubbleX, bubbleY + radius);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
    ctx.closePath();
  };

  ctx.save();
  ctx.shadowColor = "rgba(35, 20, 68, 0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;
  traceBubblePath();
  const fillGradient = ctx.createLinearGradient(
    bubbleX,
    bubbleY,
    bubbleX,
    tailBaseY
  );
  fillGradient.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  fillGradient.addColorStop(1, "rgba(255, 223, 246, 0.96)");
  ctx.fillStyle = fillGradient;
  ctx.fill();
  ctx.restore();

  ctx.save();
  traceBubblePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2f47ff";
  ctx.stroke();
  ctx.restore();

  const innerRadius = Math.max(12, radius - 6);
  const innerX = bubbleX + 14;
  const innerY = bubbleY + 12;
  const innerWidth = Math.max(0, bubbleWidth - 28);
  const innerHeight = Math.max(0, bubbleHeight - 24);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(innerX + innerRadius, innerY);
  ctx.lineTo(innerX + innerWidth - innerRadius, innerY);
  ctx.quadraticCurveTo(
    innerX + innerWidth,
    innerY,
    innerX + innerWidth,
    innerY + innerRadius
  );
  ctx.lineTo(innerX + innerWidth, innerY + innerHeight - innerRadius);
  ctx.quadraticCurveTo(
    innerX + innerWidth,
    innerY + innerHeight,
    innerX + innerWidth - innerRadius,
    innerY + innerHeight
  );
  ctx.lineTo(innerX + innerRadius, innerY + innerHeight);
  ctx.quadraticCurveTo(innerX, innerY + innerHeight, innerX, innerY + innerHeight - innerRadius);
  ctx.lineTo(innerX, innerY + innerRadius);
  ctx.quadraticCurveTo(innerX, innerY, innerX + innerRadius, innerY);
  ctx.closePath();
  ctx.setLineDash([8, 10]);
  ctx.lineDashOffset = 4;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 188, 116, 0.55)";
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const highlightGradient = ctx.createLinearGradient(
    bubbleX,
    bubbleY,
    bubbleX,
    bubbleY + bubbleHeight * 0.6
  );
  highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.65)");
  highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  traceBubblePath();
  ctx.clip();
  ctx.fillStyle = highlightGradient;
  ctx.fillRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
  ctx.restore();

  const ascent = metrics.ascent || metrics.height * 0.75;
  const textX = bubbleX + (bubbleWidth - metrics.width) / 2;
  const textY = bubbleY + paddingY + ascent;
  ctx.fillStyle = "#2a1d4f";
  ctx.shadowColor = "rgba(255, 206, 115, 0.7)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, textX, textY);
  ctx.restore();

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

function drawArcade(cabinet, time) {
  ctx.save();
  ctx.translate(cabinet.x, cabinet.y);
  if (arcadeSprite.isReady() && arcadeSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      arcadeSprite.image,
      0,
      0,
      arcadeSprite.image.width,
      arcadeSprite.image.height,
      0,
      0,
      cabinet.width,
      cabinet.height
    );
    ctx.restore();
    return;
  }

  const glow = (Math.sin(time * 3.1) + 1) / 2;
  ctx.fillStyle = "#1a1d33";
  drawRoundedRect(0, 8, cabinet.width, cabinet.height - 8, 10);
  ctx.fillStyle = "#2c3563";
  drawRoundedRect(4, 16, cabinet.width - 8, cabinet.height - 24, 8);
  const screenHeight = Math.min(56, cabinet.height * 0.48);
  ctx.fillStyle = `rgba(110, 205, 255, ${0.3 + glow * 0.45})`;
  drawRoundedRect(12, 24, cabinet.width - 24, screenHeight, 6);
  ctx.fillStyle = "#040713";
  drawRoundedRect(14, 26, cabinet.width - 28, screenHeight - 8, 5);
  ctx.fillStyle = `rgba(255, 188, 255, ${0.4 + glow * 0.35})`;
  drawRoundedRect(cabinet.width / 2 - 18, cabinet.height - 48, 36, 18, 6);
  ctx.fillStyle = `rgba(255, 214, 126, ${0.7 + glow * 0.2})`;
  ctx.beginPath();
  ctx.arc(cabinet.width / 2 - 26, cabinet.height - 34, 6, 0, Math.PI * 2);
  ctx.arc(cabinet.width / 2 + 26, cabinet.height - 34, 6, 0, Math.PI * 2);
  ctx.fill();
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
  let levelsGained = 0;
  while (playerStats.exp >= playerStats.maxExp) {
    playerStats.exp -= playerStats.maxExp;
    playerStats.level += 1;
    const pointsEarned = getStatPointsForLevel(playerStats.level);
    playerStats.statPoints = (playerStats.statPoints ?? 0) + pointsEarned;
    playerStats.maxExp = getExpForNextLevel(playerStats.level);
    leveledUp = true;
    levelsGained += 1;
  }
  if (levelsGained > 0) {
    applyAttributeScaling(playerStats);
  }
  updateRankFromLevel();
  if (leveledUp) {
    audio.playEffect("levelUp");
  }
  ui.refresh(playerStats);
  syncMiniGameProfile();
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
  ensureMiniGameEntryPointAvailability();
  window.astrocatLobby = window.astrocatLobby ?? {};
  window.astrocatLobby.openMiniGame = openMiniGame;
  window.astrocatLobby.closeMiniGame = closeMiniGame;
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

  miniGameOrigin = computeMiniGameOrigin(miniGameEntryPoint);

  const formatRunDuration = (timeMs) => {
    const totalSeconds = Math.max(0, Math.round(timeMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  window.addEventListener("message", (event) => {
    if (!event || event.origin !== miniGameOrigin) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== "object") {
      return;
    }
    const { type, payload } = data;
    if (type === "astrocat:minigame-transmission") {
      if (
        payload &&
        window.astrocatLobby &&
        typeof window.astrocatLobby.pushTransmission === "function"
      ) {
        window.astrocatLobby.pushTransmission(payload);
      }
      return;
    }
    if (type === "astrocat:minigame-run") {
      if (!payload || typeof payload !== "object") {
        return;
      }
      const summary = { ...payload };
      const normalizedXp = Math.max(
        0,
        Math.round(Number.isFinite(summary.xpAward) ? summary.xpAward : Number(summary.xpAward) || 0)
      );
      const leveledUp = gainExperience(normalizedXp);

      const playerName =
        typeof summary.player === "string" && summary.player.trim().length
          ? summary.player.trim()
          : "Pilot";
      const formattedScore = Number.isFinite(summary.score)
        ? Math.round(summary.score).toLocaleString()
        : "0";
      const bestStreak = Number.isFinite(summary.bestStreak)
        ? Math.max(0, Math.round(summary.bestStreak))
        : 0;
      const timeMs = Number.isFinite(summary.timeMs) ? summary.timeMs : 0;
      const formattedTime =
        typeof summary.formattedTime === "string" && summary.formattedTime.length
          ? summary.formattedTime
          : formatRunDuration(timeMs);
      const xpLine = normalizedXp > 0 ? ` +${normalizedXp} XP` : "";
      let messageText = `${playerName} logged ${formattedScore} pts in ${formattedTime} (x${bestStreak} streak).${xpLine}`;
      if (leveledUp) {
        messageText += ` Level up! You reached level ${playerStats.level}.`;
      }
      showMessage(
        {
          text: messageText,
          channel: "mission",
          duration: 6400,
          animate: true,
          silent: false,
          log: true
        },
        6400
      );
    }
  });
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

function createMiniGameLoadoutPanel(initialState, options = {}) {
  const { onLoadoutsChange } = options;
  const storageAvailable = Boolean(getLocalStorage());
  let currentState = sanitizeMiniGameLoadoutsState(initialState);
  let activeSlotId =
    currentState.activeSlot &&
    getMiniGameLoadoutBySlot(currentState.slots, currentState.activeSlot)
      ? currentState.activeSlot
      : currentState.slots[0]?.slot ?? null;

  const root = document.createElement("section");
  root.className = "loadout-panel";
  if (!storageAvailable) {
    root.classList.add("is-disabled");
  }

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
    : "Storage is unavailable, so presets cannot be updated in this session.";
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

  const pilotSelect = document.createElement("select");
  pilotSelect.id = `miniGameLoadoutPilot-${idSuffix}`;
  pilotSelect.className = "loadout-panel__select";
  for (const option of miniGamePilotOptions) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.name;
    pilotSelect.append(element);
  }
  const pilotField = createField("Pilot", pilotSelect);
  form.append(pilotField);

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
  const pilotPreview = createPreviewItem("Pilot visual", "pilot");
  const weaponPreview = createPreviewItem("Weapon profile", "weapon");
  previewContainer.append(pilotPreview.root, weaponPreview.root);
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
    pilot: createSummaryRow("Pilot"),
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
    : "Loadouts cannot be saved because local storage is unavailable.";
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

      const summaryValue = summaryKey ? entry[summaryKey] ?? "" : "";
      summaryBlurb.textContent = summaryValue;
      summaryBlurb.hidden = !summaryValue;

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

  function updatePreviewDisplays(pilot, weapon) {
    applyPreview(pilotPreview, pilot, {
      fallbackName: "Select a pilot",
      altPrefix: "Pilot portrait for",
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
    equipButton.disabled = !storageAvailable || !activeLoadout || isActive;
    equipButton.textContent = isActive ? "Equipped" : "Equip this preset";
  }

  function updateSummary(loadout) {
    const pilot =
      miniGamePilotOptions.find((option) => option.id === loadout?.characterId) ??
      miniGamePilotOptions[0] ??
      null;
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

    summaryValues.pilot.textContent = pilot
      ? pilot.role
        ? `${pilot.name} — ${pilot.role}`
        : pilot.name
      : "—";
    summaryValues.pilot.title = pilot?.summary ?? "";

    summaryValues.weapon.textContent = weapon ? weapon.name : "—";
    summaryValues.weapon.title = weapon?.summary ?? "";

    summaryValues.suit.textContent = suit ? suit.name : "—";
    summaryValues.stream.textContent = stream ? stream.name : "—";

    updatePreviewDisplays(pilot, weapon);
  }

  function applyFormValues(loadout) {
    const resolved = loadout ?? getCurrentLoadout() ?? currentState.slots[0] ?? null;
    if (resolved) {
      nameInput.value = resolved.name;
      setSelectValue(pilotSelect, resolved.characterId, miniGamePilotOptions[0]?.id);
      setSelectValue(weaponSelect, resolved.weaponId, miniGameWeaponOptions[0]?.id);
      setSelectValue(suitSelect, resolved.skinId, miniGameSuitOptions[0]?.id);
      setSelectValue(streamSelect, resolved.trailId, miniGameStreamOptions[0]?.id);
    }
    if (activeSlotId) {
      slotSelect.value = activeSlotId;
    }
    updateSummary(resolved);
    updateActiveIndicators();
  }

  function persistState({ message, type } = {}) {
    const persisted = storageAvailable ? saveMiniGameLoadoutsToStorage(currentState) : false;
    if (persisted) {
      const current = getCurrentLoadout();
      const fallbackMessage = current ? `Saved ${current.name}.` : "Preset saved.";
      setStatus(message ?? fallbackMessage, type ?? "success");
    } else if (storageAvailable) {
      setStatus("Unable to save loadout. Try again.", "error");
    } else {
      setStatus(baseStatusMessage, "error");
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
    const candidate = { ...previous, ...patch };
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

  if (!storageAvailable) {
    nameInput.disabled = true;
    pilotSelect.disabled = true;
    weaponSelect.disabled = true;
    suitSelect.disabled = true;
    streamSelect.disabled = true;
    equipButton.disabled = true;
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
    if (!storageAvailable) {
      return;
    }
    if (nameUpdateTimer) {
      window.clearTimeout(nameUpdateTimer);
    }
    nameUpdateTimer = window.setTimeout(() => {
      nameUpdateTimer = 0;
      updateSlot({ name: nameInput.value });
    }, 260);
  });
  nameInput.addEventListener("blur", () => {
    if (!storageAvailable) {
      return;
    }
    if (nameUpdateTimer) {
      window.clearTimeout(nameUpdateTimer);
      nameUpdateTimer = 0;
    }
    updateSlot({ name: nameInput.value });
  });

  pilotSelect.addEventListener("change", () => {
    updateSlot({ characterId: pilotSelect.value });
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
    persistState({ message: `Equipped ${loadout.name}.`, type: "success" });
  });

  rebuildSlotOptions();
  applyFormValues(getCurrentLoadout());
  setStatus(baseStatusMessage);

  return {
    root,
    refresh(nextState) {
      currentState = sanitizeMiniGameLoadoutsState(nextState);
      activeSlotId =
        currentState.activeSlot &&
        getMiniGameLoadoutBySlot(currentState.slots, currentState.activeSlot)
          ? currentState.activeSlot
          : currentState.slots[0]?.slot ?? activeSlotId;
      rebuildSlotOptions();
      applyFormValues(getCurrentLoadout());
      setStatus(baseStatusMessage);
    },
    getState() {
      return cloneState(currentState);
    }
  };
}

function createInterface(stats, options = {}) {
  const { onRequestLogin, onRequestLogout, portalLevelRequirement = 1 } = options;
  const root = document.createElement("div");
  root.className = "game-root";

  const interfaceRoot = document.createElement("div");
  interfaceRoot.className = "lobby-shell";

  const toolbar = createToolbar();
  const toolbarContent = document.createElement("div");
  toolbarContent.className = "lobby-shell__content";
  toolbarContent.append(root);

  interfaceRoot.append(toolbar, toolbarContent);

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "canvas-wrapper";

  const canvasSurface = document.createElement("div");
  canvasSurface.className = "canvas-surface";
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

  let hudPopupSequence = 0;

  function registerHudPopup({ id, label, title: popupTitle, nodes }) {
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
    const nodesToAppend = Array.isArray(nodes) ? nodes : [nodes];
    for (const node of nodesToAppend) {
      if (node) {
        content.append(node);
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
    let previousOverflow = "";

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

      if (typeof document !== "undefined" && document.body) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
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

      if (typeof document !== "undefined" && document.body) {
        document.body.style.overflow = previousOverflow;
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

  const statsContainer = document.createElement("div");
  statsContainer.className = "stats-container";

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

  const instructions = document.createElement("ul");
  instructions.className = "instruction-list";
  const instructionItems = [
    { action: "Move", keys: "A/D or ←/→" },
    { action: "Jump", keys: "Space or W/↑" },
    { action: "Interact", keys: "E (near objects)" }
  ];
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
    instructions.append(item);
  }

  const profileSection = document.createElement("section");
  profileSection.className = "hud-panel__profile";
  profileSection.append(subtitle, accountCard, crystalsLabel, message);
  panel.insertBefore(profileSection, hudButtons);

  registerHudPopup({
    id: "hud-stats",
    label: "Stats",
    title: "Pilot Stats",
    nodes: [statsContainer, attributePanel]
  });

  registerHudPopup({
    id: "hud-loadouts",
    label: "Loadouts",
    title: "Mini Game Loadouts",
    nodes: [loadoutPanel.root]
  });

  registerHudPopup({
    id: "hud-comms",
    label: "Comms",
    title: "Comms Center",
    nodes: [commsSection]
  });

  registerHudPopup({
    id: "hud-missions",
    label: "Missions",
    title: "Mission Log",
    nodes: [missionSection]
  });

  registerHudPopup({
    id: "hud-controls",
    label: "Controls",
    title: "Pilot Controls",
    nodes: [instructions]
  });

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
    updateBar(hpBar, stats.hp, stats.maxHp);
    updateBar(mpBar, stats.mp, stats.maxMp);
    updateAttributeInterface(stats);
    updateDerivedStatsInterface(stats);
    updateStatsSummary(stats);
    syncMiniGameProfile();
  }

  updateAttributeInterface(stats);
  updateDerivedStatsInterface(stats);
  updateStatsSummary(stats);

  return {
    root: interfaceRoot,
    canvasWrapper,
    canvasSurface,
    promptText: "",
    promptEntity: null,
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
    setPrompt(text, entity) {
      this.promptText = text;
      this.promptEntity = text ? entity ?? null : null;
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

  function applyToolbarBackground(header) {
    if (!header || toolbarBackgroundImageSources.length === 0) {
      return null;
    }

    const probe = new Image();
    probe.decoding = "async";
    probe.loading = "eager";

    let sourceIndex = 0;

    const cleanup = () => {
      probe.removeEventListener("load", handleLoad);
      probe.removeEventListener("error", handleError);
    };

    const tryAttachNextSource = () => {
      if (sourceIndex >= toolbarBackgroundImageSources.length) {
        cleanup();
        return;
      }

      probe.src = toolbarBackgroundImageSources[sourceIndex++];
    };

    const handleLoad = () => {
      const resolvedUrl = probe.currentSrc || probe.src;

      if (typeof resolvedUrl === "string" && resolvedUrl) {
        const escaped = resolvedUrl.replace(/"/g, '\\"');
        header.style.setProperty(
          "--site-toolbar-background-image",
          `url("${escaped}")`
        );
        header.style.setProperty(
          "--site-toolbar-background-overlay",
          "linear-gradient(rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.4))"
        );
        header.style.setProperty("--site-toolbar-background-overlay-size", "cover");
        header.classList.add("site-toolbar--has-image-background");
      }

      cleanup();
    };

    const handleError = () => {
      if (sourceIndex >= toolbarBackgroundImageSources.length) {
        cleanup();
        return;
      }

      tryAttachNextSource();
    };

    probe.addEventListener("load", handleLoad);
    probe.addEventListener("error", handleError);
    tryAttachNextSource();

    return probe;
  }

  function attachToolbarBrandImage(brandLink) {
    if (!brandLink || toolbarBrandImageSources.length === 0) {
      return null;
    }

    const image = document.createElement("img");
    image.className = "site-toolbar__brand-image";
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.decoding = "async";
    image.loading = "eager";
    image.hidden = true;

    let sourceIndex = 0;

    const tryAttachNextSource = () => {
      if (sourceIndex >= toolbarBrandImageSources.length) {
        handleError();
        return;
      }

      image.src = toolbarBrandImageSources[sourceIndex++];
    };

    const handleLoad = () => {
      image.hidden = false;
      brandLink.classList.add("site-toolbar__brand--has-image");
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    const handleError = () => {
      if (sourceIndex >= toolbarBrandImageSources.length) {
        brandLink.classList.remove("site-toolbar__brand--has-image");
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
        image.remove();
        return;
      }

      tryAttachNextSource();
    };

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
    tryAttachNextSource();
    brandLink.prepend(image);

    return image;
  }

  function createToolbar() {
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
      starterOverride ?? findStarterCharacter(account.starterId) ?? fallbackStarter;
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
