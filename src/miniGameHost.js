const miniGameEntrypoints = import.meta.glob("./minigame/main.{js,ts}");

function getInitializer(module) {
  if (!module || typeof module !== "object") {
    return null;
  }
  if (typeof module.mount === "function") {
    return module.mount;
  }
  if (typeof module.default === "function") {
    return module.default;
  }
  return null;
}

export function createMiniGameHost(parent = document.body) {
  const overlay = document.createElement("div");
  overlay.className = "minigame-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");

  const frame = document.createElement("section");
  frame.className = "minigame-overlay__frame";

  const header = document.createElement("header");
  header.className = "minigame-overlay__header";

  const title = document.createElement("h2");
  title.className = "minigame-overlay__title";
  title.textContent = "Portal Challenge";
  header.append(title);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "minigame-overlay__close";
  closeButton.textContent = "Exit";
  header.append(closeButton);

  frame.append(header);

  const content = document.createElement("div");
  content.className = "minigame-overlay__content";
  frame.append(content);

  overlay.append(frame);
  parent.append(overlay);

  let cleanupCallback = null;
  let openTask = null;
  let isVisible = false;
  let lastLoadSuccessful = false;

  const handleKeydown = (event) => {
    if (event.code === "Escape") {
      event.preventDefault();
      void close();
    }
  };

  closeButton.addEventListener("click", () => {
    void close();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      void close();
    }
  });

  async function runCleanup() {
    if (!cleanupCallback) {
      return;
    }
    const callback = cleanupCallback;
    cleanupCallback = null;
    try {
      await callback();
    } catch (error) {
      console.error("Mini game cleanup failed", error);
    }
  }

  function showPlaceholder(message) {
    const wrapper = document.createElement("div");
    wrapper.className = "minigame-placeholder";
    wrapper.innerHTML = message;
    content.replaceChildren(wrapper);
  }

  function setVisible(nextVisible) {
    if (nextVisible === isVisible) {
      return;
    }
    isVisible = nextVisible;
    if (isVisible) {
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      overlay.classList.add("is-visible");
      document.addEventListener("keydown", handleKeydown);
    } else {
      overlay.classList.remove("is-visible");
      overlay.setAttribute("aria-hidden", "true");
      overlay.hidden = true;
      document.removeEventListener("keydown", handleKeydown);
    }
  }

  async function open() {
    if (openTask) {
      return openTask;
    }
    if (isVisible) {
      return Promise.resolve(lastLoadSuccessful);
    }

    setVisible(true);
    showPlaceholder("<p class=\"minigame-placeholder__text\">Loading mini game…</p>");

    const loader =
      miniGameEntrypoints["./minigame/main.js"] ||
      miniGameEntrypoints["./minigame/main.ts"];

    openTask = (async () => {
      let loadedSuccessfully = false;

      if (!loader) {
        showPlaceholder(
          `<div class=\"minigame-placeholder__text\">` +
            `Add your mini game entry file at <code>src/minigame/main.js</code> ` +
            `and export a <code>mount</code> function (or default export) to start it here.` +
            `</div>`
        );
      } else {
        try {
          const module = await loader();
          const initializer = getInitializer(module);

          if (!initializer) {
            showPlaceholder(
              `<div class=\"minigame-placeholder__text\">` +
                `The mini game entry needs to export a <code>mount</code> function or ` +
                `a default function. Update <code>src/minigame/main.js</code>.` +
                `</div>`
            );
          } else {
            content.replaceChildren();
            const teardown = await initializer(content, { close });
            if (typeof teardown === "function") {
              cleanupCallback = () => Promise.resolve(teardown()).catch((error) => {
                console.error("Mini game teardown failed", error);
              });
            } else if (teardown && typeof teardown.dispose === "function") {
              cleanupCallback = () => Promise.resolve(teardown.dispose()).catch((error) => {
                console.error("Mini game dispose failed", error);
              });
            }
            loadedSuccessfully = true;
          }
        } catch (error) {
          console.error("Failed to load the mini game module", error);
          showPlaceholder(
            `<div class=\"minigame-placeholder__text\">` +
              `Loading the mini game failed. Check the console for details.` +
              `</div>`
          );
          throw error;
        }
      }

      lastLoadSuccessful = loadedSuccessfully;
      return loadedSuccessfully;
    })();

    try {
      return await openTask;
    } finally {
      openTask = null;
    }
  }

  async function close() {
    if (!isVisible && !openTask) {
      return;
    }

    await runCleanup();

    setVisible(false);
    content.replaceChildren();
  }

  return {
    open,
    close,
    isOpen: () => isVisible,
    element: overlay
  };
}
