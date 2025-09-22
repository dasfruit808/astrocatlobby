const app = document.querySelector("#app");
if (!app) {
  throw new Error("Missing #app container");
}

const playerStats = {
  name: "PixelHero",
  level: 15,
  rank: "Adventurer",
  exp: 750,
  maxExp: 1000,
  hp: 85,
  maxHp: 100,
  mp: 40,
  maxMp: 60
};

const defaultMessage = "Use A/D or ←/→ to move. Press Space to jump.";
let messageTimerId = 0;

const ui = createInterface(playerStats);
app.innerHTML = "";
app.append(ui.root);

const canvas = document.createElement("canvas");
canvas.width = 960;
canvas.height = 540;
canvas.className = "game-canvas";
ui.canvasWrapper.append(canvas);

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Unable to acquire 2D context");
}

const groundY = canvas.height - 96;
const stars = Array.from({ length: 48 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * (groundY - 120),
  size: Math.random() * 2 + 0.5,
  twinkle: Math.random() * Math.PI * 2
}));

const playerSprite = new Image();
let playerSpriteReady = false;
playerSprite.onload = () => {
  playerSpriteReady = true;
};
playerSprite.src = new URL("./assets/PlayerSprite.png", import.meta.url).href;
if (playerSprite.complete) {
  playerSpriteReady = true;
}

const player = {
  x: canvas.width / 2 - 24,
  y: groundY - 54,
  width: 48,
  height: 54,
  vx: 0,
  vy: 0,
  direction: 1,
  onGround: false
};

const platforms = [
  { x: 140, y: groundY - 120, width: 160, height: 18 },
  { x: 468, y: groundY - 180, width: 200, height: 18 },
  { x: 724, y: groundY - 80, width: 150, height: 18 }
];

const crystals = [
  { x: 220, y: groundY - 36, radius: 12, collected: false },
  { x: 520, y: groundY - 220, radius: 12, collected: false },
  { x: 780, y: groundY - 116, radius: 12, collected: false },
  { x: 360, y: groundY - 156, radius: 12, collected: false },
  { x: 640, y: groundY - 36, radius: 12, collected: false }
];

const interactables = [
  {
    type: "chest",
    label: "Treasure Chest",
    x: 84,
    y: groundY - 46,
    width: 44,
    height: 36,
    opened: false
  },
  {
    type: "fountain",
    label: "Mana Fountain",
    x: 840,
    y: groundY - 68,
    width: 48,
    height: 52,
    charges: 2
  },
  {
    type: "npc",
    name: "Nova",
    label: "Nova the Guide",
    x: 320,
    y: groundY - 60,
    width: 42,
    height: 54,
    dialogue: [
      "Welcome to the Astrocat Lobby!",
      "Collect the floating crystals to charge the portal.",
      "Need a boost? Try the chest or the fountain nearby."
    ],
    lineIndex: 0
  }
];

const keys = new Set();
const justPressed = new Set();

window.addEventListener("keydown", (event) => {
  if (!event.repeat) {
    justPressed.add(event.code);
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

showMessage(defaultMessage, 0);
ui.updateCrystals(0, crystals.length);
ui.refresh(playerStats);

let lastTimestamp = performance.now();
requestAnimationFrame(loop);

function loop(timestamp) {
  const delta = Math.min(32, timestamp - lastTimestamp);
  lastTimestamp = timestamp;

  update(delta);
  render(timestamp);

  justPressed.clear();
  requestAnimationFrame(loop);
}

function update(delta) {
  const previousX = player.x;
  const previousY = player.y;

  const moveLeft = keys.has("ArrowLeft") || keys.has("KeyA");
  const moveRight = keys.has("ArrowRight") || keys.has("KeyD");
  const jumpPressed =
    justPressed.has("Space") ||
    justPressed.has("ArrowUp") ||
    justPressed.has("KeyW");

  const acceleration = 0.35 * (delta / 16.666);
  const maxSpeed = 4.2;
  const friction = 0.82;
  const gravity = 0.52 * (delta / 16.666);

  if (moveLeft && !moveRight) {
    player.vx = Math.max(player.vx - acceleration, -maxSpeed);
    player.direction = -1;
  } else if (moveRight && !moveLeft) {
    player.vx = Math.min(player.vx + acceleration, maxSpeed);
    player.direction = 1;
  } else {
    player.vx *= friction;
    if (Math.abs(player.vx) < 0.01) {
      player.vx = 0;
    }
  }

  if (jumpPressed && player.onGround) {
    player.vy = -10.8;
    player.onGround = false;
  }

  player.vy += gravity;
  player.x += player.vx * (delta / 16.666);
  player.y += player.vy * (delta / 16.666);
  player.onGround = false;

  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }

  if (player.x + player.width > canvas.width) {
    player.x = canvas.width - player.width;
    player.vx = 0;
  }

  if (player.y + player.height >= groundY) {
    player.y = groundY - player.height;
    player.vy = 0;
    player.onGround = true;
  }

  for (const platform of platforms) {
    const isAbovePlatform = previousY + player.height <= platform.y;
    const isWithinX =
      player.x + player.width > platform.x &&
      player.x < platform.x + platform.width;

    if (player.vy >= 0 && isAbovePlatform && isWithinX) {
      const bottom = player.y + player.height;
      if (bottom >= platform.y && bottom <= platform.y + platform.height + 4) {
        player.y = platform.y - player.height;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  let promptText = "";

  for (const crystal of crystals) {
    if (crystal.collected) continue;

    const overlapX =
      player.x + player.width > crystal.x - crystal.radius &&
      player.x < crystal.x + crystal.radius;
    const overlapY =
      player.y + player.height > crystal.y - crystal.radius &&
      player.y < crystal.y + crystal.radius;

    if (overlapX && overlapY) {
      crystal.collected = true;
      const leveledUp = gainExperience(60);
      const collectedCount = crystals.filter((c) => c.collected).length;
      ui.updateCrystals(collectedCount, crystals.length);
      let message = "Crystal energy surges through you! +60 EXP.";
      if (leveledUp) {
        message += ` Level up! You reached level ${playerStats.level}.`;
      }
      showMessage(message, 4200);
    }
  }

  for (const interactable of interactables) {
    const near = isNear(player, interactable, 24);
    if (!near) {
      continue;
    }

    if (interactable.type === "chest") {
      promptText = "Press E to open the chest";
      if (justPressed.has("KeyE")) {
        if (!interactable.opened) {
          interactable.opened = true;
          playerStats.hp = clamp(playerStats.hp + 12, 0, playerStats.maxHp);
          ui.refresh(playerStats);
          showMessage("You found herbal tonics! HP restored.", 3600);
        } else {
          showMessage("The chest is empty now, but still shiny.", 2800);
        }
      }
    } else if (interactable.type === "fountain") {
      promptText = "Press E to draw power from the fountain";
      if (justPressed.has("KeyE")) {
        if (interactable.charges > 0) {
          interactable.charges -= 1;
          playerStats.mp = clamp(playerStats.mp + 18, 0, playerStats.maxMp);
          ui.refresh(playerStats);
          showMessage("Mana rush! Your MP was restored.", 3200);
        } else {
          showMessage("The fountain needs time to recharge.", 3000);
        }
      }
    } else if (interactable.type === "npc") {
      promptText = "Press E to talk to Nova";
      if (justPressed.has("KeyE")) {
        const line = interactable.dialogue[interactable.lineIndex];
        interactable.lineIndex =
          (interactable.lineIndex + 1) % interactable.dialogue.length;
        showMessage(`${interactable.name}: ${line}`, 4600);
      }
    }
  }

  ui.setPrompt(promptText);
}

function render(timestamp) {
  const time = timestamp / 1000;

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  backgroundGradient.addColorStop(0, "#1a1a28");
  backgroundGradient.addColorStop(0.6, "#25253a");
  backgroundGradient.addColorStop(1, "#2f3d3f");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const star of stars) {
    const twinkle = (Math.sin(time * 2 + star.twinkle) + 1) / 2;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + twinkle * 0.8})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#1c2b33";
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

  ctx.fillStyle = "#243b25";
  ctx.fillRect(0, groundY, canvas.width, 16);

  ctx.fillStyle = "#3b5e3f";
  for (const platform of platforms) {
    drawRoundedRect(platform.x, platform.y, platform.width, platform.height, 6);
  }

  drawPortal(time);

  for (const interactable of interactables) {
    if (interactable.type === "chest") {
      drawChest(interactable);
    } else if (interactable.type === "fountain") {
      drawFountain(interactable, time);
    } else if (interactable.type === "npc") {
      drawGuide(interactable, time);
    }
  }

  for (const crystal of crystals) {
    if (crystal.collected) continue;
    drawCrystal(crystal, time);
  }

  drawPlayer(player, time);

  if (ui.promptText) {
    ctx.font = "20px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    const metrics = ctx.measureText(ui.promptText);
    const x = Math.max(12, Math.min(player.x + player.width / 2 - metrics.width / 2, canvas.width - metrics.width - 12));
    const y = player.y - 18;
    ctx.fillRect(x - 8, y - 22, metrics.width + 16, 32);
    ctx.fillStyle = "#f1f1ff";
    ctx.fillText(ui.promptText, x, y);
  }
}

function drawPortal(time) {
  const portalX = canvas.width - 140;
  const portalY = groundY - 120;
  const portalWidth = 100;
  const portalHeight = 140;

  ctx.save();
  ctx.fillStyle = "#384d6b";
  drawRoundedRect(portalX - 12, portalY - 12, portalWidth + 24, portalHeight + 24, 24);

  const glowGradient = ctx.createRadialGradient(
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    10,
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    portalWidth / 2
  );
  glowGradient.addColorStop(0, "rgba(150, 205, 255, 0.85)");
  glowGradient.addColorStop(1, "rgba(100, 140, 220, 0.1)");
  ctx.fillStyle = glowGradient;
  drawRoundedRect(portalX, portalY, portalWidth, portalHeight, 20);

  ctx.strokeStyle = `rgba(200, 240, 255, 0.55)`;
  ctx.lineWidth = 4;
  ctx.strokeRect(portalX + 12, portalY + 12, portalWidth - 24, portalHeight - 24);

  const pulse = (Math.sin(time * 2.4) + 1) / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(180, 230, 255, ${0.35 + pulse * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    24 + pulse * 8,
    60 + pulse * 12,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(entity, time) {
  ctx.save();
  ctx.translate(entity.x + entity.width / 2, entity.y + entity.height);
  ctx.scale(entity.direction, 1);
  ctx.translate(-entity.width / 2, -entity.height);

  if (playerSpriteReady) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      playerSprite,
      0,
      0,
      playerSprite.width,
      playerSprite.height,
      0,
      0,
      entity.width,
      entity.height
    );
  } else {
    ctx.fillStyle = "#4b6cff";
    drawRoundedRect(4, 12, entity.width - 8, entity.height - 18, 6);

    ctx.fillStyle = "#ffb6c1";
    drawRoundedRect(6, 0, entity.width - 12, 18, 6);

    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(8, 16, entity.width - 16, 6);

    ctx.fillStyle = "#111";
    const blink = Math.sin(time * 3.2) > -0.2 ? 1 : 0.2;
    ctx.fillRect(12, 6, 4, 4 * blink);
    ctx.fillRect(entity.width - 16, 6, 4, 4 * blink);

    ctx.fillStyle = "#c9d7ff";
    ctx.fillRect(0, entity.height - 12, entity.width - 12, 12);
    ctx.fillRect(entity.width - 12, entity.height - 8, 12, 8);
  }
  ctx.restore();
}

function drawChest(chest) {
  ctx.save();
  ctx.translate(chest.x, chest.y);
  ctx.fillStyle = chest.opened ? "#a77b3b" : "#c58f3d";
  drawRoundedRect(0, 10, chest.width, chest.height - 10, 6);
  ctx.fillStyle = chest.opened ? "#8a5f23" : "#a16b22";
  drawRoundedRect(0, 0, chest.width, 18, 6);
  ctx.fillStyle = "#f7d774";
  ctx.fillRect(chest.width / 2 - 4, 18, 8, 10);
  ctx.restore();
}

function drawFountain(fountain, time) {
  ctx.save();
  ctx.translate(fountain.x, fountain.y);
  ctx.fillStyle = "#3c4a62";
  drawRoundedRect(0, fountain.height - 18, fountain.width, 18, 8);
  ctx.fillStyle = "#556b8f";
  drawRoundedRect(6, 14, fountain.width - 12, fountain.height - 32, 10);
  const pulse = (Math.sin(time * 2) + 1) / 2;
  ctx.fillStyle = `rgba(120, 205, 255, ${0.4 + pulse * 0.4})`;
  drawRoundedRect(10, 20, fountain.width - 20, fountain.height - 40, 10);
  ctx.restore();
}

function drawGuide(guide, time) {
  ctx.save();
  ctx.translate(guide.x, guide.y);
  ctx.fillStyle = "#f4dede";
  drawRoundedRect(4, 8, guide.width - 8, guide.height - 12, 10);
  ctx.fillStyle = "#dba6ff";
  drawRoundedRect(8, guide.height - 28, guide.width - 16, 20, 8);
  ctx.fillStyle = "#000";
  const bob = Math.sin(time * 2.4) * 1.5;
  ctx.fillRect(12, 14 + bob, 4, 6);
  ctx.fillRect(guide.width - 16, 14 + bob, 4, 6);
  ctx.fillStyle = "#fff";
  ctx.fillRect(12, 14 + bob, 4, 4);
  ctx.fillRect(guide.width - 16, 14 + bob, 4, 4);
  ctx.fillStyle = "#fefefe";
  ctx.beginPath();
  ctx.arc(guide.width / 2, 8, 10, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrystal(crystal, time) {
  ctx.save();
  ctx.translate(crystal.x, crystal.y);
  ctx.rotate(Math.sin(time * 2 + crystal.x * 0.01) * 0.1);
  const gradient = ctx.createLinearGradient(-crystal.radius, -crystal.radius, crystal.radius, crystal.radius);
  gradient.addColorStop(0, "#d9baff");
  gradient.addColorStop(1, "#8fb5ff");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, -crystal.radius - 6);
  ctx.lineTo(crystal.radius, 0);
  ctx.lineTo(0, crystal.radius + 6);
  ctx.lineTo(-crystal.radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function isNear(playerEntity, object, padding) {
  return (
    playerEntity.x < object.x + object.width + padding &&
    playerEntity.x + playerEntity.width > object.x - padding &&
    playerEntity.y < object.y + object.height + padding &&
    playerEntity.y + playerEntity.height > object.y - padding
  );
}

function gainExperience(amount) {
  playerStats.exp += amount;
  let leveledUp = false;
  while (playerStats.exp >= playerStats.maxExp) {
    playerStats.exp -= playerStats.maxExp;
    playerStats.level += 1;
    playerStats.maxExp = Math.round(playerStats.maxExp * 1.2);
    leveledUp = true;
  }
  ui.refresh(playerStats);
  return leveledUp;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showMessage(message, duration) {
  ui.setMessage(message);
  if (messageTimerId) {
    clearTimeout(messageTimerId);
  }
  if (duration > 0) {
    messageTimerId = window.setTimeout(() => {
      ui.setMessage(defaultMessage);
      messageTimerId = 0;
    }, duration);
  }
}

function createInterface(stats) {
  const root = document.createElement("div");
  root.className = "game-root";

  const canvasWrapper = document.createElement("div");
  canvasWrapper.className = "canvas-wrapper";

  const panel = document.createElement("aside");
  panel.className = "stats-panel";

  const title = document.createElement("h1");
  title.textContent = "Astrocat Lobby";
  panel.append(title);

  const subtitle = document.createElement("p");
  subtitle.className = "player-subtitle";
  panel.append(subtitle);

  const statsContainer = document.createElement("div");
  statsContainer.className = "stats-container";
  panel.append(statsContainer);

  const hpBar = createStatBar("HP", "linear-gradient(90deg,#ff9a9e,#ff4e50)");
  const mpBar = createStatBar("MP", "linear-gradient(90deg,#74f2ff,#4fa9ff)");
  const expBar = createStatBar("EXP", "linear-gradient(90deg,#fddb92,#d1fdff)");

  const crystalsLabel = document.createElement("p");
  crystalsLabel.className = "crystal-label";
  panel.append(crystalsLabel);

  const message = document.createElement("p");
  message.className = "message";
  panel.append(message);

  const instructions = document.createElement("ul");
  instructions.className = "instruction-list";
  instructions.innerHTML = `
    <li>Move with A/D or ←/→</li>
    <li>Jump with Space or W/↑</li>
    <li>Press E near objects to interact</li>
  `;
  panel.append(instructions);

  root.append(canvasWrapper, panel);

  return {
    root,
    canvasWrapper,
    promptText: "",
    refresh(updatedStats) {
      subtitle.textContent = `${updatedStats.name} — Level ${updatedStats.level} ${updatedStats.rank}`;
      updateBar(hpBar, updatedStats.hp, updatedStats.maxHp);
      updateBar(mpBar, updatedStats.mp, updatedStats.maxMp);
      updateBar(expBar, updatedStats.exp, updatedStats.maxExp);
    },
    updateCrystals(collected, total) {
      crystalsLabel.textContent = `Crystals collected: ${collected} / ${total}`;
    },
    setMessage(text) {
      message.textContent = text;
    },
    setPrompt(text) {
      this.promptText = text;
    }
  };

  function createStatBar(labelText, fillColor) {
    const row = document.createElement("div");
    row.className = "stat-row";

    const label = document.createElement("span");
    label.className = "stat-label";
    label.textContent = labelText;
    row.append(label);

    const bar = document.createElement("div");
    bar.className = "stat-bar";
    const fill = document.createElement("div");
    fill.className = "stat-bar__fill";
    fill.style.background = fillColor;
    bar.append(fill);
    row.append(bar);

    const value = document.createElement("span");
    value.className = "stat-value";
    row.append(value);

    statsContainer.append(row);

    return { fill, value };
  }

  function updateBar(bar, current, max) {
    const clamped = clamp(current, 0, max);
    const percent = max === 0 ? 0 : (clamped / max) * 100;
    bar.fill.style.width = `${percent}%`;
    bar.value.textContent = `${Math.round(clamped)} / ${Math.round(max)}`;
  }
}
