const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("gameCanvas"));
const ctx = canvas.getContext("2d");
const hudChat = document.getElementById("hud-chat");
const hudRoster = document.getElementById("hud-roster");
const hudQuest = document.getElementById("hud-quest");
const statusBox = document.getElementById("game-status");

let statusDismissTimer;

function showStatus(lines, options = {}) {
  if (!statusBox) {
    return;
  }

  if (statusDismissTimer) {
    window.clearTimeout(statusDismissTimer);
    statusDismissTimer = undefined;
  }

  const messages = Array.isArray(lines) ? lines : [lines];
  statusBox.innerHTML = "";

  if (!messages.length) {
    statusBox.hidden = true;
    statusBox.classList.remove("is-visible");
    return;
  }

  statusBox.hidden = false;
  statusBox.classList.add("is-visible");

  messages.forEach((message) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    statusBox.appendChild(paragraph);
  });

  if (options.dismissAfter) {
    statusDismissTimer = window.setTimeout(() => {
      showStatus([]);
    }, options.dismissAfter);
  }
}

const assets = {
  background: new URL("./assets/background.png", import.meta.url).href,
  foreground: new URL("./assets/foreground.png", import.meta.url).href,
  playerIdle: new URL("./assets/player_idle.png", import.meta.url).href,
  playerJump: new URL("./assets/player_jump.png", import.meta.url).href,
  npc: new URL("./assets/npc.png", import.meta.url).href,
  interact: new URL("./assets/interact.png", import.meta.url).href,
};

function createPlaceholder(width, height, paint) {
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const context = buffer.getContext("2d");
  if (!context) {
    return buffer;
  }
  paint(context);
  return buffer;
}

function placeholderBackground() {
  return createPlaceholder(canvas.width, canvas.height, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#1c245f");
    gradient.addColorStop(1, "#090a1b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(111, 202, 255, 0.16)";
    for (let i = 0; i < 6; i += 1) {
      const peakX = i * 200 - 120;
      context.beginPath();
      context.moveTo(peakX, canvas.height * 0.75);
      context.lineTo(peakX + 200, canvas.height * 0.75);
      context.lineTo(peakX + 100, canvas.height * 0.5);
      context.closePath();
      context.fill();
    }

    context.fillStyle = "rgba(255, 255, 255, 0.7)";
    for (let i = 0; i < 80; i += 1) {
      const x = (i * 97) % canvas.width;
      const y = (i * 53) % Math.floor(canvas.height * 0.6);
      context.fillRect(x, y, 2, 2);
    }
  });
}

function placeholderForeground() {
  return createPlaceholder(canvas.width, 160, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, "rgba(24, 40, 88, 0.92)");
    gradient.addColorStop(1, "rgba(12, 18, 42, 0.96)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, 160);

    context.fillStyle = "rgba(120, 210, 255, 0.4)";
    context.fillRect(0, 18, canvas.width, 3);

    context.fillStyle = "rgba(27, 220, 255, 0.18)";
    for (let i = 0; i < canvas.width; i += 90) {
      context.fillRect(i + 36, 40, 18, 80);
    }
  });
}

function placeholderPlayerIdle() {
  return createPlaceholder(64, 64, (context) => {
    context.fillStyle = "#80d8ff";
    context.fillRect(18, 22, 28, 30);
    context.fillRect(22, 10, 20, 18);
    context.fillStyle = "#0b0d1d";
    context.fillRect(26, 28, 12, 8);
    context.fillStyle = "#ffe6a7";
    context.fillRect(24, 14, 16, 12);
    context.fillStyle = "#0b0d1d";
    context.fillRect(28, 18, 3, 3);
    context.fillRect(33, 18, 3, 3);
    context.fillRect(30, 22, 4, 2);
    context.fillStyle = "#80d8ff";
    context.fillRect(16, 42, 8, 18);
    context.fillRect(40, 42, 8, 18);
    context.fillRect(18, 18, 6, 6);
    context.fillRect(38, 18, 6, 6);
  });
}

function placeholderPlayerJump() {
  return createPlaceholder(64, 64, (context) => {
    context.fillStyle = "#80d8ff";
    context.fillRect(20, 18, 24, 28);
    context.fillRect(22, 6, 20, 18);
    context.fillStyle = "#ffe6a7";
    context.fillRect(24, 10, 16, 12);
    context.fillStyle = "#0b0d1d";
    context.fillRect(28, 14, 3, 3);
    context.fillRect(33, 14, 3, 3);
    context.fillRect(30, 18, 4, 2);
    context.fillStyle = "#80d8ff";
    context.fillRect(16, 20, 8, 18);
    context.fillRect(40, 20, 8, 18);
    context.fillRect(18, 6, 6, 6);
    context.fillRect(38, 6, 6, 6);
    context.fillStyle = "#ffe6a7";
    context.fillRect(18, 40, 28, 10);
  });
}

function placeholderNpc() {
  return createPlaceholder(64, 64, (context) => {
    context.fillStyle = "#8c7dff";
    context.fillRect(18, 24, 28, 28);
    context.fillRect(22, 12, 20, 20);
    context.fillStyle = "#e1d8ff";
    context.fillRect(24, 16, 16, 12);
    context.fillStyle = "#0b0d1d";
    context.fillRect(28, 20, 3, 3);
    context.fillRect(33, 20, 3, 3);
    context.fillRect(30, 24, 4, 2);
    context.fillStyle = "#8c7dff";
    context.fillRect(16, 44, 8, 16);
    context.fillRect(40, 44, 8, 16);
    context.fillRect(18, 20, 6, 6);
    context.fillRect(38, 20, 6, 6);
  });
}

function placeholderInteract() {
  return createPlaceholder(40, 40, (context) => {
    context.fillStyle = "rgba(13, 17, 38, 0.9)";
    context.beginPath();
    context.moveTo(10, 8);
    context.lineTo(30, 8);
    context.quadraticCurveTo(36, 8, 36, 14);
    context.lineTo(36, 26);
    context.quadraticCurveTo(36, 32, 30, 32);
    context.lineTo(22, 32);
    context.lineTo(16, 36);
    context.lineTo(16, 32);
    context.lineTo(10, 32);
    context.quadraticCurveTo(4, 32, 4, 26);
    context.lineTo(4, 14);
    context.quadraticCurveTo(4, 8, 10, 8);
    context.closePath();
    context.fill();
    context.strokeStyle = "rgba(154, 215, 255, 0.4)";
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.moveTo(20, 32);
    context.lineTo(16, 36);
    context.lineTo(24, 36);
    context.closePath();
    context.fill();
    context.font = "700 10px 'Nunito', 'Segoe UI', sans-serif";
    context.fillStyle = "#ffe6a7";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("SPACE", 20, 20);
  });
}

const roster = [
  { name: "Nova", role: "Captain" },
  { name: "Comet", role: "Scout" },
  { name: "Orion", role: "Mechanic" },
  { name: "Luna", role: "Navigator" },
];

function populateRoster() {
  hudRoster.innerHTML = "";
  roster.forEach((cat) => {
    const item = document.createElement("li");
    item.textContent = `${cat.name} – ${cat.role}`;
    hudRoster.appendChild(item);
  });
}

const keys = new Map();
window.addEventListener("keydown", (event) => {
  keys.set(event.code, true);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => {
  keys.set(event.code, false);
});

const camera = { x: 0 };

const world = {
  width: 2400,
  height: canvas.height,
  gravity: 0.65,
  groundLevel: canvas.height - 64,
};

const player = {
  x: 160,
  y: world.groundLevel - 64,
  vx: 0,
  vy: 0,
  width: 64,
  height: 64,
  facing: 1,
  onGround: false,
  state: "idle",
  lastInteraction: 0,
  lastJump: 0,
};

const platforms = [
  { x: 0, y: world.groundLevel, width: world.width, height: 64 },
  { x: 360, y: world.groundLevel - 120, width: 220, height: 24 },
  { x: 720, y: world.groundLevel - 180, width: 220, height: 24 },
  { x: 1100, y: world.groundLevel - 100, width: 260, height: 24 },
  { x: 1500, y: world.groundLevel - 160, width: 260, height: 24 },
  { x: 1900, y: world.groundLevel - 80, width: 200, height: 24 },
];

const interactables = [
  {
    id: "console",
    type: "station",
    x: 640,
    y: world.groundLevel - 192,
    width: 56,
    height: 56,
    message: "Comet: Systems are stable! Want to initiate a star chart sync?",
  },
  {
    id: "npc",
    type: "crew",
    x: 1180,
    y: world.groundLevel - 156,
    width: 56,
    height: 64,
    message: "Orion: The jump drive is ready whenever the crew is!",
  },
  {
    id: "terminal",
    type: "station",
    x: 1825,
    y: world.groundLevel - 168,
    width: 56,
    height: 64,
    message: "Luna: Remember to brief the recruits before the next launch.",
  },
];

const parallaxLayers = [];

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = src;
    image.onload = () => resolve(image);
    image.onerror = reject;
  });
}

async function loadAssets() {
  const missing = [];

  async function loadWithFallback(label, src, fallbackFactory) {
    try {
      return await loadImage(src);
    } catch (error) {
      console.warn(`Unable to load ${label}; falling back to placeholder art.`, error);
      missing.push(label);
      return fallbackFactory();
    }
  }

  const background = await loadWithFallback("background.png", assets.background, placeholderBackground);
  const foreground = await loadWithFallback("foreground.png", assets.foreground, placeholderForeground);
  const playerIdle = await loadWithFallback("player_idle.png", assets.playerIdle, placeholderPlayerIdle);
  const playerJump = await loadWithFallback("player_jump.png", assets.playerJump, placeholderPlayerJump);
  const npc = await loadWithFallback("npc.png", assets.npc, placeholderNpc);
  const interact = await loadWithFallback("interact.png", assets.interact, placeholderInteract);

  parallaxLayers.length = 0;
  parallaxLayers.push({ image: background, factor: 0.2 });
  parallaxLayers.push({ image: foreground, factor: 0.5 });

  missing.sort();
  return { textures: { background, foreground, playerIdle, playerJump, npc, interact }, missing };
}

function appendChatLine(text) {
  const line = document.createElement("div");
  line.className = "chat-line";
  line.textContent = text;
  hudChat.appendChild(line);
  while (hudChat.children.length > 8) {
    hudChat.removeChild(hudChat.firstChild);
  }
  hudChat.scrollTop = hudChat.scrollHeight;
}

function inRange(player, object, radius = 72) {
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  const ox = object.x + object.width / 2;
  const oy = object.y + object.height / 2;
  const dx = px - ox;
  const dy = py - oy;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

function resolvePlatformCollision(entity, platform) {
  const nextBottom = entity.y + entity.height + entity.vy;
  const currentBottom = entity.y + entity.height;
  const platformTop = platform.y;

  if (currentBottom <= platformTop && nextBottom >= platformTop && entity.x + entity.width > platform.x && entity.x < platform.x + platform.width) {
    entity.y = platformTop - entity.height;
    entity.vy = 0;
    entity.onGround = true;
  }
}

function updatePlayer(delta, now) {
  const speed = 230;
  const jumpVelocity = -360;
  player.vx = 0;

  if (keys.get("ArrowLeft")) {
    player.vx -= speed;
    player.facing = -1;
  }
  if (keys.get("ArrowRight")) {
    player.vx += speed;
    player.facing = 1;
  }

  const interactPressed = keys.get("Space");
  let interacted = false;

  if (interactPressed && now - player.lastInteraction > 600) {
    for (const object of interactables) {
      if (inRange(player, object)) {
        interacted = true;
        player.lastInteraction = now;
        hudQuest.dataset.locked = "true";
        hudQuest.textContent = "Objective updated: Check the chat log for your next task.";
        appendChatLine(object.message);
        break;
      }
    }
  }

  if (!interactPressed && now - player.lastInteraction > 1500) {
    hudQuest.dataset.locked = "false";
  }

  if (interactPressed && player.onGround && !interacted && now - player.lastJump > 250) {
    player.vy = jumpVelocity;
    player.onGround = false;
    player.state = "jump";
    player.lastJump = now;
  }

  player.vy += world.gravity * delta;

  player.x += player.vx * delta;
  player.y += player.vy * delta;

  player.x = Math.max(0, Math.min(world.width - player.width, player.x));

  player.onGround = false;
  platforms.forEach((platform) => resolvePlatformCollision(player, platform));

  if (player.onGround && Math.abs(player.vx) > 0) {
    player.state = "run";
  } else if (player.onGround) {
    player.state = "idle";
  } else {
    player.state = "jump";
  }

  const lookUp = keys.get("ArrowUp");
  const sit = keys.get("ArrowDown");
  if (lookUp) {
    hudQuest.textContent = "Scanning the sky for incoming missions...";
  } else if (sit) {
    hudQuest.textContent = "Taking a quick breather on the platform.";
  } else if (hudQuest.dataset.locked !== "true") {
    hudQuest.textContent = "Explore the station and check in with the crew.";
  }
}

function drawBackground(textures) {
  const { background, foreground } = textures;
  ctx.fillStyle = "#0b0d1d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  parallaxLayers.forEach((layer) => {
    const offset = (camera.x * layer.factor) % layer.image.width;
    for (let x = -offset; x < canvas.width; x += layer.image.width) {
      ctx.drawImage(layer.image, Math.floor(x), 0, layer.image.width, canvas.height);
    }
  });

  const horizonGradient = ctx.createLinearGradient(0, canvas.height * 0.2, 0, canvas.height);
  horizonGradient.addColorStop(0, "rgba(18, 25, 68, 0.7)");
  horizonGradient.addColorStop(1, "rgba(27, 32, 90, 0.95)");
  ctx.fillStyle = horizonGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars sprinkled across the sky.
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  for (let i = 0; i < 60; i += 1) {
    const starX = ((i * 53) % canvas.width + (camera.x * 0.1)) % canvas.width;
    const starY = (i * 73) % (canvas.height * 0.5);
    ctx.fillRect(starX, starY, 2, 2);
  }

  // Foreground glow near the ground.
  ctx.fillStyle = "rgba(27, 220, 255, 0.08)";
  ctx.fillRect(0, canvas.height - 80, canvas.width, 80);

  if (foreground) {
    const offset = (camera.x * 0.6) % foreground.width;
    for (let x = -offset; x < canvas.width; x += foreground.width) {
      ctx.drawImage(foreground, Math.floor(x), canvas.height - foreground.height);
    }
  }
}

function drawPlatforms() {
  ctx.save();
  ctx.translate(-camera.x, 0);
  ctx.fillStyle = "#1f233d";
  platforms.forEach((platform) => {
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = "#252b4f";
    ctx.fillRect(platform.x, platform.y, platform.width, 12);
    ctx.fillStyle = "#1f233d";
  });
  ctx.restore();
}

function drawPlayer(textures) {
  ctx.save();
  ctx.translate(-camera.x, 0);
  const texture = player.state === "jump" ? textures.playerJump : textures.playerIdle;
  const flip = player.facing === -1;
  ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.drawImage(texture, -player.width / 2, -player.height / 2, player.width, player.height);
  ctx.restore();
}

function drawInteractables(textures) {
  ctx.save();
  ctx.translate(-camera.x, 0);
  interactables.forEach((object) => {
    if (object.type === "crew") {
      ctx.drawImage(textures.npc, object.x, object.y, object.width, object.height);
    } else {
      drawStation(object);
    }
    if (inRange(player, object)) {
      ctx.drawImage(textures.interact, object.x + object.width / 2 - 20, object.y - 28, 40, 40);
    }
  });
  ctx.restore();
}

function drawStation(object) {
  const { x, y, width, height } = object;
  ctx.fillStyle = "rgba(16, 22, 48, 0.95)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "rgba(41, 206, 255, 0.3)";
  ctx.fillRect(x + 6, y + 10, width - 12, height - 24);
  ctx.fillStyle = "rgba(64, 226, 255, 0.55)";
  ctx.fillRect(x + 6, y + 10, width - 12, 12);
  ctx.fillStyle = "rgba(11, 13, 29, 0.95)";
  ctx.fillRect(x + 4, y + height - 12, width - 8, 10);
  ctx.fillStyle = "rgba(154, 215, 255, 0.7)";
  ctx.fillRect(x + width / 2 - 14, y + height - 10, 28, 4);
  ctx.fillStyle = "rgba(255, 230, 167, 0.55)";
  ctx.fillRect(x + width / 2 - 8, y + height - 6, 16, 2);
  ctx.fillStyle = "rgba(255, 159, 110, 0.75)";
  ctx.fillRect(x + 10, y + height - 10, 6, 6);
  ctx.fillStyle = "rgba(120, 255, 190, 0.75)";
  ctx.fillRect(x + width - 16, y + height - 10, 6, 6);
}

function updateCamera() {
  const target = player.x + player.width / 2 - canvas.width / 2;
  const max = world.width - canvas.width;
  camera.x += (Math.min(Math.max(target, 0), max) - camera.x) * 0.12;
}

let previousTimestamp = performance.now();

async function start() {
  showStatus([
    "Drop your PNG sprites into astrocatlobby/game/static/assets/ to reskin the lobby.",
    "Missing files are replaced with glowing placeholders so you can prototype immediately.",
  ]);
  populateRoster();
  appendChatLine("Nova: Welcome to the lobby! Feel free to explore.");
  const { textures, missing } = await loadAssets();

  if (missing.length > 0) {
    const missingList = missing.join(", ");
    showStatus([
      `Using placeholder art for: ${missingList}.`,
      "Add PNG files with those names and refresh to see your custom art.",
    ]);
  } else {
    showStatus([
      "All art assets loaded. Spacebar interacts with nearby crew consoles.",
    ], { dismissAfter: 4500 });
  }

  function frame(now) {
    const delta = Math.min((now - previousTimestamp) / 1000, 0.05);
    previousTimestamp = now;

    updatePlayer(delta, now);
    updateCamera();

    drawBackground(textures);
    drawPlatforms();
    drawInteractables(textures);
    drawPlayer(textures);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

start().catch((error) => {
  console.error("Failed to start Astrocat Lobby", error);
  showStatus([
    "The lobby failed to start. Open the browser console for technical details.",
  ]);
});
