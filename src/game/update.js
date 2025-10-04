export function wrapOffset(value, length) {
  if (!Number.isFinite(length) || length === 0) {
    return 0;
  }
  let remainder = value % length;
  if (remainder < 0) {
    remainder += length;
  }
  return remainder;
}

export function getWorldLoopOrigin(value, worldWrapWidth) {
  if (!Number.isFinite(worldWrapWidth) || worldWrapWidth <= 0) {
    return 0;
  }
  const wrapped = wrapOffset(value, worldWrapWidth);
  return value - wrapped;
}

export function getWorldOffsetsAround(value, worldWrapWidth, scratch = []) {
  if (!Number.isFinite(worldWrapWidth) || worldWrapWidth <= 0) {
    scratch.length = 1;
    scratch[0] = 0;
    return scratch;
  }
  const origin = getWorldLoopOrigin(value, worldWrapWidth);
  scratch.length = 3;
  scratch[0] = origin - worldWrapWidth;
  scratch[1] = origin;
  scratch[2] = origin + worldWrapWidth;
  return scratch;
}

export function getWorldWrapOffsetsForView(
  cameraOffset,
  viewportWidth,
  worldWrapWidth,
  scratch = [],
  margin = 0
) {
  if (!Number.isFinite(worldWrapWidth) || worldWrapWidth <= 0) {
    scratch.length = 1;
    scratch[0] = 0;
    return scratch;
  }
  const cameraLeft = cameraOffset - margin;
  const cameraRight = cameraOffset + viewportWidth + margin;
  const startIndex = Math.floor(cameraLeft / worldWrapWidth);
  const endIndex = Math.floor(cameraRight / worldWrapWidth);
  scratch.length = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    scratch.push(index * worldWrapWidth);
  }
  if (scratch.length === 0) {
    scratch.push(0);
  }
  return scratch;
}

export function isNear(playerEntity, object, padding) {
  return (
    playerEntity.x < object.x + object.width + padding &&
    playerEntity.x + playerEntity.width > object.x - padding &&
    playerEntity.y < object.y + object.height + padding &&
    playerEntity.y + playerEntity.height > object.y - padding
  );
}

export function createUpdate({
  state,
  world,
  movementHint,
  input,
  ui,
  audio,
  notifyFirstSessionChecklist,
  showMessage,
  gainExperience,
  completeMission,
  openMiniGame,
  effects,
  updateCameraScrollPosition,
  constants,
  utils
}) {
  if (!state || !world || !movementHint || !input) {
    throw new Error("createUpdate requires state, world, movementHint, and input dependencies");
  }

  const {
    queueEffect,
    createJumpDustEffect,
    createCrystalBurstEffect,
    createPortalActivationEffect,
    createScreenShakeEffect
  } = effects;

  return function update(delta) {
    const portalWasCharged = state.isPortalCharged();
    const previousY = state.player.y;

    if (state.isMiniGameActive()) {
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.onGround = true;
      ui.setPrompt("");
      movementHint.dismiss();
      return;
    }

    const layoutEditor = state.getLayoutEditor();
    if (layoutEditor && typeof layoutEditor.isActive === "function" && layoutEditor.isActive()) {
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.onGround = true;
      ui.setPrompt("");
      movementHint.dismiss();
      return;
    }

    const moveLeft = input.keys.has("ArrowLeft") || input.keys.has("KeyA");
    const moveRight = input.keys.has("ArrowRight") || input.keys.has("KeyD");
    const jumpPressed =
      input.wasKeyJustPressed("Space") ||
      input.wasKeyJustPressed("ArrowUp") ||
      input.wasKeyJustPressed("KeyW");

    const jumpHeld = input.keys.has("Space") || input.keys.has("ArrowUp") || input.keys.has("KeyW");
    const horizontalHeld =
      moveLeft ||
      moveRight ||
      input.keys.has("ArrowLeft") ||
      input.keys.has("ArrowRight") ||
      input.keys.has("KeyA") ||
      input.keys.has("KeyD");
    const hasMovementOrJumpInput = horizontalHeld || jumpHeld || jumpPressed;

    if (hasMovementOrJumpInput) {
      if (movementHint.isVisible()) {
        movementHint.dismiss();
      } else {
        movementHint.setIdleTime(0);
      }
    } else if (!movementHint.isAcknowledged() && !movementHint.wasShownThisSession()) {
      movementHint.setIdleTime(
        Math.min(
          movementHint.getIdleTime() + delta,
          constants.MOVEMENT_HINT_IDLE_THRESHOLD * 2
        )
      );
    }

    const acceleration = 0.35 * (delta / 16.666);
    const maxSpeed = 4.2;
    const friction = 0.82;
    const gravity = 0.52 * (delta / 16.666);

    if (moveLeft && !moveRight) {
      state.player.vx = Math.max(state.player.vx - acceleration, -maxSpeed);
      state.player.direction = -1;
    } else if (moveRight && !moveLeft) {
      state.player.vx = Math.min(state.player.vx + acceleration, maxSpeed);
      state.player.direction = 1;
    } else {
      state.player.vx *= friction;
      if (Math.abs(state.player.vx) < 0.01) {
        state.player.vx = 0;
      }
    }

    if (jumpPressed && state.player.onGround) {
      state.player.vy = -10.8;
      state.player.onGround = false;
      audio.playEffect("jump");
      queueEffect(
        createJumpDustEffect(state.player.x + state.player.width / 2, state.player.y + state.player.height)
      );
    }

    state.player.vy += gravity;
    state.player.x += state.player.vx * (delta / 16.666);
    state.player.y += state.player.vy * (delta / 16.666);
    state.player.onGround = false;

    if (state.player.y + state.player.height >= state.groundY) {
      state.player.y = state.groundY - state.player.height;
      state.player.vy = 0;
      state.player.onGround = true;
    }

    if (constants.PARALLAX_IDLE_SCROLL_SPEED === 0) {
      state.setParallaxScroll(0);
    } else {
      let parallaxScroll =
        state.getParallaxScroll() + constants.PARALLAX_IDLE_SCROLL_SPEED * (delta / 16.666);
      if (!Number.isFinite(parallaxScroll)) {
        parallaxScroll = 0;
      } else if (parallaxScroll > 10000 || parallaxScroll < -10000) {
        parallaxScroll = wrapOffset(parallaxScroll, 10000);
        if (parallaxScroll > 5000) {
          parallaxScroll -= 10000;
        }
      }
      state.setParallaxScroll(parallaxScroll);
    }

    updateCameraScrollPosition();

    if (
      !movementHint.isAcknowledged() &&
      !movementHint.isVisible() &&
      !movementHint.wasShownThisSession() &&
      movementHint.getIdleTime() >= constants.MOVEMENT_HINT_IDLE_THRESHOLD
    ) {
      movementHint.setShownThisSession(true);
      movementHint.setVisible(true);
    }

    const platformOffsets = world.getWorldOffsetsAround(state.player.x);
    for (const offset of platformOffsets) {
      for (const platform of state.platforms) {
        const platformX = platform.x + offset;
        const isAbovePlatform = previousY + state.player.height <= platform.y;
        const isWithinX =
          state.player.x + state.player.width > platformX &&
          state.player.x < platformX + platform.width;

        if (state.player.vy >= 0 && isAbovePlatform && isWithinX) {
          const bottom = state.player.y + state.player.height;
          if (bottom >= platform.y && bottom <= platform.y + platform.height + 4) {
            state.player.y = platform.y - state.player.height;
            state.player.vy = 0;
            state.player.onGround = true;
          }
        }
      }
    }

    let promptText = "";
    let promptTarget = null;

    const crystalOffsets = world.getWorldOffsetsAround(state.player.x);
    for (const offset of crystalOffsets) {
      for (const crystal of state.crystals) {
        if (crystal.collected) continue;

        const crystalX = crystal.x + offset;
        const overlapX =
          state.player.x + state.player.width > crystalX - crystal.radius &&
          state.player.x < crystalX + crystal.radius;
        const overlapY =
          state.player.y + state.player.height > crystal.y - crystal.radius &&
          state.player.y < crystal.y + crystal.radius;

        if (overlapX && overlapY) {
          crystal.collected = true;
          audio.playEffect("crystal");
          queueEffect(createCrystalBurstEffect(crystalX, crystal.y));
          const hadNoCharge = state.getPortalCharge() === 0;
          notifyFirstSessionChecklist(constants.CHECKLIST_EVENTS.CRYSTAL_COLLECTED, {
            first: hadNoCharge,
            crystal
          });
          const now =
            typeof performance !== "undefined" && typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          if (hadNoCharge) {
            state.setCrystalRunStartTime(now);
          }
          const portalCharge = Math.min(state.getPortalCharge() + 1, state.crystals.length);
          state.setPortalCharge(portalCharge);
          ui.updateCrystals(portalCharge, state.crystals.length);
          const fullyCharged = portalCharge === state.crystals.length;
          if (fullyCharged) {
            if (!portalWasCharged) {
              audio.playEffect("portalCharge");
            }
            state.setPortalCharged(true);
          }
          const leveledUpFromCrystal = gainExperience(60);
          const levelUpNotices = new Set();
          if (!fullyCharged && leveledUpFromCrystal) {
            levelUpNotices.add(`Level up! You reached level ${state.playerStats.level}.`);
          }
          const messageParts = [];
          if (fullyCharged) {
            const portalReady = state.playerStats.level >= state.portalRequiredLevel;
            messageParts.push(
              portalReady
                ? "The final crystal ignites the portal! +60 EXP. Return and press E to travel onward."
                : `The final crystal ignites the portal! +60 EXP. Reach Level ${state.portalRequiredLevel} before entering.`
            );
          } else {
            messageParts.push("Crystal energy surges through you! +60 EXP.");
          }

          const highlightParts = [];
          if (fullyCharged) {
            const chargeMission = completeMission("mission-crystal-charge");
            if (chargeMission.completed) {
              const xpAward = chargeMission.mission?.xp ?? 0;
              const title = chargeMission.mission?.title ?? "Portal Mission";
              highlightParts.push(`Mission Complete: ${title}! +${xpAward} EXP.`);
              if (chargeMission.leveledUp) {
                levelUpNotices.add(`Level up! You reached level ${state.playerStats.level}.`);
              }
            } else if (chargeMission.locked) {
              const required = Math.max(1, chargeMission.mission?.requiredLevel ?? 1);
              highlightParts.push(`Train to Level ${required} to log the portal charge mission.`);
            }

            const runDurationMs = state.getCrystalRunStartTime() > 0 ? now - state.getCrystalRunStartTime() : 0;
            if (runDurationMs > 0) {
              const runSeconds = Math.max(0, Math.round(runDurationMs / 1000));
              highlightParts.push(`Crystal run time: ${runSeconds}s.`);
              if (runDurationMs <= constants.CRYSTAL_SPRINT_TARGET_MS) {
                const sprintMission = completeMission("mission-crystal-sprint");
                if (sprintMission.completed) {
                  const xpAward = sprintMission.mission?.xp ?? 0;
                  const title = sprintMission.mission?.title ?? "Crystal Sprint";
                  highlightParts.push(`Mission Complete: ${title}! +${xpAward} EXP.`);
                  if (sprintMission.leveledUp) {
                    levelUpNotices.add(`Level up! You reached level ${state.playerStats.level}.`);
                  }
                } else if (sprintMission.locked) {
                  const required = Math.max(1, sprintMission.mission?.requiredLevel ?? 1);
                  highlightParts.push(
                    `Reach Level ${required} to record sprint times on the mission board.`
                  );
                }
              }
            }
            state.setCrystalRunStartTime(0);
          }

          for (const notice of levelUpNotices) {
            highlightParts.push(notice);
          }

          const message = [...messageParts, ...highlightParts].join(" ");
          showMessage(
            {
              text: message,
              author: "Mission Log",
              channel: "mission"
            },
            fullyCharged ? 5800 : 4200
          );
          break;
        }
      }
    }

    const interactableOffsets = world.getWorldOffsetsAround(state.player.x);
    for (const offset of interactableOffsets) {
      for (const interactable of state.interactables) {
        const instance = world.createWorldInstance(interactable, offset);
        const near = world.isNear(state.player, instance, 24);
        if (!near) {
          continue;
        }

        if (interactable.type === "bulletin") {
          promptText = "Press E to review the bulletin board";
          promptTarget = instance;
          if (input.wasKeyJustPressed("KeyE")) {
            const result = completeMission(interactable.missionId);
            audio.playEffect("dialogue");
            if (result.completed) {
              const xpAward = result.mission?.xp ?? 0;
              let message =
                `You craft a triumphant enlistment post for the cosmos. +${xpAward} EXP.`;
              if (result.leveledUp) {
                message += ` Level up! You reached level ${state.playerStats.level}.`;
              }
              showMessage(
                { text: message, author: "Mission Log", channel: "mission" },
                5600
              );
            } else if (result.locked) {
              const required = Math.max(1, result.mission?.requiredLevel ?? 1);
              showMessage(
                {
                  text: `Level ${required} required before the bulletin board can log your official broadcast.`,
                  author: "Mission Log",
                  channel: "mission"
                },
                4200
              );
            } else if (result.alreadyComplete) {
              showMessage(
                {
                  text: "Your arrival announcement already glows across the bulletin board.",
                  author: "Mission Log",
                  channel: "mission"
                },
                4200
              );
            } else {
              showMessage(
                {
                  text: "Mission updates shimmer across the bulletin board display.",
                  author: "Mission Log",
                  channel: "mission"
                },
                3800
              );
            }
          }
        } else if (interactable.type === "chest") {
          promptText = "Press E to open the chest";
          promptTarget = instance;
          if (input.wasKeyJustPressed("KeyE")) {
            if (!interactable.opened) {
              interactable.opened = true;
              state.playerStats.hp = utils.clamp(state.playerStats.hp + 12, 0, state.playerStats.maxHp);
              ui.refresh(state.playerStats);
              audio.playEffect("chestOpen");
              showMessage(
                {
                  text: "You found herbal tonics! HP restored.",
                  author: "Mission Log",
                  channel: "mission"
                },
                3600
              );
            } else {
              audio.playEffect("dialogue");
              showMessage(
                {
                  text: "The chest is empty now, but still shiny.",
                  author: "Mission Log",
                  channel: "mission"
                },
                2800
              );
            }
          }
        } else if (interactable.type === "arcade") {
          promptText = "Press E to launch the Starcade";
          promptTarget = instance;
          if (input.wasKeyJustPressed("KeyE")) {
            audio.playEffect("dialogue");
            openMiniGame();
            notifyFirstSessionChecklist(constants.CHECKLIST_EVENTS.MINI_GAME_LAUNCHED, {
              interactable
            });
            showMessage(
              {
                text: "The arcade cabinet hums to life. Press Escape or Back to lobby to return.",
                author: "Mission Log",
                channel: "mission",
                silent: true,
                log: true
              },
              0
            );
          }
        } else if (interactable.type === "fountain") {
          promptText = "Press E to draw power from the fountain";
          promptTarget = instance;
          if (input.wasKeyJustPressed("KeyE")) {
            if (interactable.charges > 0) {
              interactable.charges -= 1;
              state.playerStats.mp = utils.clamp(state.playerStats.mp + 18, 0, state.playerStats.maxMp);
              ui.refresh(state.playerStats);
              audio.playEffect("fountain");
              showMessage(
                {
                  text: "Mana rush! Your MP was restored.",
                  author: "Mission Log",
                  channel: "mission"
                },
                3200
              );
            } else {
              audio.playEffect("dialogue");
              showMessage(
                {
                  text: "The fountain needs time to recharge.",
                  author: "Mission Log",
                  channel: "mission"
                },
                3000
              );
            }
          }
        } else if (interactable.type === "npc") {
          const guideName = world.getInteractableDisplayName(interactable);
          promptText = `Press E to talk to ${guideName}`;
          promptTarget = instance;
          if (input.wasKeyJustPressed("KeyE")) {
            notifyFirstSessionChecklist(constants.CHECKLIST_EVENTS.NPC_INTERACTION, {
              interactable,
              guideName
            });
            const missionResult = completeMission(interactable.missionId);
            audio.playEffect("dialogue");
            if (missionResult.completed) {
              const xpAward = missionResult.mission?.xp ?? 0;
              const briefingLine = interactable.dialogue[0];
              interactable.lineIndex = Math.min(1, interactable.dialogue.length - 1);
              let message = `${briefingLine} +${xpAward} EXP.`;
              if (missionResult.leveledUp) {
                message += ` Level up! You reached level ${state.playerStats.level}.`;
              }
              showMessage(
                { text: message, author: guideName, channel: "mission" },
                5600
              );
            } else if (missionResult.locked) {
              const required = Math.max(1, missionResult.mission?.requiredLevel ?? 1);
              showMessage(
                {
                  text: `Train to Level ${required} so ${guideName} can log your official briefing.`,
                  author: guideName,
                  channel: "mission"
                },
                4600
              );
            } else {
              const line = interactable.dialogue[interactable.lineIndex];
              interactable.lineIndex =
                (interactable.lineIndex + 1) % interactable.dialogue.length;
              showMessage(
                { text: line, author: guideName, channel: "mission" },
                4600
              );
            }
          }
        } else if (interactable.type === "comms") {
          promptText = "Press E to access the comms console";
          promptTarget = instance;
          if (input.wasKeyJustPressed("KeyE")) {
            const result = completeMission(interactable.missionId);
            audio.playEffect("dialogue");
            if (result.completed) {
              const xpAward = result.mission?.xp ?? 0;
              let message =
                `You sync with the Astronaut account. Mission Control now follows your journey. +${xpAward} EXP.`;
              if (result.leveledUp) {
                message += ` Level up! You reached level ${state.playerStats.level}.`;
              }
              showMessage(
                { text: message, author: "Mission Command", channel: "mission" },
                5600
              );
            } else if (result.locked) {
              const required = Math.max(1, result.mission?.requiredLevel ?? 1);
              showMessage(
                {
                  text: `Level ${required} clearance required to access the comms mission queue.`,
                  author: "Mission Command",
                  channel: "mission"
                },
                4400
              );
            } else if (result.alreadyComplete) {
              showMessage(
                {
                  text: "Mission Control feed already streams updates to your visor.",
                  author: "Mission Command",
                  channel: "mission"
                },
                4200
              );
            } else {
              showMessage(
                {
                  text: "The console hums, waiting for your next command.",
                  author: "Mission Command",
                  channel: "mission"
                },
                3600
              );
            }
          }
        }
      }
    }

    let portalInstance = state.portal;
    let nearPortal = false;
    const portalOffsets = world.getWorldOffsetsAround(state.player.x);
    for (const offset of portalOffsets) {
      const candidate = world.createWorldInstance(state.portal, offset);
      if (world.isNear(state.player, candidate, state.portal.interactionPadding)) {
        portalInstance = candidate;
        nearPortal = true;
        break;
      }
    }

    if (nearPortal) {
      if (state.isPortalCharged()) {
        if (state.playerStats.level < state.portalRequiredLevel) {
          promptText = `Reach Level ${state.portalRequiredLevel} to activate the portal.`;
          promptTarget = portalInstance;
          if (input.wasKeyJustPressed("KeyE")) {
            audio.playEffect("dialogue");
            showMessage(
              {
                text: `The portal resists you. Train until Level ${state.portalRequiredLevel} to stabilize the jump.`,
                author: "Mission Command",
                channel: "mission"
              },
              5200
            );
          }
        } else if (state.isPortalCompleted()) {
          promptText = "The portal hums softly, its gateway already opened.";
          promptTarget = portalInstance;
        } else {
          promptText = "Press E to step through the charged portal";
          promptTarget = portalInstance;
          if (input.wasKeyJustPressed("KeyE")) {
            audio.playEffect("portalActivate");
            queueEffect(
              createPortalActivationEffect(
                portalInstance.x + portalInstance.width / 2,
                portalInstance.y + portalInstance.height / 2
              )
            );
            queueEffect(
              createScreenShakeEffect({ magnitude: 9, duration: 420, frequency: 12 })
            );
            state.setPortalCompleted(true);
            const bonusExp = gainExperience(120);
            state.playerStats.hp = state.playerStats.maxHp;
            state.playerStats.mp = state.playerStats.maxMp;
            ui.refresh(state.playerStats);
            const highlightParts = [];
            let completionMessage =
              "You stride into the energized portal! +120 EXP. All stats restored for the journey ahead.";
            if (bonusExp) {
              highlightParts.push(`Level up! You reached level ${state.playerStats.level}.`);
            }
            const portalMission = completeMission("mission-portal-dive");
            if (portalMission.completed) {
              const xpAward = portalMission.mission?.xp ?? 0;
              const title = portalMission.mission?.title ?? "Portal Mission";
              highlightParts.push(`Mission Complete: ${title}! +${xpAward} EXP.`);
              if (portalMission.leveledUp) {
                highlightParts.push(`Level up! You reached level ${state.playerStats.level}.`);
              }
            } else if (portalMission.locked) {
              const required = Math.max(1, portalMission.mission?.requiredLevel ?? 1);
              highlightParts.push(`Reach Level ${required} to log the portal dive mission.`);
            }
            audio.playEffect("portalComplete");
            for (const crystal of state.crystals) {
              crystal.collected = false;
            }
            state.setPortalCharge(0);
            state.setPortalCharged(false);
            state.setCrystalRunStartTime(0);
            ui.updateCrystals(state.getPortalCharge(), state.crystals.length);
            showMessage(
              {
                text:
                  highlightParts.length > 0
                    ? `${completionMessage} ${highlightParts.join(" ")}`
                    : completionMessage,
                author: "Mission Log",
                channel: "mission"
              },
              6200
            );
          }
        }
      } else {
        promptText = "The portal is dormant. Gather more crystals.";
        promptTarget = portalInstance;
      }
    }

    if (movementHint.isVisible()) {
      if (ui && typeof ui.showMovementHint === "function") {
        ui.showMovementHint(state.player, {
          cameraOffset: state.getCameraScrollX(),
          viewportWidth: state.viewport.width,
          viewportHeight: state.viewport.height,
          scale: state.getRenderScale(),
          onAcknowledge: movementHint.dismiss
        });
        ui.setPrompt("");
      } else {
        movementHint.setVisible(false);
        ui.setPrompt(promptText, promptTarget);
      }
    } else {
      ui.setPrompt(promptText, promptTarget);
    }
  };
}
