const DEFAULT_RPC_ENDPOINT = "https://api.devnet.solana.com";
const DEFAULT_COMMITMENT = "confirmed";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const MEMO_PREFIX = "ASTROCAT_ACCOUNTS_V1|";

let connectionInstance = null;
let connectionEndpoint = DEFAULT_RPC_ENDPOINT;
let walletProvider = null;
let walletPublicKey = null;
let pendingPayload = null;
let pendingOptions = null;
let pendingTimeout = null;
let inFlight = false;
let lastSerializedPayload = null;

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

function getSolanaWeb3() {
  const globalObject = getGlobalObject();
  return globalObject?.solanaWeb3 ?? null;
}

function hasSolanaWeb3() {
  return Boolean(getSolanaWeb3());
}

function toUint8Array(value) {
  if (typeof value === "string") {
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(value);
    }
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(value, "utf8"));
    }
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      bytes[index] = value.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  return new Uint8Array();
}

function base64Encode(text) {
  if (typeof text !== "string") {
    return "";
  }
  if (typeof btoa === "function") {
    const bytes = toUint8Array(text);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64");
  }
  throw new Error("Base64 encoding is not supported in this environment");
}

function base64Decode(text) {
  if (typeof text !== "string" || !text) {
    return "";
  }
  let binary;
  if (typeof atob === "function") {
    binary = atob(text);
  } else if (typeof Buffer !== "undefined") {
    binary = Buffer.from(text, "base64").toString("binary");
  } else {
    throw new Error("Base64 decoding is not supported in this environment");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (typeof TextDecoder === "function") {
    return new TextDecoder().decode(bytes);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("utf8");
  }

  let textDecoder = "";
  for (const byte of bytes) {
    textDecoder += String.fromCharCode(byte);
  }
  return textDecoder;
}

function encodePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return base64Encode(JSON.stringify(payload));
}

function decodePayload(encoded) {
  if (typeof encoded !== "string" || !encoded) {
    return null;
  }
  const json = base64Decode(encoded);
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Failed to parse on-chain payload", error);
    return null;
  }
}

function ensureConnection(endpoint = connectionEndpoint) {
  if (!hasSolanaWeb3()) {
    return null;
  }

  const web3 = getSolanaWeb3();
  if (!web3) {
    return null;
  }

  if (!connectionInstance || connectionEndpoint !== endpoint) {
    connectionEndpoint = endpoint ?? DEFAULT_RPC_ENDPOINT;
    try {
      connectionInstance = new web3.Connection(connectionEndpoint, DEFAULT_COMMITMENT);
    } catch (error) {
      console.warn("Failed to create Solana connection", error);
      connectionInstance = null;
    }
  }

  return connectionInstance;
}

function setLedgerRpcEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint) {
    connectionEndpoint = DEFAULT_RPC_ENDPOINT;
  } else {
    connectionEndpoint = endpoint;
  }
  connectionInstance = null;
}

function setLedgerWalletContext(context = {}) {
  if (context && typeof context === "object") {
    if (context.provider) {
      walletProvider = context.provider;
    }
    if (context.publicKey) {
      walletPublicKey = context.publicKey;
    }
    if (context.endpoint) {
      setLedgerRpcEndpoint(context.endpoint);
    }
  }

  if (pendingPayload && !pendingTimeout) {
    pendingTimeout = setTimeout(() => {
      flushPendingAccountSnapshot().catch(() => {});
    }, 200);
  }
}

function clearLedgerWalletContext() {
  walletProvider = null;
  walletPublicKey = null;
}

async function publishAccountSnapshot(payload, options = {}) {
  if (!hasSolanaWeb3()) {
    throw new Error("Solana Web3 library is unavailable");
  }

  const web3 = getSolanaWeb3();
  const provider = options.provider ?? walletProvider;
  let publicKey = options.publicKey ?? walletPublicKey;

  if (!provider || !publicKey) {
    throw new Error("Wallet provider or public key is missing");
  }

  if (typeof publicKey === "string") {
    try {
      publicKey = new web3.PublicKey(publicKey);
    } catch (error) {
      throw new Error("Invalid wallet public key provided");
    }
  }

  const connection = ensureConnection(options.endpoint ?? connectionEndpoint);
  if (!connection) {
    throw new Error("Unable to establish Solana RPC connection");
  }

  const memoPayload = encodePayload(payload);
  const memoText = `${MEMO_PREFIX}${memoPayload}`;
  const latestBlockhash = await connection.getLatestBlockhash(DEFAULT_COMMITMENT);
  const transaction = new web3.Transaction({
    recentBlockhash: latestBlockhash.blockhash,
    feePayer: publicKey
  });

  const memoInstruction = new web3.TransactionInstruction({
    programId: new web3.PublicKey(MEMO_PROGRAM_ID),
    keys: [],
    data: toUint8Array(memoText)
  });

  transaction.add(memoInstruction);

  let signature = null;
  if (typeof provider.signAndSendTransaction === "function") {
    const response = await provider.signAndSendTransaction(transaction);
    signature = typeof response === "string" ? response : response?.signature ?? null;
  } else if (typeof provider.signTransaction === "function") {
    const signed = await provider.signTransaction(transaction);
    const raw = signed.serialize();
    signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
  } else if (typeof provider.request === "function") {
    const serialized = transaction.serialize({ requireAllSignatures: false });
    const base64 = typeof Buffer !== "undefined"
      ? Buffer.from(serialized).toString("base64")
      : btoa(String.fromCharCode(...serialized));
    const response = await provider.request({
      method: "signAndSendTransaction",
      params: { message: base64 }
    });
    signature = typeof response === "string" ? response : response?.signature ?? null;
  } else {
    throw new Error("Wallet provider does not support transaction signing");
  }

  if (signature) {
    try {
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        },
        DEFAULT_COMMITMENT
      );
    } catch (error) {
      console.warn("Failed to confirm on-chain account snapshot", error);
    }
  }

  return signature;
}

async function flushPendingAccountSnapshot() {
  if (!pendingPayload || inFlight) {
    return null;
  }
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }

  if (!walletProvider || !walletPublicKey || !hasSolanaWeb3()) {
    return null;
  }

  const serialized = JSON.stringify(pendingPayload);
  if (serialized === lastSerializedPayload) {
    pendingPayload = null;
    pendingOptions = null;
    return null;
  }

  inFlight = true;
  const payload = pendingPayload;
  const options = pendingOptions ?? {};

  try {
    const signature = await publishAccountSnapshot(payload, options);
    lastSerializedPayload = serialized;
    pendingPayload = null;
    pendingOptions = null;
    return signature ?? null;
  } catch (error) {
    console.warn("Failed to publish on-chain account snapshot", error);
    throw error;
  } finally {
    inFlight = false;
  }
}

function queueAccountSnapshot(payload, options = {}) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  pendingPayload = payload;
  pendingOptions = options && typeof options === "object" ? { ...options } : {};

  if (pendingOptions.provider) {
    walletProvider = pendingOptions.provider;
  }
  if (pendingOptions.publicKey) {
    walletPublicKey = pendingOptions.publicKey;
  }
  if (pendingOptions.endpoint) {
    setLedgerRpcEndpoint(pendingOptions.endpoint);
  }

  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
  }

  pendingTimeout = setTimeout(() => {
    flushPendingAccountSnapshot().catch(() => {});
  }, typeof pendingOptions.delay === "number" && pendingOptions.delay >= 0 ? pendingOptions.delay : 1200);
}

async function fetchLatestAccountSnapshot(address, options = {}) {
  if (!address || !hasSolanaWeb3()) {
    return null;
  }

  const web3 = getSolanaWeb3();
  let publicKey;
  try {
    publicKey = new web3.PublicKey(address);
  } catch (error) {
    console.warn("Invalid wallet address provided for on-chain lookup", error);
    return null;
  }

  const connection = ensureConnection(options.endpoint ?? connectionEndpoint);
  if (!connection) {
    return null;
  }

  try {
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: typeof options.limit === "number" ? options.limit : 25
    });

    if (!Array.isArray(signatures) || signatures.length === 0) {
      return null;
    }

    const parsedTransactions = await connection.getParsedTransactions(
      signatures.map((entry) => entry.signature),
      {
        commitment: DEFAULT_COMMITMENT,
        maxSupportedTransactionVersion: 0
      }
    );

    for (const transaction of parsedTransactions) {
      if (!transaction) {
        continue;
      }
      const instructions = transaction.transaction?.message?.instructions ?? [];
      for (const instruction of instructions) {
        const memo = instruction?.parsed?.info?.memo ?? null;
        if (typeof memo !== "string" || !memo.startsWith(MEMO_PREFIX)) {
          continue;
        }
        const encoded = memo.slice(MEMO_PREFIX.length);
        const decoded = decodePayload(encoded);
        if (decoded) {
          return decoded;
        }
      }
    }
  } catch (error) {
    console.warn("Failed to fetch on-chain account snapshot", error);
  }

  return null;
}

export {
  clearLedgerWalletContext,
  fetchLatestAccountSnapshot,
  flushPendingAccountSnapshot,
  queueAccountSnapshot,
  setLedgerRpcEndpoint,
  setLedgerWalletContext
};
