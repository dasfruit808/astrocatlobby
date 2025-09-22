const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("gameCanvas"));
const ctx = canvas.getContext("2d");
const hudChat = document.getElementById("hud-chat");
const hudRoster = document.getElementById("hud-roster");
const hudQuest = document.getElementById("hud-quest");

const assets = {
  background: new URL("./assets/background.png", import.meta.url).href,
  foreground: new URL("./assets/foreground.png", import.meta.url).href,
  playerIdle: new URL("./assets/player_idle.png", import.meta.url).href,
  playerJump: new URL("./assets/player_jump.png", import.meta.url).href,
  npc: new URL("./assets/npc.png", import.meta.url).href,
  interact: new URL("./assets/interact.png", import.meta.url).href,
};

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
    x: 640,
    y: world.groundLevel - 192,
    width: 56,
    height: 56,
    message: "Comet: Systems are stable! Want to initiate a star chart sync?",
  },
  {
    id: "npc",
    x: 1180,
    y: world.groundLevel - 156,
    width: 56,
    height: 64,
    message: "Orion: The jump drive is ready whenever the crew is!",
  },
  {
    id: "terminal",
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
  const [background, foreground, playerIdle, playerJump, npc, interact] = await Promise.all(
    Object.values(assets).map((src) => loadImage(src))
  );
  parallaxLayers.push({ image: background, factor: 0.2 });
  parallaxLayers.push({ image: foreground, factor: 0.5 });
  return { background, foreground, playerIdle, playerJump, npc, interact };
}

function appendChatLine(text) {
  const line = document.createElement("div");
  line.className = "chat-line";
  line.textContent = text;
  hudChat.appendChild(line);
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

function updatePlayer(delta, textures) {
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

  if (keys.get("Space") && player.onGround) {
    player.vy = jumpVelocity;
    player.onGround = false;
    player.state = "jump";
  }

  player.vy += world.gravity * delta;

  player.x += player.vx * delta;
  player.y += player.vy * delta;

  // Horizontal bounds
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

  const now = performance.now();
  const interactPressed = keys.get("Space");
  interactables.forEach((object) => {
    if (inRange(player, object) && interactPressed && now - player.lastInteraction > 600) {
      player.lastInteraction = now;
      hudQuest.dataset.locked = "true";
      hudQuest.textContent = "Objective updated: Check the chat log for your next task.";
      appendChatLine(object.message);
    }
  });

  if (!interactPressed && now - player.lastInteraction > 1500) {
    hudQuest.dataset.locked = "false";
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
    ctx.drawImage(textures.npc, object.x, object.y, object.width, object.height);
    if (inRange(player, object)) {
      ctx.drawImage(textures.interact, object.x + object.width / 2 - 20, object.y - 28, 40, 40);
    }
  });
  ctx.restore();
}

function updateCamera() {
  const target = player.x + player.width / 2 - canvas.width / 2;
  const max = world.width - canvas.width;
  camera.x += (Math.min(Math.max(target, 0), max) - camera.x) * 0.12;
}

let previousTimestamp = performance.now();

async function start() {
  populateRoster();
  appendChatLine("Nova: Welcome to the lobby! Feel free to explore.");
  const textures = await loadAssets();

  function frame(now) {
    const delta = Math.min((now - previousTimestamp) / 1000, 0.05);
    previousTimestamp = now;

    updatePlayer(delta, textures);
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
});
