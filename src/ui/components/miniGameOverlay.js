export function createMiniGameOverlay({
  entryPoint = "",
  title = "Starcade Console",
  description = "The cabinet spins up the AstroCats3 mini game in an in-universe console.",
  supportLinkLabel = "Open the mini game in a new tab",
  supportPrefix = "Trouble loading? ",
  onCloseRequest,
  onFrameLoad,
  onFrameError
} = {}) {
  if (typeof document === "undefined") {
    throw new Error("createMiniGameOverlay requires a document environment");
  }

  const template = document.createElement("template");
  template.innerHTML = `
    <div class="minigame-overlay" role="dialog" aria-modal="true" aria-label="AstroCats mini game console">
      <div class="minigame-modal">
        <div class="minigame-header">
          <h2 class="minigame-title" data-role="title"></h2>
          <button type="button" class="minigame-close" data-role="close">Back to lobby</button>
        </div>
        <p class="minigame-description" data-role="description"></p>
        <iframe class="minigame-frame" title="AstroCats mini game" loading="lazy" allow="fullscreen; gamepad *; xr-spatial-tracking" data-role="frame"></iframe>
        <p class="minigame-support" data-role="support">
          <span data-role="support-prefix"></span><a data-role="support-link" target="_blank" rel="noopener noreferrer"></a>.
        </p>
      </div>
    </div>
  `.trim();

  const root = template.content.firstElementChild;
  if (!root) {
    throw new Error("Failed to create mini game overlay");
  }

  const titleElement = root.querySelector('[data-role="title"]');
  if (titleElement) {
    titleElement.textContent = title;
  }

  const descriptionElement = root.querySelector('[data-role="description"]');
  if (descriptionElement) {
    descriptionElement.textContent = description;
  }

  const supportPrefixElement = root.querySelector('[data-role="support-prefix"]');
  if (supportPrefixElement) {
    supportPrefixElement.textContent = supportPrefix;
  }

  const supportLink = root.querySelector('[data-role="support-link"]');
  if (supportLink) {
    supportLink.textContent = supportLinkLabel;
  }

  const frame = root.querySelector('[data-role="frame"]');

  const setEntryPoint = (value) => {
    if (frame) {
      frame.src = value || "";
    }
    if (supportLink) {
      supportLink.href = value || "";
    }
  };

  setEntryPoint(entryPoint);

  const closeButton = root.querySelector('[data-role="close"]');

  const handleClose = (reason) => {
    if (typeof onCloseRequest === "function") {
      onCloseRequest(reason);
    }
  };

  if (closeButton) {
    closeButton.addEventListener("click", () => handleClose("close-button"));
  }

  root.addEventListener("click", (event) => {
    if (event.target === root) {
      handleClose("backdrop");
    }
  });

  if (frame && typeof onFrameLoad === "function") {
    frame.addEventListener("load", onFrameLoad);
  }

  if (frame && typeof onFrameError === "function") {
    frame.addEventListener("error", onFrameError);
  }

  return {
    root,
    frame,
    closeButton,
    supportLink,
    setEntryPoint
  };
}
