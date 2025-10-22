// Services for managing stored Astrocat accounts and related utilities.
const legacyAccountStorageKey = "astrocat-account";
const accountStorageKey = "astrocat-accounts";
const lobbyLayoutStorageKey = "astrocat-lobby-layout-v1";
const callSignLength = 5;

const defaultAccountLevel = 1;
const maxAccountLevel = 999;
const defaultAccountExp = 0;
const maxAccountExp = Number.MAX_SAFE_INTEGER;

function isValidCallSign(value) {
  return typeof value === "string" && new RegExp(`^\\d{${callSignLength}}$`).test(value);
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
      const platforms = {};
      for (const [id, entry] of entries) {
        platforms[id] = entry;
      }
      sanitized.platforms = platforms;
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

function loadCallSignRegistry(getLocalStorage) {
  const storage = getLocalStorage();
  if (!storage) {
    return new Set();
  }

  try {
    const raw = storage.getItem("astrocat-call-signs");
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

function saveCallSignRegistry(getLocalStorage, registry) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem("astrocat-call-signs", JSON.stringify([...registry]));
    return true;
  } catch (error) {
    console.warn("Failed to persist call sign registry", error);
    return false;
  }
}

function generateCallSignCandidate(preferred, { getLocalStorage } = {}) {
  const registry = typeof getLocalStorage === "function"
    ? loadCallSignRegistry(getLocalStorage)
    : new Set();

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

  return String(Math.floor(Math.random() * 90000) + 10000);
}

function registerCallSign(callSign, { getLocalStorage } = {}) {
  if (!isValidCallSign(callSign) || typeof getLocalStorage !== "function") {
    return;
  }

  const registry = loadCallSignRegistry(getLocalStorage);
  if (registry.has(callSign)) {
    return;
  }

  registry.add(callSign);
  saveCallSignRegistry(getLocalStorage, registry);
}

function sanitizeAccount(source = {}, state = {}, context = {}) {
  const {
    defaultStarterCharacter,
    isValidStarterId,
    sanitizeAttributeValues,
    hasCustomAttributes,
    getLocalStorage
  } = context;

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
  const starterId = typeof isValidStarterId === "function" && isValidStarterId(requestedStarterId)
    ? requestedStarterId
    : defaultStarterCharacter?.id;

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

  const callSign = generateCallSignCandidate(preferredCallSign, { getLocalStorage });
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
    account.walletType = normalizedType || "solana";
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
  if (attributeSource && typeof sanitizeAttributeValues === "function") {
    const sanitizedAttributes = sanitizeAttributeValues(attributeSource);
    if (!hasCustomAttributes || hasCustomAttributes(sanitizedAttributes)) {
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

function normalizeStoredAccountPayload(payload, context) {
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
    const sanitized = sanitizeAccount(candidate, {}, context);
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
    if (accounts[requestedActive]) {
      activeCallSign = requestedActive;
    } else if (originalToSanitized.has(requestedActive)) {
      activeCallSign = originalToSanitized.get(requestedActive);
    }
  }

  if (!activeCallSign && !hasExplicitNullActive && fallbackActive && accounts[fallbackActive]) {
    activeCallSign = fallbackActive;
  }

  return { accounts, activeCallSign };
}

function buildAccountPayload(accounts, activeCallSign) {
  const keys = Object.keys(accounts).sort((a, b) => a.localeCompare(b));
  const sortedAccounts = keys.map((key) => {
    const entry = accounts[key];
    const payload = {
      handle: entry.handle,
      callSign: entry.callSign,
      catName: entry.catName,
      starterId: entry.starterId,
      level: normalizeAccountLevel(entry.level),
      exp: normalizeAccountExp(entry.exp)
    };

    if (entry.walletAddress) {
      payload.walletAddress = entry.walletAddress;
      if (entry.walletType) {
        payload.walletType = entry.walletType;
      }
    }

    if (entry.lobbyLayout) {
      payload.lobbyLayout = sanitizeLobbyLayoutSnapshot(entry.lobbyLayout);
    }

    if (entry.attributes) {
      payload.attributes = entry.attributes;
    }

    if (Number.isFinite(entry.statPoints)) {
      payload.statPoints = Math.max(0, Math.floor(entry.statPoints));
    }

    return payload;
  });

  return {
    accounts: sortedAccounts,
    activeCallSign: activeCallSign ?? null
  };
}

function persistStoredAccounts(state, context = {}) {
  const { storedAccounts, activeAccountCallSign } = state;
  const { getLocalStorage } = context;

  const storage = typeof getLocalStorage === "function" ? getLocalStorage() : null;
  if (!storage) {
    return false;
  }

  try {
    const accountKeys = Object.keys(storedAccounts);
    if (accountKeys.length === 0) {
      storage.removeItem(accountStorageKey);
      storage.removeItem(legacyAccountStorageKey);
      return true;
    }

    const payload = buildAccountPayload(storedAccounts, activeAccountCallSign);
    storage.setItem(accountStorageKey, JSON.stringify(payload));
    try {
      storage.removeItem(legacyAccountStorageKey);
    } catch (legacyError) {
      console.warn("Failed to clear legacy account storage", legacyError);
    }
    return true;
  } catch (error) {
    console.warn("Failed to persist account details", error);
    return false;
  }
}

function loadStoredAccounts(context = {}) {
  const { getLocalStorage } = context;
  const storage = typeof getLocalStorage === "function" ? getLocalStorage() : null;
  if (!storage) {
    return { storedAccounts: {}, activeAccountCallSign: null, activeAccount: null };
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
    return { storedAccounts: {}, activeAccountCallSign: null, activeAccount: null };
  }

  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch (error) {
    console.warn("Failed to parse stored account information", error);
    parsedPayload = null;
  }

  const normalized = normalizeStoredAccountPayload(parsedPayload, context);
  let { accounts: storedAccounts, activeCallSign } = normalized;

  const accountKeys = Object.keys(storedAccounts);
  if (accountKeys.length === 0) {
    persistStoredAccounts({ storedAccounts, activeAccountCallSign: activeCallSign }, context);
    return { storedAccounts: {}, activeAccountCallSign: null, activeAccount: null };
  }

  let activeAccount = activeCallSign ? storedAccounts[activeCallSign] : null;
  if (!activeAccount) {
    const fallbackKey = accountKeys[0];
    activeAccount = storedAccounts[fallbackKey];
    activeCallSign = activeAccount?.callSign ?? null;
  }

  const payload = buildAccountPayload(storedAccounts, activeCallSign);
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
    registerCallSign(entry.callSign, context);
  }

  return { storedAccounts, activeAccountCallSign: activeCallSign ?? null, activeAccount: activeAccount ?? null };
}

function normalizeWalletAddress(address) {
  if (typeof address !== "string") {
    return "";
  }
  const trimmed = address.trim();
  return trimmed ? trimmed.slice(0, 128) : "";
}

function findStoredAccountByWalletAddress(address, state) {
  const normalized = normalizeWalletAddress(address);
  if (!normalized) {
    return null;
  }

  const { storedAccounts } = state;
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

function rememberAccount(account, state, context = {}) {
  const { storedAccounts, activeAccountCallSign } = state;
  const { getLocalStorage } = context;

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

  const sanitized = sanitizeAccount(account, state, context);
  if (!sanitized) {
    return null;
  }

  const nextAccounts = { ...storedAccounts };
  const originalCallSign = extractStoredCallSign(account);
  if (originalCallSign && originalCallSign !== sanitized.callSign) {
    delete nextAccounts[originalCallSign];
  }

  const existing = nextAccounts[sanitized.callSign];
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

  nextAccounts[sanitized.callSign] = sanitized;
  registerCallSign(sanitized.callSign, { getLocalStorage });

  return {
    storedAccounts: nextAccounts,
    activeAccountCallSign: context?.setActive !== false ? sanitized.callSign : activeAccountCallSign,
    account: sanitized
  };
}

function ensureAccountForWalletAddress(address, state, context = {}) {
  const { getStatPointsForLevel, defaultStarterCharacter } = context;
  const normalized = normalizeWalletAddress(address);
  if (!normalized) {
    return null;
  }

  const existing = findStoredAccountByWalletAddress(normalized, state);
  if (existing) {
    const hydrated = {
      ...existing,
      walletAddress: normalized,
      walletType: existing.walletType || "solana"
    };
    const updatedAccounts = {
      ...state.storedAccounts,
      [hydrated.callSign]: hydrated
    };
    return {
      storedAccounts: updatedAccounts,
      account: hydrated,
      activeAccountCallSign: state.activeAccountCallSign
    };
  }

  const generatedCallSign = generateCallSignCandidate(null, context);
  const remembered = rememberAccount(
    {
      catName: createWalletDisplayName(normalized),
      callSign: generatedCallSign,
      starterId: defaultStarterCharacter?.id,
      level: 1,
      exp: 0,
      statPoints: typeof getStatPointsForLevel === "function" ? getStatPointsForLevel(1) : 0,
      walletAddress: normalized,
      walletType: "solana"
    },
    state,
    { ...context, setActive: false }
  );

  return remembered;
}

function getStoredAccountsSnapshot(state) {
  return Object.values(state.storedAccounts)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => {
      const nameCompare = a.catName.localeCompare(b.catName, undefined, { sensitivity: "base" });
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.callSign.localeCompare(b.callSign);
    });
}

function updateActiveAccountLobbyLayout(snapshot, state) {
  const { storedAccounts, activeAccountCallSign } = state;
  if (!activeAccountCallSign || !storedAccounts[activeAccountCallSign]) {
    return { storedAccounts, layout: null, changed: false };
  }

  const sanitized = sanitizeLobbyLayoutSnapshot(snapshot);
  const existingLayout = storedAccounts[activeAccountCallSign]?.lobbyLayout ?? null;
  const existingSerialized = existingLayout ? JSON.stringify(existingLayout) : null;
  const nextSerialized = sanitized ? JSON.stringify(sanitized) : null;

  if (existingSerialized === nextSerialized) {
    return { storedAccounts, layout: sanitized, changed: false };
  }

  const currentAccount = storedAccounts[activeAccountCallSign];
  if (!currentAccount) {
    return { storedAccounts, layout: sanitized, changed: false };
  }

  const nextAccounts = { ...storedAccounts };
  if (sanitized) {
    nextAccounts[activeAccountCallSign] = { ...currentAccount, lobbyLayout: sanitized };
  } else {
    const { lobbyLayout: _omit, ...rest } = currentAccount;
    nextAccounts[activeAccountCallSign] = { ...rest };
  }

  return { storedAccounts: nextAccounts, layout: sanitized, changed: true };
}

function clearStoredAccount(callSign, state, context = {}) {
  const nextAccounts = { ...state.storedAccounts };
  let nextActive = state.activeAccountCallSign;

  if (callSign) {
    if (!nextAccounts[callSign]) {
      return { storedAccounts: nextAccounts, activeAccountCallSign: nextActive };
    }
    delete nextAccounts[callSign];
    if (nextActive === callSign) {
      nextActive = Object.keys(nextAccounts)[0] ?? null;
    }
  } else {
    for (const key of Object.keys(nextAccounts)) {
      delete nextAccounts[key];
    }
    nextActive = null;
  }

  persistStoredAccounts({ storedAccounts: nextAccounts, activeAccountCallSign: nextActive }, context);

  return { storedAccounts: nextAccounts, activeAccountCallSign: nextActive };
}

function saveAccount(account, state, context = {}) {
  const remembered = rememberAccount(account, state, context);
  if (!remembered) {
    return null;
  }

  persistStoredAccounts(
    {
      storedAccounts: remembered.storedAccounts,
      activeAccountCallSign: remembered.activeAccountCallSign
    },
    context
  );

  return remembered;
}

export {
  accountStorageKey,
  callSignLength,
  clearStoredAccount,
  createWalletDisplayName,
  defaultAccountExp,
  defaultAccountLevel,
  ensureAccountForWalletAddress,
  findStoredAccountByWalletAddress,
  generateCallSignCandidate,
  getStoredAccountsSnapshot,
  isValidCallSign,
  legacyAccountStorageKey,
  loadStoredAccounts,
  lobbyLayoutStorageKey,
  maxAccountExp,
  maxAccountLevel,
  normalizeAccountExp,
  normalizeAccountLevel,
  normalizeWalletAddress,
  persistStoredAccounts,
  registerCallSign,
  rememberAccount,
  sanitizeAccount,
  sanitizeLobbyLayoutSnapshot,
  saveAccount,
  updateActiveAccountLobbyLayout
};
