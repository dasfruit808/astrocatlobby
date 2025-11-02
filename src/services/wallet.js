import {
  attachAccountChangeListener,
  connectPhantomWallet,
  disconnectPhantomWallet,
  getPhantomProvider,
  isPhantomInstalled
} from "../wallet/phantom.js";

let providerInstance = null;
let accountChangeUnsubscribe = null;
let accountChangeHandler = null;
let suppressAccountChange = false;

function cleanupWalletAccountListener() {
  if (accountChangeUnsubscribe) {
    try {
      accountChangeUnsubscribe();
    } catch (error) {
      console.warn("Failed to remove Phantom account listener", error);
    }
  }
  accountChangeUnsubscribe = null;
}

function attachWalletAccountListener(handler) {
  accountChangeHandler = typeof handler === "function" ? handler : null;
  cleanupWalletAccountListener();
  const provider = providerInstance ?? getPhantomProvider();
  if (!provider || !accountChangeHandler) {
    return null;
  }
  accountChangeUnsubscribe = attachAccountChangeListener(provider, (nextPublicKey) => {
    if (suppressAccountChange) {
      suppressAccountChange = false;
      return;
    }
    try {
      accountChangeHandler(nextPublicKey ?? null);
    } catch (error) {
      console.warn("Wallet account change handler failed", error);
    }
  });
  return accountChangeUnsubscribe;
}

async function requestWalletLogin(options = {}) {
  const provider = getPhantomProvider();
  if (!provider) {
    return { ok: false, available: false };
  }

  try {
    const { forcePrompt = false, connectOptions = null } =
      options && typeof options === "object" ? options : {};
    const resolvedConnectOptions =
      connectOptions && typeof connectOptions === "object"
        ? connectOptions
        : forcePrompt
          ? { onlyIfTrusted: false }
          : undefined;
    const { publicKey } = await connectPhantomWallet(resolvedConnectOptions);
    providerInstance = provider;
    if (accountChangeHandler) {
      attachWalletAccountListener(accountChangeHandler);
    }
    return { ok: true, available: true, provider, publicKey };
  } catch (error) {
    return { ok: false, available: true, provider, error };
  }
}

async function requestWalletDisconnect() {
  const provider = providerInstance ?? getPhantomProvider();
  suppressAccountChange = true;
  let error = null;
  try {
    if (provider) {
      await disconnectPhantomWallet(provider);
    }
  } catch (disconnectError) {
    console.warn("Failed to disconnect Phantom wallet", disconnectError);
    error = disconnectError;
  }
  cleanupWalletAccountListener();
  providerInstance = null;
  suppressAccountChange = false;
  return error ? { ok: false, error } : { ok: true };
}

function getWalletAvailability() {
  return {
    available: isPhantomInstalled(),
    connected: Boolean(providerInstance)
  };
}

export {
  attachWalletAccountListener,
  getWalletAvailability,
  requestWalletDisconnect,
  requestWalletLogin
};
