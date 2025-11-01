const PHANTOM_INSTALL_URL = "https://phantom.app/download";

function getGlobalObject() {
  if (typeof globalThis !== "undefined") {
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

export function getPhantomProvider() {
  const globalObject = getGlobalObject();
  const solanaNamespace = globalObject?.solana;
  if (solanaNamespace?.isPhantom) {
    return solanaNamespace;
  }

  const phantomNamespace = globalObject?.phantom;
  if (phantomNamespace?.solana?.isPhantom) {
    return phantomNamespace.solana;
  }

  const providerCandidates = [];

  if (solanaNamespace) {
    const providers = Array.isArray(solanaNamespace.providers)
      ? solanaNamespace.providers
      : [];
    providerCandidates.push(...providers);
  }

  if (phantomNamespace) {
    const phantomProviders = Array.isArray(phantomNamespace.providers)
      ? phantomNamespace.providers
      : [];
    providerCandidates.push(...phantomProviders);
  }

  for (const provider of providerCandidates) {
    if (provider?.isPhantom) {
      return provider;
    }
  }

  return null;
}

export function isPhantomInstalled() {
  return Boolean(getPhantomProvider());
}

export async function connectPhantomWallet(options = {}) {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error("Phantom wallet is not available");
  }

  const request = typeof provider.connect === "function"
    ? provider.connect(options)
    : Promise.reject(new Error("Phantom provider does not support connect"));

  const response = await request;
  const publicKey = response?.publicKey?.toString?.();
  if (!publicKey) {
    throw new Error("Unable to read the Phantom wallet public key");
  }

  return { provider, publicKey };
}

export async function disconnectPhantomWallet(provider = getPhantomProvider()) {
  if (!provider || typeof provider.disconnect !== "function") {
    return;
  }
  await provider.disconnect();
}

export function attachAccountChangeListener(provider, handler) {
  if (!provider || typeof provider.on !== "function" || typeof handler !== "function") {
    return () => {};
  }
  provider.on("accountChanged", handler);
  return () => {
    if (typeof provider.removeListener === "function") {
      provider.removeListener("accountChanged", handler);
    } else if (typeof provider.off === "function") {
      provider.off("accountChanged", handler);
    }
  };
}

export function formatWalletAddress(address, { segmentLength = 4 } = {}) {
  if (typeof address !== "string" || !address) {
    return "";
  }
  const trimmed = address.trim();
  if (trimmed.length <= segmentLength * 2 + 3) {
    return trimmed;
  }
  const start = trimmed.slice(0, segmentLength);
  const end = trimmed.slice(-segmentLength);
  return `${start}…${end}`;
}

export function getPhantomInstallUrl() {
  return PHANTOM_INSTALL_URL;
}
