const PUBLIC_MANIFEST_KEY = "__ASTROCAT_PUBLIC_MANIFEST__";

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

  const manifest = globalThis[PUBLIC_MANIFEST_KEY];
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

  const baseNameLower = baseName.toLowerCase();
  let exactMatchEntry = null;
  let caseInsensitiveMatch = null;

  for (const key of Object.keys(manifest)) {
    if (key === normalized) {
      continue;
    }

    const normalisedKey = normalizePublicRelativePath(key);
    if (!normalisedKey) {
      continue;
    }

    const manifestSeparatorIndex = normalisedKey.lastIndexOf("/");
    const manifestBaseName =
      manifestSeparatorIndex >= 0
        ? normalisedKey.slice(manifestSeparatorIndex + 1)
        : normalisedKey;
    if (!manifestBaseName) {
      continue;
    }

    const manifestValue = manifest[key];
    if (typeof manifestValue !== "string" || !manifestValue) {
      continue;
    }

    if (manifestBaseName === baseName) {
      if (exactMatchEntry) {
        return null;
      }

      exactMatchEntry = manifestValue;
      continue;
    }

    if (manifestBaseName.toLowerCase() !== baseNameLower) {
      continue;
    }

    if (caseInsensitiveMatch) {
      return null;
    }

    caseInsensitiveMatch = manifestValue;
  }

  if (exactMatchEntry) {
    return exactMatchEntry;
  }

  return caseInsensitiveMatch;
}

function collectManifestRelativePathsByBasename(baseName) {
  const manifest = getPublicManifest();
  if (!manifest) {
    return [];
  }

  const trimmedBaseName = `${baseName ?? ""}`
    .trim()
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
  if (!trimmedBaseName) {
    return [];
  }

  const matches = [];

  for (const key of Object.keys(manifest)) {
    const normalizedKey = normalizePublicRelativePath(key);
    if (!normalizedKey) {
      continue;
    }

    const separatorIndex = normalizedKey.lastIndexOf("/");
    const manifestBaseNameWithExtension =
      separatorIndex >= 0
        ? normalizedKey.slice(separatorIndex + 1)
        : normalizedKey;
    if (!manifestBaseNameWithExtension) {
      continue;
    }

    const manifestStem = manifestBaseNameWithExtension
      .replace(/\.[^.]+$/, "")
      .toLowerCase();
    if (!manifestStem || manifestStem !== trimmedBaseName) {
      continue;
    }

    if (matches.indexOf(normalizedKey) >= 0) {
      continue;
    }

    matches.push(normalizedKey);
  }

  return matches.sort((a, b) => {
    const depthA = (a.match(/\//g) ?? []).length;
    const depthB = (b.match(/\//g) ?? []).length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.localeCompare(b);
  });
}

export function resolvePublicAssetCandidatesByBasename(
  baseName,
  fallbackRelativePaths = []
) {
  const manifestCandidates = collectManifestRelativePathsByBasename(baseName);
  const candidates = [...manifestCandidates, ...fallbackRelativePaths];
  const resolved = [];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) {
      continue;
    }

    const resolvedCandidate = resolvePublicAssetUrl(candidate);
    if (typeof resolvedCandidate !== "string" || !resolvedCandidate) {
      continue;
    }

    if (resolved.indexOf(resolvedCandidate) >= 0) {
      continue;
    }

    resolved.push(resolvedCandidate);
  }

  return resolved;
}

export function readFromAssetManifest(manifest, assetPath) {
  if (!manifest || typeof assetPath !== "string" || !assetPath) {
    return undefined;
  }

  const directMatch = manifest[assetPath];
  if (typeof directMatch === "string" && directMatch) {
    return directMatch;
  }

  const lowerCaseKey = assetPath.toLowerCase();
  if (lowerCaseKey !== assetPath) {
    const lowerMatch = manifest[lowerCaseKey];
    if (typeof lowerMatch === "string" && lowerMatch) {
      return lowerMatch;
    }
  }

  const normalizedKey = assetPath.replace(/^\.\/+/, "./");
  if (normalizedKey !== assetPath) {
    const normalizedMatch = manifest[normalizedKey];
    if (typeof normalizedMatch === "string" && normalizedMatch) {
      return normalizedMatch;
    }
  }

  const normalizedLowerKey = normalizedKey.toLowerCase();
  if (normalizedLowerKey !== normalizedKey) {
    const normalizedLowerMatch = manifest[normalizedLowerKey];
    if (typeof normalizedLowerMatch === "string" && normalizedLowerMatch) {
      return normalizedLowerMatch;
    }
  }

  return undefined;
}

export function createAssetManifestFromPublicManifest({ extensions = [] } = {}) {
  const manifest = getPublicManifest();
  if (!manifest) {
    return null;
  }

  const normalizedExtensions = extensions
    .map((extension) => `${extension ?? ""}`.trim())
    .filter((extension) => extension);
  const extensionPattern =
    normalizedExtensions.length > 0
      ? new RegExp(
          `\\.(?:${normalizedExtensions
            .map((extension) => extension.replace(/^\./, ""))
            .join("|")})$`,
          "i"
        )
      : null;

  const publicManifest = {};

  for (const [key, value] of Object.entries(manifest)) {
    if (typeof value !== "string" || !value) {
      continue;
    }

    const normalizedKey = normalizePublicRelativePath(key);
    if (!normalizedKey) {
      continue;
    }

    const separatorIndex = normalizedKey.lastIndexOf("/");
    const baseName =
      separatorIndex >= 0
        ? normalizedKey.slice(separatorIndex + 1)
        : normalizedKey;

    if (!baseName) {
      continue;
    }

    if (extensionPattern && !extensionPattern.test(baseName)) {
      continue;
    }

    const canonicalKey = `./assets/${baseName}`;
    if (!(canonicalKey in publicManifest)) {
      publicManifest[canonicalKey] = value;
    }

    const lowerCaseKey = `./assets/${baseName.toLowerCase()}`;
    if (!(lowerCaseKey in publicManifest)) {
      publicManifest[lowerCaseKey] = value;
    }
  }

  return Object.keys(publicManifest).length > 0 ? publicManifest : null;
}

function guessVideoMimeType(url) {
  if (typeof url !== "string") {
    return "";
  }

  const trimmed = url.split(/[?#]/)[0] ?? "";
  const extensionMatch = trimmed.match(/\.([^.]+)$/);
  if (!extensionMatch) {
    return "";
  }

  const extension = extensionMatch[1].toLowerCase();
  if (!extension) {
    return "";
  }

  switch (extension) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "ogg":
    case "ogv":
      return "video/ogg";
    default:
      return "";
  }
}

export function initializeCanvasBackgroundVideo(videoElement, container, sources = []) {
  if (!videoElement || !container) {
    return;
  }

  const sourceList = Array.isArray(sources) ? sources : [];
  const uniqueSources = [];
  for (const candidate of sourceList) {
    const normalized = typeof candidate === "string" ? candidate.trim() : "";
    if (!normalized || uniqueSources.indexOf(normalized) >= 0) {
      continue;
    }
    uniqueSources.push(normalized);
  }

  videoElement.innerHTML = "";
  videoElement.removeAttribute("src");

  if (uniqueSources.length === 0) {
    container.dataset.state = "disabled";
    container.classList.remove("is-active");
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.dataset.state = "loading";
  container.classList.remove("is-active");

  if (typeof videoElement.setAttribute === "function") {
    videoElement.setAttribute("playsinline", "");
    videoElement.setAttribute("muted", "");
    videoElement.setAttribute("loop", "");
    videoElement.setAttribute("preload", "auto");
    videoElement.setAttribute("autoplay", "");
  }

  try {
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.loop = true;
    videoElement.preload = "auto";
    videoElement.autoplay = true;
    if (typeof videoElement.disablePictureInPicture === "boolean") {
      videoElement.disablePictureInPicture = true;
    }
  } catch (error) {
    // Ignore property assignment errors from older browsers.
  }

  for (const source of uniqueSources) {
    const sourceElement = document.createElement("source");
    sourceElement.src = source;
    const mimeType = guessVideoMimeType(source);
    if (mimeType) {
      sourceElement.type = mimeType;
    }
    videoElement.append(sourceElement);
  }

  const markActive = () => {
    container.dataset.state = "active";
    container.classList.add("is-active");
    container.hidden = false;
  };

  const markError = () => {
    container.dataset.state = "error";
    container.classList.remove("is-active");
    container.hidden = true;
  };

  videoElement.addEventListener("loadeddata", markActive, { once: true });
  videoElement.addEventListener("error", markError);

  const attemptPlayback = () => {
    try {
      const playPromise = videoElement.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Autoplay can be blocked until the user interacts. We'll retry on interaction.
        });
      }
    } catch (error) {
      // Ignore playback errors triggered by autoplay policies.
    }
  };

  const handleFirstInteraction = () => {
    attemptPlayback();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", handleFirstInteraction, { once: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true });
  }

  videoElement.load();
  attemptPlayback();
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

export function normaliseHrefForDirectory(baseHref) {
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

export function normalisePathnameForDirectory(pathname) {
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

function getLocationProtocol() {
  if (typeof window !== "undefined" && window.location) {
    const { protocol } = window.location;
    if (typeof protocol === "string" && protocol) {
      return protocol;
    }
  }

  if (typeof globalThis !== "undefined" && globalThis.location) {
    const { protocol } = globalThis.location;
    if (typeof protocol === "string" && protocol) {
      return protocol;
    }
  }

  return "";
}

export function resolvePublicAssetUrl(relativePath) {
  const normalized = normalizePublicRelativePath(relativePath);
  if (!normalized) {
    return null;
  }

  const publicPrefix = "public/";
  const hasPublicPrefix = normalized.startsWith(publicPrefix);
  const normalizedWithoutPublic = hasPublicPrefix
    ? normalizePublicRelativePath(normalized.slice(publicPrefix.length))
    : normalized;

  let manifestEntry = readPublicManifestEntry(normalized);
  if (!manifestEntry) {
    manifestEntry = tryFindPublicManifestEntryByBasename(normalized);
  }
  if (!manifestEntry && hasPublicPrefix) {
    manifestEntry = readPublicManifestEntry(normalizedWithoutPublic);
    if (!manifestEntry) {
      manifestEntry = tryFindPublicManifestEntryByBasename(normalizedWithoutPublic);
    }
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

  let candidate = normalized;

  if (hasPublicPrefix && normalizedWithoutPublic) {
    const protocol = getLocationProtocol();
    if (protocol.toLowerCase() !== "file:") {
      candidate = normalizedWithoutPublic;
    }
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate) || candidate.startsWith("//")) {
    return candidate;
  }

  if (candidate.startsWith("./") || candidate.startsWith("../")) {
    return candidate;
  }

  if (typeof window !== "undefined" && window.location?.protocol === "file:") {
    const resolvedFromDocument = resolveUsingDocumentBase(candidate);
    if (resolvedFromDocument) {
      return resolvedFromDocument;
    }

    return candidate.startsWith("./") || candidate.startsWith("../")
      ? candidate
      : `./${candidate}`;
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

  const resolvedFromDocument = resolveUsingDocumentBase(candidate);
  if (resolvedFromDocument) {
    return resolvedFromDocument;
  }

  const ensureDocumentRelative = (value) => {
    if (
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../")
    ) {
      return value;
    }

    return `./${value}`;
  };

  if (typeof window !== "undefined" && window.location) {
    const { location } = window;

    if (location.protocol === "file:") {
      const resolvedFromDocument = resolveUsingDocumentBase(candidate);
      if (resolvedFromDocument) {
        return resolvedFromDocument;
      }

      return ensureDocumentRelative(candidate);
    }

    if (typeof location.pathname === "string") {
      const directoryPath = normalisePathnameForDirectory(location.pathname);
      if (directoryPath && directoryPath !== "/") {
        const trimmedCandidate = candidate.replace(/^\/+/, "");
        if (!trimmedCandidate) {
          return ensureDocumentRelative(candidate);
        }

        return `${directoryPath}${trimmedCandidate}`;
      }
    }
  }

  return ensureDocumentRelative(candidate);
}

const backgroundImageUrl = new URL("../assets/LobbyBackground.png", import.meta.url).href;
const parallaxStarsUrl = new URL("../assets/ParallaxStars.svg", import.meta.url).href;
const parallaxNebulaUrl = new URL("../assets/ParallaxNebula.svg", import.meta.url).href;
const parallaxPlanetsUrl = new URL("../assets/ParallaxPlanets.svg", import.meta.url).href;
const toolbarBackgroundFallbackUrl = new URL("../assets/ParallaxNebula.svg", import.meta.url).href;

export const parallaxLayerSources = [
  {
    source: parallaxStarsUrl,
    speed: 0.12,
    opacity: 0.85,
    align: "center"
  },
  {
    source: parallaxNebulaUrl,
    speed: 0.2,
    opacity: 0.7,
    align: "center",
    offsetY: -80
  },
  {
    source: parallaxPlanetsUrl,
    speed: 0.32,
    opacity: 0.9,
    align: "center",
    offsetY: -36
  },
  {
    source: backgroundImageUrl,
    speed: 0.46,
    opacity: 1,
    align: "center"
  }
];

const backgroundVideoSourceCandidates = resolvePublicAssetCandidatesByBasename(
  "lobby-background-video",
  [
    "AstroCats3/lobby-background.mp4",
    "AstroCats3/lobby-background.webm",
    "lobby-background.mp4",
    "lobby-background.webm"
  ]
);

const backgroundVideoFallbackUrl =
  backgroundVideoSourceCandidates.length > 0
    ? null
    : "https://cdn.coverr.co/videos/coverr-star-trails-1655739804764?download=1";

export const backgroundVideoSources = (
  backgroundVideoFallbackUrl
    ? [...backgroundVideoSourceCandidates, backgroundVideoFallbackUrl]
    : backgroundVideoSourceCandidates
).filter((candidate, index, all) => {
  if (typeof candidate !== "string" || !candidate) {
    return false;
  }
  return all.indexOf(candidate) === index;
});

const customPageBackgroundSources = resolvePublicAssetCandidatesByBasename(
  "webpagebackground",
  [
    "webpagebackground.png",
    "webpagebackground.jpg",
    "webpagebackground.jpeg",
    "webpagebackground.webp",
    "webpagebackground.avif",
    "webpagebackground.gif"
  ]
);

let customPageBackgroundUrl =
  customPageBackgroundSources.length > 0 ? customPageBackgroundSources[0] : null;
let customBackgroundAvailabilityProbe = null;

export function shouldUseCustomPageBackground() {
  if (customPageBackgroundSources.length === 0) {
    return Promise.resolve(false);
  }

  if (customBackgroundAvailabilityProbe) {
    return customBackgroundAvailabilityProbe;
  }

  if (typeof fetch !== "function") {
    customPageBackgroundUrl = customPageBackgroundSources[0] ?? null;
    customBackgroundAvailabilityProbe = Promise.resolve(!!customPageBackgroundUrl);
    return customBackgroundAvailabilityProbe;
  }

  let sourceIndex = 0;

  const probeNext = () => {
    if (sourceIndex >= customPageBackgroundSources.length) {
      return Promise.resolve(false);
    }

    const candidate = customPageBackgroundSources[sourceIndex++];

    return fetch(candidate, {
      method: "HEAD",
      cache: "no-store"
    })
      .then((response) => {
        if (!response) {
          customPageBackgroundUrl = candidate;
          return true;
        }

        if (response?.ok) {
          const contentType = response.headers.get("content-type");
          if (!contentType || contentType.toLowerCase().startsWith("image/")) {
            customPageBackgroundUrl = candidate;
            return true;
          }

          return probeNext();
        }

        if (response.status === 405 || response.status === 501) {
          customPageBackgroundUrl = candidate;
          return true;
        }

        return probeNext();
      })
      .catch((error) => {
        if (typeof console !== "undefined" && error) {
          console.warn(
            "Falling back to loading custom page background after HEAD probe failed.",
            error
          );
        }

        customPageBackgroundUrl = candidate;
        return true;
      });
  };

  customBackgroundAvailabilityProbe = probeNext().then((shouldApply) => {
    if (!shouldApply) {
      customPageBackgroundUrl = null;
    }
    return shouldApply;
  });

  return customBackgroundAvailabilityProbe;
}

export function getCustomPageBackgroundUrl() {
  return customPageBackgroundUrl;
}

export function applyPageBackgroundFromUrl(body, imageUrl) {
  if (!body) {
    return;
  }

  const root = body.ownerDocument?.documentElement ?? null;
  const targets = root && root !== body ? [body, root] : [body];

  const resetTarget = (element) => {
    element.classList.remove("has-custom-background");
    element.style.removeProperty("--page-background-overlay");
  };

  if (typeof imageUrl !== "string" || !imageUrl) {
    targets.forEach(resetTarget);
    return;
  }

  const escapedUrl = imageUrl.replace(/"/g, '\\"');
  for (const element of targets) {
    element.classList.add("has-custom-background");
    element.style.setProperty("--page-background-overlay", `url("${escapedUrl}")`);
  }
}

const toolbarBackgroundImageSources = [
  ...resolvePublicAssetCandidatesByBasename("toolbar-background", [
    "toolbar-background.png",
    "toolbar-background.svg",
    "AstroCats3/toolbar-background.png",
    "AstroCats3/toolbar-background.svg"
  ]),
  toolbarBackgroundFallbackUrl
].filter((candidate, index, all) => {
  if (typeof candidate !== "string" || !candidate) {
    return false;
  }

  return all.indexOf(candidate) === index;
});

const toolbarBrandFallbackSvg =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20120%2032%27%3E%3Crect%20width%3D%27120%27%20height%3D%2732%27%20rx%3D%276%27%20fill%3D%27%231a1a28%27/%3E%3Crect%20x%3D%274%27%20y%3D%276%27%20width%3D%2720%27%20height%3D%2720%27%20rx%3D%274%27%20fill%3D%27%237f5af0%27/%3E%3Cpath%20fill%3D%27%23f5deb3%27%20d%3D%27M12%2011h4l2%205-2%205h-4l-2-5z%27/%3E%3Ctext%20x%3D%2744%27%20y%3D%2721%27%20font-family%3D%22%27Segoe%20UI%27%2Csans-serif%22%20font-size%3D%2716%27%20fill%3D%27%23f5deb3%27%3EAstrocat%3C/text%3E%3C/svg%3E";

const toolbarBrandImageSources = [
  ...resolvePublicAssetCandidatesByBasename("toolbar-brand", [
    "toolbar-brand.svg",
    "toolbar-brand.png",
    "AstroCats3/toolbar-brand.svg",
    "AstroCats3/toolbar-brand.png"
  ]),
  toolbarBrandFallbackSvg
].filter((candidate, index, all) => {
  if (typeof candidate !== "string" || !candidate) {
    return false;
  }

  return all.indexOf(candidate) === index;
});

export function applyToolbarBackground(header) {
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
      header.style.setProperty("--site-toolbar-background-image", `url("${escaped}")`);
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

export function attachToolbarBrandImage(brandLink) {
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

export { backgroundImageUrl };
