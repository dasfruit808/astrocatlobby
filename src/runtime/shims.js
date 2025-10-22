import { installFallbackAssetManifest } from "../asset-manifest.js";

function ensureGlobalThis() {
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
}

function resolveRuntimeGlobal() {
  if (typeof globalThis === "object") {
    return globalThis;
  }

  if (typeof window !== "undefined") {
    return window;
  }

  if (typeof self !== "undefined") {
    return self;
  }

  if (typeof global !== "undefined") {
    return global;
  }

  return {};
}

function installLegacyURL(globalObject) {
  if (typeof globalObject.URL === "function" || typeof document === "undefined") {
    return;
  }

  globalObject.URL = function legacyURL(url, base) {
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

export function installRuntimeShims() {
  ensureGlobalThis();
  const runtimeGlobal = resolveRuntimeGlobal();
  installFallbackAssetManifest(runtimeGlobal);
  installLegacyURL(runtimeGlobal);
  return runtimeGlobal;
}

export function getRuntimeGlobal() {
  ensureGlobalThis();
  return resolveRuntimeGlobal();
}
