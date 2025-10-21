function tryCreateModuleAssetUrl(relativePath) {
  if (typeof relativePath !== "string" || !relativePath) {
    return null;
  }

  try {
    return new URL(relativePath, import.meta.url).href;
  } catch (error) {
    return null;
  }
}

function createFallbackManifest() {
  const manifest = {};

  const add = (key, value) => {
    if (typeof key !== "string" || !key) {
      return;
    }
    if (typeof value !== "string" || !value) {
      return;
    }
    manifest[key] = value;
  };

  const moduleAsset = (relativePath) => tryCreateModuleAssetUrl(relativePath);
  const absoluteAsset = (absolutePath) => {
    if (typeof absolutePath !== "string") {
      return null;
    }
    const trimmed = absolutePath.trim();
    return trimmed ? trimmed : null;
  };

  const spriteEntries = [
    ["assets/ArcadeSprite.png", "./assets/ArcadeSprite.png"],
    ["assets/GuideSprite.png", "./assets/GuideSprite.png"],
    ["assets/LobbyBackground.png", "./assets/LobbyBackground.png"],
    ["assets/MascotSprite.png", "./assets/MascotSprite.png"],
    ["assets/ParallaxNebula.svg", "./assets/ParallaxNebula.svg"],
    ["assets/ParallaxPlanets.svg", "./assets/ParallaxPlanets.svg"],
    ["assets/ParallaxStars.svg", "./assets/ParallaxStars.svg"],
    ["assets/character1.png", "./assets/character1.png"],
    ["assets/characrter2.png", "./assets/characrter2.png"],
    ["assets/character3.png", "./assets/character3.png"],
    ["assets/playersprite1.png", "./assets/playersprite1.png"],
    ["assets/playersprite2.png", "./assets/playersprite2.png"],
    ["assets/playersprite3.png", "./assets/playersprite3.png"]
  ];

  for (const [key, relativePath] of spriteEntries) {
    add(key, moduleAsset(relativePath));
  }

  const toolbarFallback = moduleAsset("./assets/ParallaxNebula.svg");
  add("toolbar-background.png", toolbarFallback);
  add("AstroCats3/toolbar-background.png", toolbarFallback);

  const toolbarBrand = absoluteAsset("/AstroCats3/toolbar-brand.png");
  add("toolbar-brand.png", toolbarBrand);
  add("AstroCats3/toolbar-brand.png", toolbarBrand);

  const pageBackground = absoluteAsset("/webpagebackground.png");
  add("webpagebackground.png", pageBackground);
  add("webpagebackground.jpg", pageBackground);
  add("webpagebackground.jpeg", pageBackground);
  add("webpagebackground.webp", pageBackground);
  add("webpagebackground.avif", pageBackground);
  add("webpagebackground.gif", pageBackground);

  add("lobby-background.mp4", absoluteAsset("/lobby-background.mp4"));

  return Object.freeze(manifest);
}

function isUsableManifestEntry(value) {
  return typeof value === "string" && value.length > 0;
}

const FALLBACK_MANIFEST = createFallbackManifest();

export function installFallbackAssetManifest(
  globalObject = typeof globalThis !== "undefined" ? globalThis : window
) {
  if (!globalObject) {
    return {};
  }

  const existing = globalObject.__ASTROCAT_PUBLIC_MANIFEST__;
  if (existing && typeof existing === "object") {
    let mutated = false;
    for (const [key, value] of Object.entries(FALLBACK_MANIFEST)) {
      if (!isUsableManifestEntry(value)) {
        continue;
      }
      const current = existing[key];
      if (!isUsableManifestEntry(current)) {
        existing[key] = value;
        mutated = true;
      }
    }
    return mutated ? existing : existing;
  }

  const manifest = {};
  for (const [key, value] of Object.entries(FALLBACK_MANIFEST)) {
    if (isUsableManifestEntry(value)) {
      manifest[key] = value;
    }
  }
  globalObject.__ASTROCAT_PUBLIC_MANIFEST__ = manifest;
  return manifest;
}
