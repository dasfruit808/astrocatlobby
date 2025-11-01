export function createWalletToolbarSection({
  onConnect,
  onDisconnect,
  onOpenInstall,
  formatAddress
} = {}) {
  if (typeof document === "undefined") {
    throw new Error("createWalletToolbarSection requires a document environment");
  }

  const template = document.createElement("template");
  template.innerHTML = `
    <div class="site-toolbar__wallet" data-state="missing">
      <span class="wallet-status__label">Solana Wallet</span>
      <div class="wallet-status__row">
        <span class="wallet-status__call-sign" data-role="call-sign" hidden></span>
        <span class="wallet-status__address" data-role="address">Install Phantom to connect.</span>
      </div>
      <button type="button" class="wallet-status__action" data-role="action">Connect Phantom Wallet</button>
    </div>
  `.trim();

  const root = template.content.firstElementChild;
  if (!root) {
    throw new Error("Failed to create wallet toolbar section");
  }

  const callSignBadge = root.querySelector('[data-role="call-sign"]');
  const addressText = root.querySelector('[data-role="address"]');
  const actionButton = root.querySelector('[data-role="action"]');

  const formatWalletAddress = typeof formatAddress === "function" ? formatAddress : (value) => value;

  const openInstallPage = () => {
    if (typeof onOpenInstall === "function") {
      onOpenInstall();
    }
  };

  const update = (nextState = {}) => {
    const state = {
      available: false,
      connected: false,
      callSign: null,
      address: null,
      ...nextState
    };

    root.dataset.state = state.available ? (state.connected ? "connected" : "ready") : "missing";

    if (callSignBadge) {
      if (state.connected && state.callSign) {
        callSignBadge.hidden = false;
        callSignBadge.textContent = `@${state.callSign}`;
      } else {
        callSignBadge.hidden = true;
        callSignBadge.textContent = "";
      }
    }

    if (!addressText || !actionButton) {
      return;
    }

    if (!state.available) {
      addressText.textContent = "Install Phantom to connect.";
      actionButton.textContent = "Install Phantom Wallet";
      actionButton.disabled = false;
      actionButton.onclick = openInstallPage;
      return;
    }

    if (!state.connected) {
      addressText.textContent = "Connect your Phantom wallet to reveal the toolbar.";
      actionButton.textContent = "Connect Phantom Wallet";
      actionButton.disabled = typeof onConnect !== "function";
      actionButton.onclick = () => {
        if (typeof onConnect === "function") {
          onConnect();
        }
      };
      return;
    }

    addressText.textContent = state.address ? formatWalletAddress(state.address) : "Connected";
    actionButton.textContent = "Disconnect";
    actionButton.disabled = typeof onDisconnect !== "function";
    actionButton.onclick = () => {
      if (typeof onDisconnect === "function") {
        onDisconnect();
      }
    };
  };

  update();

  return {
    root,
    setState: update
  };
}
