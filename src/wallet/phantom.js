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

const availabilitySubscribers = new Set();
let availabilityListenersInitialised = false;
let lastKnownAvailability = null;

function notifyAvailabilityChange(provider) {
  if (availabilitySubscribers.size === 0) {
    return;
  }

  const payload = {
    available: Boolean(provider),
    provider,
  };

  for (const subscriber of availabilitySubscribers) {
    try {
      subscriber(payload);
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("Phantom availability subscriber failed", error);
      }
    }
  }
}

function evaluateAvailability() {
  const provider = getPhantomProvider();
  const isAvailable = Boolean(provider);

  if (isAvailable !== lastKnownAvailability) {
    lastKnownAvailability = isAvailable;
    notifyAvailabilityChange(provider);
  }

  return provider;
}

function scheduleAvailabilityEvaluation(delay) {
  if (typeof setTimeout !== "function") {
    return;
  }
  setTimeout(() => {
    evaluateAvailability();
  }, delay);
}

function initialiseAvailabilityListeners() {
  if (availabilityListenersInitialised) {
    return;
  }
  availabilityListenersInitialised = true;

  const globalObject = getGlobalObject();
  const handleEvent = () => {
    evaluateAvailability();
  };

  const addGlobalListener = (target, eventName) => {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }
    target.addEventListener(eventName, handleEvent, { passive: true });
  };

  addGlobalListener(globalObject, "phantom#initialized");
  addGlobalListener(globalObject, "fantom#initialized");
  addGlobalListener(globalObject, "load");

  const documentObject = globalObject?.document;
  addGlobalListener(documentObject, "DOMContentLoaded");
  addGlobalListener(documentObject, "visibilitychange");

  // Attempt a few quick checks in case Phantom injects without emitting events.
  evaluateAvailability();
  scheduleAvailabilityEvaluation(50);
  scheduleAvailabilityEvaluation(250);
  scheduleAvailabilityEvaluation(1000);
}

export function getPhantomProvider() {
  const globalObject = getGlobalObject();
  const solanaNamespace = globalObject?.solana;
  if (solanaNamespace?.isPhantom || solanaNamespace?.isFantom) {
    return solanaNamespace;
  }

  const phantomNamespace = globalObject?.phantom;
  if (
    phantomNamespace?.solana?.isPhantom ||
    phantomNamespace?.solana?.isFantom
  ) {
    return phantomNamespace.solana;
  }

  const fantomNamespace = globalObject?.fantom;
  if (
    fantomNamespace?.solana?.isPhantom ||
    fantomNamespace?.solana?.isFantom
  ) {
    return fantomNamespace.solana;
  }

  const providerCandidates = [];

  if (solanaNamespace) {
    const providers = Array.isArray(solanaNamespace.providers)
      ? solanaNamespace.providers
      : [];
    providerCandidates.push(solanaNamespace, ...providers);
  }

  if (phantomNamespace) {
    const phantomProviders = Array.isArray(phantomNamespace.providers)
      ? phantomNamespace.providers
      : [];
    providerCandidates.push(...phantomProviders);
  }

  if (fantomNamespace) {
    const fantomProviders = Array.isArray(fantomNamespace.providers)
      ? fantomNamespace.providers
      : [];
    providerCandidates.push(...fantomProviders);
  }

  for (const provider of providerCandidates) {
    if (provider?.isPhantom || provider?.isFantom) {
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

export function subscribeToPhantomAvailability(listener, options = {}) {
  if (typeof listener !== "function") {
    return () => {};
  }

  initialiseAvailabilityListeners();

  const emitCurrentState = options.emitCurrent !== false;

  const wrappedListener = ({ available, provider }) => {
    listener({ available, provider });
  };

  const provider = getPhantomProvider();
  const available = Boolean(provider);

  if (lastKnownAvailability === null) {
    lastKnownAvailability = available;
  }

  if (emitCurrentState) {
    try {
      listener({ available, provider });
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("Phantom availability listener failed", error);
      }
    }
  }

  availabilitySubscribers.add(wrappedListener);

  evaluateAvailability();

  return () => {
    availabilitySubscribers.delete(wrappedListener);
  };
}
