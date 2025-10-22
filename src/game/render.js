const activeEffects = [];

const VIDEO_PARALLAX_FACTOR = 0.18;
const VIDEO_PARALLAX_RANGE = 48;

function getCurrentTime() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function queueEffect(effect) {
  if (!effect || typeof effect !== "object") {
    return;
  }
  if (typeof effect.startedAt !== "number") {
    effect.startedAt = getCurrentTime();
  }
  if (typeof effect.duration !== "number" || effect.duration <= 0) {
    return;
  }
  activeEffects.push(effect);
}

export function createParticleBurstEffect(originX, originY, options = {}) {
  const now = getCurrentTime();
  const count = Math.max(1, Math.floor(options.count ?? 12));
  const duration = Math.max(16, options.duration ?? 480);
  const palette = Array.isArray(options.palette) && options.palette.length > 0
    ? options.palette
    : ["rgba(220, 255, 244, 0.85)"];
  const baseAngle = typeof options.baseAngle === "number" ? options.baseAngle : -Math.PI / 2;
  const spread = typeof options.spread === "number" ? options.spread : Math.PI * 2;
  const speedMin = typeof options.speedMin === "number" ? options.speedMin : 60;
  const speedMax = typeof options.speedMax === "number" ? options.speedMax : 160;
  const sizeMin = typeof options.sizeMin === "number" ? options.sizeMin : 1.5;
  const sizeMax = typeof options.sizeMax === "number" ? options.sizeMax : 3.5;
  const gravity = typeof options.gravity === "number" ? options.gravity : 0;
  const fade = options.fade !== false;

  const particles = Array.from({ length: count }, () => {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const speed = speedMin + Math.random() * Math.max(0, speedMax - speedMin);
    const size = sizeMin + Math.random() * Math.max(0, sizeMax - sizeMin);
    const color = palette[Math.floor(Math.random() * palette.length)] ?? palette[0];
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: duration,
      size,
      color
    };
  });

  return {
    type: "particleBurst",
    originX,
    originY,
    duration,
    startedAt: now,
    gravity,
    fade,
    particles
  };
}

export function createScreenShakeEffect(options = {}) {
  const now = getCurrentTime();
  const duration = Math.max(16, options.duration ?? 300);
  const magnitude = typeof options.magnitude === "number" ? options.magnitude : 6;
  const frequency = typeof options.frequency === "number" ? options.frequency : 11;
  return {
    type: "screenShake",
    duration,
    startedAt: now,
    magnitude,
    frequency,
    seedX: Math.random() * Math.PI * 2,
    seedY: Math.random() * Math.PI * 2
  };
}

export function createJumpDustEffect(x, y) {
  return createParticleBurstEffect(x, y, {
    count: 10,
    duration: 360,
    palette: ["rgba(120, 230, 210, 0.5)", "rgba(190, 255, 240, 0.65)"],
    baseAngle: -Math.PI / 2,
    spread: Math.PI * 0.75,
    speedMin: 80,
    speedMax: 180,
    gravity: 420,
    sizeMin: 1.5,
    sizeMax: 3.2
  });
}

export function createCrystalBurstEffect(x, y) {
  return createParticleBurstEffect(x, y, {
    count: 14,
    duration: 520,
    palette: [
      "rgba(120, 255, 230, 0.9)",
      "rgba(180, 255, 250, 0.95)",
      "rgba(255, 255, 255, 0.8)"
    ],
    baseAngle: -Math.PI / 2,
    spread: Math.PI * 1.5,
    speedMin: 90,
    speedMax: 200,
    gravity: 60,
    sizeMin: 1.2,
    sizeMax: 2.8
  });
}

export function createPortalActivationEffect(x, y) {
  return createParticleBurstEffect(x, y, {
    count: 26,
    duration: 640,
    palette: [
      "rgba(130, 245, 255, 0.95)",
      "rgba(90, 170, 255, 0.85)",
      "rgba(200, 255, 255, 0.75)"
    ],
    baseAngle: -Math.PI / 2,
    spread: Math.PI * 2,
    speedMin: 120,
    speedMax: 260,
    gravity: 120,
    sizeMin: 1.8,
    sizeMax: 3.8
  });
}

function getScreenShakeOffset(now) {
  let offsetX = 0;
  let offsetY = 0;
  for (const effect of activeEffects) {
    if (effect.type !== "screenShake") {
      continue;
    }
    const elapsed = now - effect.startedAt;
    if (elapsed < 0 || elapsed >= effect.duration) {
      continue;
    }
    const decay = 1 - elapsed / effect.duration;
    const frequency = effect.frequency ?? 11;
    const timeSeconds = elapsed / 1000;
    offsetX += Math.sin(timeSeconds * frequency * Math.PI * 2 + effect.seedX) * effect.magnitude * decay;
    offsetY += Math.cos(timeSeconds * (frequency * 0.8) * Math.PI * 2 + effect.seedY) * effect.magnitude * 0.6 * decay;
  }
  return { offsetX, offsetY };
}

function renderWorldEffects(ctx, now) {
  if (!activeEffects.length) {
    return;
  }
  for (const effect of activeEffects) {
    if (effect.type !== "particleBurst") {
      continue;
    }
    const elapsed = now - effect.startedAt;
    if (elapsed < 0 || elapsed >= effect.duration) {
      continue;
    }
    ctx.save();
    for (const particle of effect.particles) {
      const particleAge = Math.min(elapsed, particle.life);
      const seconds = particleAge / 1000;
      const fade = effect.fade ? 1 - particleAge / particle.life : 1;
      const alpha = Math.max(0, Math.min(1, fade));
      if (alpha <= 0) {
        continue;
      }
      const px = effect.originX + particle.vx * seconds;
      const py = effect.originY + particle.vy * seconds + (effect.gravity * seconds * seconds) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(px, py, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function cleanupExpiredEffects(now) {
  if (!activeEffects.length) {
    return;
  }
  for (let index = activeEffects.length - 1; index >= 0; index -= 1) {
    const effect = activeEffects[index];
    const elapsed = now - effect.startedAt;
    if (elapsed >= effect.duration) {
      activeEffects.splice(index, 1);
    }
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
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

function drawBackdropHaze(ctx, state, intensity = 1) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 1));
  if (clamped <= 0) {
    return;
  }

  const haze = ctx.createLinearGradient(0, 0, 0, state.viewport.height);
  const topAlpha = 0 * clamped;
  const middleAlpha = 0.18 * clamped;
  const bottomAlpha = 0.55 * clamped;
  haze.addColorStop(0, `rgba(9, 15, 32, ${topAlpha})`);
  haze.addColorStop(0.55, `rgba(9, 15, 32, ${middleAlpha})`);
  haze.addColorStop(1, `rgba(9, 15, 32, ${bottomAlpha})`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, state.viewport.width, state.viewport.height);
}

function normaliseVideoParallaxOffset(offset, range) {
  if (!Number.isFinite(offset) || !(range > 0)) {
    return 0;
  }

  const span = range * 2;
  let normalised = offset % span;
  if (normalised > range) {
    normalised -= span;
  } else if (normalised < -range) {
    normalised += span;
  }
  return normalised;
}

function drawParallaxBackgroundImage(ctx, state) {
  let drewLayer = false;

  for (const layer of state.parallaxLayers) {
    if (!layer.ready) {
      continue;
    }

    const { width: sourceWidth, height: sourceHeight } = layer.dimensions;
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
      continue;
    }

    const widthScale = state.viewport.width / sourceWidth;
    const heightScale = state.viewport.height / sourceHeight;
    const scale = Math.min(widthScale, heightScale);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;

    if (!(drawWidth > 0) || !(drawHeight > 0)) {
      continue;
    }

    let offsetY;
    if (layer.align === "bottom") {
      offsetY = state.viewport.height - drawHeight;
    } else if (layer.align === "top") {
      offsetY = 0;
    } else {
      offsetY = (state.viewport.height - drawHeight) / 2;
    }
    if (typeof layer.offsetY === "number" && Number.isFinite(layer.offsetY)) {
      offsetY += layer.offsetY;
    }

    const parallaxFactor = Number.isFinite(layer.speed) ? layer.speed : 0;
    const scrollOffset = state.wrapOffset(state.getParallaxScroll() * parallaxFactor, drawWidth);

    ctx.save();
    if (typeof layer.opacity === "number" && layer.opacity >= 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    }

    for (let x = -drawWidth; x <= state.viewport.width + drawWidth; x += drawWidth) {
      const drawX = Math.round(x - scrollOffset);
      ctx.drawImage(
        layer.image,
        0,
        0,
        sourceWidth,
        sourceHeight,
        drawX,
        offsetY,
        drawWidth,
        drawHeight
      );
    }

    ctx.restore();
    drewLayer = true;
  }

  if (!drewLayer) {
    return false;
  }

  drawBackdropHaze(ctx, state, 1);
  return true;
}

function drawGroundPlane(ctx, state) {
  const groundHeight = state.viewport.height - state.groundY;
  const baseGradient = ctx.createLinearGradient(0, state.groundY, 0, state.viewport.height);
  baseGradient.addColorStop(0, "#16312a");
  baseGradient.addColorStop(1, "#061612");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, state.groundY, state.viewport.width, groundHeight);

  const tileWidth = 76;
  const offset = state.wrapOffset(state.getParallaxScroll() * 1.24, tileWidth);
  for (let x = -tileWidth; x <= state.viewport.width + tileWidth; x += tileWidth) {
    const drawX = x - offset;
    const stripeGradient = ctx.createLinearGradient(drawX, state.groundY, drawX, state.groundY + groundHeight);
    stripeGradient.addColorStop(0, "rgba(124, 243, 216, 0.18)");
    stripeGradient.addColorStop(0.7, "rgba(30, 66, 52, 0.12)");
    stripeGradient.addColorStop(1, "rgba(10, 24, 20, 0)");
    ctx.fillStyle = stripeGradient;
    ctx.fillRect(drawX, state.groundY, tileWidth, groundHeight);

    const rimGradient = ctx.createLinearGradient(drawX, state.groundY - 6, drawX, state.groundY + 18);
    rimGradient.addColorStop(0, "rgba(200, 255, 244, 0.35)");
    rimGradient.addColorStop(1, "rgba(28, 64, 46, 0)");
    ctx.fillStyle = rimGradient;
    ctx.fillRect(drawX, state.groundY - 6, tileWidth, 24);
  }
}

function renderParallaxBackdrop(ctx, state) {
  const backgroundVideoState =
    typeof state.getBackgroundVideoState === "function"
      ? state.getBackgroundVideoState()
      : "disabled";
  const videoActive = backgroundVideoState === "active";

  const parallaxScroll =
    typeof state.getParallaxScroll === "function" ? state.getParallaxScroll() : 0;
  const rawVideoOffset = parallaxScroll * VIDEO_PARALLAX_FACTOR;
  const videoOffset = normaliseVideoParallaxOffset(rawVideoOffset, VIDEO_PARALLAX_RANGE);

  if (state.ui && typeof state.ui.setBackgroundParallaxOffset === "function") {
    const appliedOffset = videoActive ? -videoOffset : 0;
    const rounded = Math.round(appliedOffset * 1000) / 1000;
    state.ui.setBackgroundParallaxOffset(rounded);
  }

  if (videoActive) {
    ctx.clearRect(0, 0, state.viewport.width, state.viewport.height);
    drawBackdropHaze(ctx, state, 0.85);
  } else {
    ctx.fillStyle = state.getFallbackBackgroundGradient();
    ctx.fillRect(0, 0, state.viewport.width, state.viewport.height);
    const drewBackground = drawParallaxBackgroundImage(ctx, state);
    if (!drewBackground) {
      drawBackdropHaze(ctx, state, 1);
    }
  }

  drawGroundPlane(ctx, state);
}

function drawPortal(ctx, state, portalInstance, time) {
  const { x: portalX, y: portalY, width: portalWidth, height: portalHeight } = portalInstance;
  const framePulse = (Math.sin(time * (state.isPortalCharged() ? 4.4 : 2.2)) + 1) / 2;
  const archColor = state.isPortalCharged() ? "#4a2f7f" : "#384d6b";
  const glowInner = state.isPortalCharged() ? "rgba(160, 255, 245, 0.95)" : "rgba(150, 205, 255, 0.65)";
  const glowOuter = state.isPortalCharged() ? "rgba(90, 220, 200, 0.35)" : "rgba(100, 140, 220, 0.1)";

  ctx.save();
  ctx.fillStyle = archColor;
  drawRoundedRect(ctx, portalX - 12, portalY - 12, portalWidth + 24, portalHeight + 24, 24);

  const glowGradient = ctx.createRadialGradient(
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    10,
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    portalWidth / 2
  );
  glowGradient.addColorStop(0, glowInner);
  glowGradient.addColorStop(1, glowOuter);
  ctx.fillStyle = glowGradient;
  ctx.globalAlpha = state.isPortalCharged() ? 1 : 0.85;
  drawRoundedRect(ctx, portalX, portalY, portalWidth, portalHeight, 20);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = state.isPortalCharged()
    ? `rgba(230, 250, 255, ${0.55 + framePulse * 0.25})`
    : `rgba(200, 240, 255, 0.55)`;
  ctx.lineWidth = 4;
  ctx.strokeRect(portalX + 12, portalY + 12, portalWidth - 24, portalHeight - 24);

  const pulse = (Math.sin(time * (state.isPortalCharged() ? 5.2 : 2.4)) + 1) / 2;
  const ellipseColor = state.isPortalCharged()
    ? `rgba(120, 255, 225, ${0.5 + pulse * 0.4})`
    : `rgba(180, 230, 255, ${0.35 + pulse * 0.35})`;
  ctx.lineWidth = state.isPortalCharged() ? 4 : 3;
  ctx.strokeStyle = ellipseColor;
  ctx.beginPath();
  ctx.ellipse(
    portalX + portalWidth / 2,
    portalY + portalHeight / 2,
    24 + pulse * (state.isPortalCharged() ? 14 : 8),
    60 + pulse * (state.isPortalCharged() ? 20 : 12),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  if (state.isPortalCharged()) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    for (let i = 0; i < 6; i += 1) {
      const angle = time * 1.6 + (i * Math.PI) / 3;
      const radius = 32 + framePulse * 12;
      const orbX = portalX + portalWidth / 2 + Math.cos(angle) * radius;
      const orbY = portalY + portalHeight / 2 + Math.sin(angle) * (radius * 0.6);
      const orbSize = 6 + Math.sin(time * 4 + i) * 2;
      ctx.beginPath();
      ctx.arc(orbX, orbY, orbSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPlayer(ctx, state, entity, time) {
  ctx.save();
  ctx.translate(entity.x + entity.width / 2, entity.y + entity.height);
  ctx.scale(entity.direction, 1);
  ctx.translate(-entity.width / 2, -entity.height);

  const appearance = entity.appearance ?? state.playerAppearance;

  if (state.playerSpriteState.isReady()) {
    const spriteImage = state.playerSpriteState.image;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      spriteImage,
      0,
      0,
      spriteImage.width,
      spriteImage.height,
      0,
      0,
      entity.width,
      entity.height
    );
  } else {
    ctx.fillStyle = appearance.shirt;
    drawRoundedRect(ctx, 4, 12, entity.width - 8, entity.height - 18, 6);

    ctx.fillStyle = appearance.skin;
    drawRoundedRect(ctx, 6, 0, entity.width - 12, 18, 6);

    ctx.fillStyle = appearance.hair;
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

function drawPromptBubble(ctx, state, text, entity) {
  if (!text) {
    return;
  }

  const target = entity ?? state.player;
  const targetWidth = typeof target.width === "number" ? target.width : 0;
  const targetX = (typeof target.x === "number" ? target.x : 0) - state.getCameraScrollX();
  const centerX = targetX + targetWidth / 2;
  ctx.save();
  ctx.font = state.promptFont;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const metrics = state.getPromptMetrics(text);
  const paddingX = 18;
  const paddingY = 14;
  const tailHeight = 18;
  const tailHalfWidth = 20;
  const radius = 24;
  const bubbleWidth = metrics.width + paddingX * 2;
  const minimumHeight = 48;
  const bubbleHeight = Math.max(metrics.height + paddingY * 2, minimumHeight);
  const anchorTop =
    typeof target.promptAnchorY === "number" ? target.promptAnchorY : target.y ?? 0;
  const anchorHeight = target.height ?? 0;
  const tailGap = Math.min(14, Math.max(6, anchorHeight ? anchorHeight * 0.12 : 8));
  const marginX = 18;
  let bubbleX = centerX - bubbleWidth / 2;
  bubbleX = Math.max(marginX, Math.min(bubbleX, state.viewport.width - bubbleWidth - marginX));
  let bubbleY = anchorTop - bubbleHeight - tailHeight - tailGap;
  bubbleY = Math.max(18, bubbleY);
  const tailBaseY = bubbleY + bubbleHeight;
  const tailTipX = Math.max(
    bubbleX + radius + 6,
    Math.min(centerX, bubbleX + bubbleWidth - radius - 6)
  );
  const tailTipY = Math.max(
    tailBaseY + 6,
    Math.min(tailBaseY + tailHeight, anchorTop - Math.max(2, tailGap * 0.5))
  );

  const traceBubblePath = () => {
    ctx.beginPath();
    ctx.moveTo(bubbleX + radius, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
    ctx.quadraticCurveTo(
      bubbleX + bubbleWidth,
      bubbleY,
      bubbleX + bubbleWidth,
      bubbleY + radius
    );
    ctx.lineTo(bubbleX + bubbleWidth, tailBaseY - radius);
    ctx.quadraticCurveTo(
      bubbleX + bubbleWidth,
      tailBaseY,
      bubbleX + bubbleWidth - radius,
      tailBaseY
    );
    ctx.lineTo(tailTipX + tailHalfWidth, tailBaseY);
    ctx.lineTo(tailTipX, tailTipY);
    ctx.lineTo(tailTipX - tailHalfWidth, tailBaseY);
    ctx.lineTo(bubbleX + radius, tailBaseY);
    ctx.quadraticCurveTo(bubbleX, tailBaseY, bubbleX, tailBaseY - radius);
    ctx.lineTo(bubbleX, bubbleY + radius);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
    ctx.closePath();
  };

  ctx.save();
  ctx.shadowColor = "rgba(35, 20, 68, 0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;
  traceBubblePath();
  const fillGradient = ctx.createLinearGradient(
    bubbleX,
    bubbleY,
    bubbleX,
    tailBaseY
  );
  fillGradient.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  fillGradient.addColorStop(1, "rgba(255, 223, 246, 0.96)");
  ctx.fillStyle = fillGradient;
  ctx.fill();
  ctx.restore();

  ctx.save();
  traceBubblePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2f47ff";
  ctx.stroke();
  ctx.restore();

  const innerRadius = Math.max(12, radius - 6);
  const innerX = bubbleX + 14;
  const innerY = bubbleY + 12;
  const innerWidth = Math.max(0, bubbleWidth - 28);
  const innerHeight = Math.max(0, bubbleHeight - 24);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(innerX + innerRadius, innerY);
  ctx.lineTo(innerX + innerWidth - innerRadius, innerY);
  ctx.quadraticCurveTo(
    innerX + innerWidth,
    innerY,
    innerX + innerWidth,
    innerY + innerRadius
  );
  ctx.lineTo(innerX + innerWidth, innerY + innerHeight - innerRadius);
  ctx.quadraticCurveTo(
    innerX + innerWidth,
    innerY + innerHeight,
    innerX + innerWidth - innerRadius,
    innerY + innerHeight
  );
  ctx.lineTo(innerX + innerRadius, innerY + innerHeight);
  ctx.quadraticCurveTo(innerX, innerY + innerHeight, innerX, innerY + innerHeight - innerRadius);
  ctx.lineTo(innerX, innerY + innerRadius);
  ctx.quadraticCurveTo(innerX, innerY, innerX + innerRadius, innerY);
  ctx.closePath();
  const innerFill = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerHeight);
  innerFill.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  innerFill.addColorStop(1, "rgba(245, 235, 255, 0.96)");
  ctx.fillStyle = innerFill;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#2f47ff";
  ctx.font = state.promptFont;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const textX = innerX + 4;
  const textY = innerY + innerHeight - 12;
  ctx.shadowColor = "rgba(35, 20, 68, 0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, textX, textY);
  ctx.restore();

  ctx.restore();
}

function drawBulletin(ctx, board, time) {
  ctx.save();
  ctx.translate(board.x, board.y);
  const pulse = (Math.sin(time * 2.2) + 1) / 2;
  ctx.fillStyle = "#1d253f";
  drawRoundedRect(ctx, 0, 10, board.width, board.height - 10, 10);
  ctx.fillStyle = "#151c2c";
  ctx.fillRect(6, board.height - 12, 12, 12);
  ctx.fillRect(board.width - 18, board.height - 12, 12, 12);
  ctx.fillStyle = `rgba(120, 150, 255, ${0.35 + pulse * 0.25})`;
  drawRoundedRect(ctx, 8, 16, board.width - 16, board.height - 38, 8);
  ctx.fillStyle = "rgba(15, 20, 40, 0.85)";
  drawRoundedRect(ctx, 14, 24, board.width - 28, 32, 6);
  ctx.fillStyle = "rgba(215, 230, 255, 0.82)";
  ctx.fillRect(20, 30, board.width - 40, 6);
  ctx.fillRect(20, 40, board.width - 56, 4);
  ctx.fillStyle = `rgba(255, 200, 255, ${0.3 + pulse * 0.3})`;
  ctx.fillRect(20, 48, board.width - 40, 4);
  ctx.fillStyle = `rgba(140, 200, 255, ${0.35 + pulse * 0.35})`;
  drawRoundedRect(ctx, 14, board.height - 28, board.width - 28, 10, 4);
  ctx.restore();
}

function drawChest(ctx, state, chest) {
  ctx.save();
  ctx.translate(chest.x, chest.y);
  if (state.sprites.chestSprite.isReady() && state.sprites.chestSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      state.sprites.chestSprite.image,
      0,
      0,
      state.sprites.chestSprite.image.width,
      state.sprites.chestSprite.image.height,
      0,
      0,
      chest.width,
      chest.height
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = chest.opened ? "#a77b3b" : "#c58f3d";
  drawRoundedRect(ctx, 0, 10, chest.width, chest.height - 10, 6);
  ctx.fillStyle = chest.opened ? "#8a5f23" : "#a16b22";
  drawRoundedRect(ctx, 0, 0, chest.width, 18, 6);
  ctx.fillStyle = "#f7d774";
  ctx.fillRect(chest.width / 2 - 4, 18, 8, 10);
  ctx.restore();
}

function drawArcade(ctx, state, cabinet, time) {
  ctx.save();
  ctx.translate(cabinet.x, cabinet.y);
  if (state.sprites.arcadeSprite.isReady() && state.sprites.arcadeSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      state.sprites.arcadeSprite.image,
      0,
      0,
      state.sprites.arcadeSprite.image.width,
      state.sprites.arcadeSprite.image.height,
      0,
      0,
      cabinet.width,
      cabinet.height
    );
    ctx.restore();
    return;
  }

  const glow = (Math.sin(time * 3.1) + 1) / 2;
  ctx.fillStyle = "#1a1d33";
  drawRoundedRect(ctx, 0, 8, cabinet.width, cabinet.height - 8, 10);
  ctx.fillStyle = "#2c3563";
  drawRoundedRect(ctx, 4, 16, cabinet.width - 8, cabinet.height - 24, 8);
  const screenHeight = Math.min(56, cabinet.height * 0.48);
  ctx.fillStyle = `rgba(110, 205, 255, ${0.3 + glow * 0.45})`;
  drawRoundedRect(ctx, 12, 24, cabinet.width - 24, screenHeight, 6);
  ctx.fillStyle = "#040713";
  drawRoundedRect(ctx, 14, 26, cabinet.width - 28, screenHeight - 8, 5);
  ctx.fillStyle = `rgba(255, 188, 255, ${0.4 + glow * 0.35})`;
  drawRoundedRect(cabinet.width / 2 - 18, cabinet.height - 48, 36, 18, 6);
  ctx.fillStyle = `rgba(255, 214, 126, ${0.7 + glow * 0.2})`;
  ctx.beginPath();
  ctx.arc(cabinet.width / 2 - 26, cabinet.height - 34, 6, 0, Math.PI * 2);
  ctx.arc(cabinet.width / 2 + 26, cabinet.height - 34, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFountain(ctx, state, fountain, time) {
  ctx.save();
  ctx.translate(fountain.x, fountain.y);
  if (state.sprites.fountainSprite.isReady() && state.sprites.fountainSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      state.sprites.fountainSprite.image,
      0,
      0,
      state.sprites.fountainSprite.image.width,
      state.sprites.fountainSprite.image.height,
      0,
      0,
      fountain.width,
      fountain.height
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#3c4a62";
  drawRoundedRect(ctx, 0, fountain.height - 18, fountain.width, 18, 8);
  ctx.fillStyle = "#556b8f";
  drawRoundedRect(ctx, 6, 14, fountain.width - 12, fountain.height - 32, 10);
  const pulse = (Math.sin(time * 2) + 1) / 2;
  const waterHeight = Math.max(22, fountain.height * 0.45);
  const waterGradient = ctx.createLinearGradient(0, fountain.height - waterHeight, 0, fountain.height);
  waterGradient.addColorStop(0, `rgba(120, 230, 255, ${0.3 + pulse * 0.2})`);
  waterGradient.addColorStop(1, `rgba(40, 120, 255, ${0.45 + pulse * 0.25})`);
  ctx.fillStyle = waterGradient;
  drawRoundedRect(ctx, 8, fountain.height - waterHeight - 6, fountain.width - 16, waterHeight, 8);
  ctx.restore();
}

function drawGuide(ctx, state, guide, time) {
  ctx.save();
  ctx.translate(guide.x, guide.y);
  if (state.sprites.guideSprite.isReady() && state.sprites.guideSprite.image) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      state.sprites.guideSprite.image,
      0,
      0,
      state.sprites.guideSprite.image.width,
      state.sprites.guideSprite.image.height,
      0,
      0,
      guide.width,
      guide.height
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#f4dede";
  drawRoundedRect(ctx, 4, 8, guide.width - 8, guide.height - 12, 10);
  ctx.fillStyle = "#dba6ff";
  drawRoundedRect(ctx, 8, guide.height - 28, guide.width - 16, 20, 8);
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

function drawComms(ctx, consoleUnit, time) {
  ctx.save();
  ctx.translate(consoleUnit.x, consoleUnit.y);
  const pulse = (Math.sin(time * 3.4) + 1) / 2;
  ctx.fillStyle = "#1c273a";
  drawRoundedRect(ctx, 0, 12, consoleUnit.width, consoleUnit.height - 12, 12);
  ctx.fillStyle = "#2f3f62";
  drawRoundedRect(ctx, 6, 0, consoleUnit.width - 12, 36, 10);
  ctx.fillStyle = `rgba(110, 215, 255, ${0.45 + pulse * 0.35})`;
  drawRoundedRect(ctx, 12, 8, consoleUnit.width - 24, 22, 8);
  ctx.strokeStyle = `rgba(140, 200, 255, ${0.6 + pulse * 0.2})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(consoleUnit.width / 2, -6);
  ctx.lineTo(consoleUnit.width / 2, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(consoleUnit.width / 2, -8, 6 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(90, 255, 200, ${0.3 + pulse * 0.4})`;
  drawRoundedRect(ctx, 10, consoleUnit.height - 20, consoleUnit.width - 20, 10, 4);
  ctx.restore();
}

function drawCrystal(ctx, state, crystal, time) {
  ctx.save();
  ctx.translate(crystal.x, crystal.y);
  if (state.sprites.crystalSprite.isReady() && state.sprites.crystalSprite.image) {
    const targetSize = crystal.radius * 2 + 12;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      state.sprites.crystalSprite.image,
      0,
      0,
      state.sprites.crystalSprite.image.width,
      state.sprites.crystalSprite.image.height,
      -targetSize / 2,
      -targetSize / 2,
      targetSize,
      targetSize
    );
    ctx.restore();
    return;
  }
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

export function render(ctx, state, timestamp) {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? timestamp
      : Date.now();
  const time = timestamp / 1000;
  const shakeOffset = getScreenShakeOffset(now);

  const renderScale = state.getRenderScale();
  const devicePixelScale = state.getDevicePixelScale();

  ctx.setTransform(
    renderScale * devicePixelScale,
    0,
    0,
    renderScale * devicePixelScale,
    0,
    0
  );

  renderParallaxBackdrop(ctx, state);

  ctx.save();
  const cameraScrollX = state.getCameraScrollX();
  ctx.translate(-cameraScrollX + shakeOffset.offsetX, shakeOffset.offsetY);

  const renderOffsets = state.getWorldWrapOffsetsForView(cameraScrollX, state.viewport.width);

  if (state.platformSprite.isReady() && state.platformSprite.image) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const offset of renderOffsets) {
      for (const platform of state.platforms) {
        const platformX = platform.x + offset;
        if (!state.isWorldInstanceVisible(platformX, platform.width, cameraScrollX)) {
          continue;
        }
        ctx.drawImage(
          state.platformSprite.image,
          0,
          0,
          state.platformSprite.image.width,
          state.platformSprite.image.height,
          platformX,
          platform.y,
          platform.width,
          platform.height
        );
      }
    }
    ctx.restore();
  } else {
    ctx.fillStyle = "#3b5e3f";
    for (const offset of renderOffsets) {
      for (const platform of state.platforms) {
        const platformX = platform.x + offset;
        if (!state.isWorldInstanceVisible(platformX, platform.width, cameraScrollX)) {
          continue;
        }
        drawRoundedRect(ctx, platformX, platform.y, platform.width, platform.height, 6);
      }
    }
  }

  for (const offset of renderOffsets) {
    const portalInstance = state.createWorldInstance(state.portal, offset);
    if (!state.isWorldInstanceVisible(portalInstance.x, portalInstance.width, cameraScrollX)) {
      continue;
    }
    drawPortal(ctx, state, portalInstance, time);
  }

  for (const offset of renderOffsets) {
    for (const interactable of state.interactables) {
      const instance = state.createWorldInstance(interactable, offset);
      if (!state.isWorldInstanceVisible(instance.x, instance.width ?? instance.radius * 2 ?? 0, cameraScrollX, 64)) {
        continue;
      }
      if (interactable.type === "bulletin") {
        drawBulletin(ctx, instance, time);
      } else if (interactable.type === "chest") {
        drawChest(ctx, state, instance);
      } else if (interactable.type === "arcade") {
        drawArcade(ctx, state, instance, time);
      } else if (interactable.type === "fountain") {
        drawFountain(ctx, state, instance, time);
      } else if (interactable.type === "npc") {
        drawGuide(ctx, state, instance, time);
      } else if (interactable.type === "comms") {
        drawComms(ctx, instance, time);
      }
    }
  }

  for (const offset of renderOffsets) {
    for (const crystal of state.crystals) {
      if (crystal.collected) {
        continue;
      }
      const instance = state.createWorldInstance(crystal, offset);
      if (
        !state.isWorldInstanceVisible(
          instance.x - instance.radius,
          instance.radius * 2,
          cameraScrollX,
          64
        )
      ) {
        continue;
      }
      drawCrystal(ctx, state, instance, time);
    }
  }

  drawPlayer(ctx, state, state.player, time);

  renderWorldEffects(ctx, now);

  ctx.restore();

  const layoutEditor = state.getLayoutEditor();
  if (layoutEditor && typeof layoutEditor.drawOverlay === "function" && layoutEditor.isActive()) {
    layoutEditor.drawOverlay(ctx);
  }

  if (state.ui.promptText) {
    drawPromptBubble(ctx, state, state.ui.promptText, state.ui.promptEntity || state.player);
  }

  cleanupExpiredEffects(now);
}

export function createRender(state) {
  return (ctx, timestamp) => render(ctx, state, timestamp);
}
