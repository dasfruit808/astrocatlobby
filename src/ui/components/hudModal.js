export function createHudModal({
  id,
  title,
  description,
  sections = [],
  navLabel,
  navTitle = "Quick sections"
} = {}) {
  if (typeof document === "undefined") {
    throw new Error("createHudModal requires a document environment");
  }

  const template = document.createElement("template");
  template.innerHTML = `
    <div class="hud-overlay" role="dialog" aria-modal="true" aria-hidden="true" hidden>
      <div class="hud-modal">
        <div class="hud-modal__header">
          <h2 class="hud-modal__title" data-role="title"></h2>
          <button type="button" class="hud-modal__close" data-role="close">Close</button>
        </div>
        <div class="hud-modal__content">
          <p class="hud-modal__description" data-role="description"></p>
          <div class="hud-modal__layout">
            <aside class="hud-modal__nav" data-role="nav" hidden>
              <p class="hud-modal__nav-title" data-role="nav-title"></p>
              <ul class="hud-modal__nav-list" data-role="nav-list"></ul>
            </aside>
            <div class="hud-modal__sections" data-role="sections"></div>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  const overlay = template.content.firstElementChild;
  if (!overlay) {
    throw new Error("Failed to create HUD modal");
  }

  if (id) {
    overlay.id = id;
  }

  const titleElement = overlay.querySelector('[data-role="title"]');
  if (titleElement) {
    titleElement.textContent = title ?? "";
  }

  const headingId = id ? `${id}-title` : `hud-modal-title-${Math.random().toString(36).slice(2)}`;
  if (titleElement) {
    titleElement.id = headingId;
  }
  overlay.setAttribute("aria-labelledby", headingId);

  const descriptionElement = overlay.querySelector('[data-role="description"]');
  if (description) {
    descriptionElement.textContent = description;
  } else if (descriptionElement) {
    descriptionElement.remove();
  }

  const navElement = overlay.querySelector('[data-role="nav"]');
  const navTitleElement = overlay.querySelector('[data-role="nav-title"]');
  const navList = overlay.querySelector('[data-role="nav-list"]');
  const sectionsContainer = overlay.querySelector('[data-role="sections"]');

  if (!sectionsContainer) {
    throw new Error("HUD modal missing sections container");
  }

  const navEntries = [];

  const effectiveSections = Array.isArray(sections) ? sections : [];

  if (!Array.isArray(sections) || sections.length <= 1) {
    if (navElement) {
      navElement.remove();
    }
  } else if (navElement && navList && navTitleElement) {
    navElement.hidden = false;
    navTitleElement.textContent = navTitle;
    navElement.setAttribute("aria-label", navLabel || `${title ?? ""} sections`);
    navList.innerHTML = "";
  }

  let sectionIndex = 0;

  for (const definition of effectiveSections) {
    if (!definition) {
      continue;
    }

    sectionIndex += 1;
    const section = document.createElement("section");
    section.className = "hud-modal__section";
    const sectionId = definition.id || (id ? `${id}-section-${sectionIndex}` : `hud-modal-section-${sectionIndex}`);
    section.id = sectionId;

    if (definition.heading || definition.description) {
      const header = document.createElement("div");
      header.className = "hud-modal__section-header";
      if (definition.heading) {
        const heading = document.createElement("h3");
        heading.className = "hud-modal__section-title";
        heading.textContent = definition.heading;
        header.append(heading);
      }
      if (definition.description) {
        const summary = document.createElement("p");
        summary.className = "hud-modal__section-description";
        summary.textContent = definition.description;
        header.append(summary);
      }
      section.append(header);
    }

    const content = document.createElement("div");
    content.className = "hud-modal__section-content";
    const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
    for (const node of nodes) {
      if (node instanceof Node) {
        content.append(node);
      }
    }
    section.append(content);
    sectionsContainer.append(section);

    if (navList && navElement && effectiveSections.length > 1) {
      const navItem = document.createElement("li");
      navItem.className = "hud-modal__nav-item";
      const navButton = document.createElement("button");
      navButton.type = "button";
      navButton.className = "hud-modal__nav-button";
      navButton.textContent =
        definition.navLabel || definition.heading || `Section ${sectionIndex}`;
      navButton.setAttribute("aria-controls", sectionId);
      navButton.addEventListener("click", () => {
        try {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
          section.scrollIntoView();
        }
        setActiveNav(sectionId);
      });
      navItem.append(navButton);
      navList.append(navItem);
      navEntries.push({ id: sectionId, button: navButton, section });
    }
  }

  function setActiveNav(activeId) {
    for (const entry of navEntries) {
      const isActive = entry.id === activeId;
      entry.button.classList.toggle("is-active", isActive);
      entry.button.setAttribute("aria-current", isActive ? "true" : "false");
    }
  }

  const closeButton = overlay.querySelector('[data-role="close"]');

  return {
    root: overlay,
    closeButton,
    sectionsContainer,
    navEntries,
    setActiveNav
  };
}
