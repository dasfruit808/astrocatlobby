const FIXED_TIMESTEP = 16.666;
const MAX_FRAME_TIME = 100;
const MAX_ACCUMULATED_TIME = FIXED_TIMESTEP * 5;

export function startGameLoop(update, render, options = {}) {
  if (typeof update !== "function" || typeof render !== "function") {
    throw new TypeError("startGameLoop requires update and render functions");
  }

  const {
    requestAnimationFrameImpl = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(() => fn(performance.now()), FIXED_TIMESTEP),
    now = () => (typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now()),
    justPressed = new Set(),
    frameJustPressed = new Set(),
    emptyJustPressedSet = new Set(),
    setCurrentJustPressed = () => {},
    clearJustPressed = () => {
      justPressed.clear();
    }
  } = options;

  let lastTimestamp = now();
  let accumulatedFrameTime = 0;

  function step(timestamp) {
    let frameTime = timestamp - lastTimestamp;
    if (!Number.isFinite(frameTime) || frameTime < 0) {
      frameTime = FIXED_TIMESTEP;
    }
    frameTime = Math.min(frameTime, MAX_FRAME_TIME);
    lastTimestamp = timestamp;

    accumulatedFrameTime = Math.min(accumulatedFrameTime + frameTime, MAX_ACCUMULATED_TIME);

    frameJustPressed.clear();
    for (const code of justPressed) {
      frameJustPressed.add(code);
    }

    let processedInput = false;
    while (accumulatedFrameTime >= FIXED_TIMESTEP) {
      setCurrentJustPressed(processedInput ? emptyJustPressedSet : frameJustPressed);
      update(FIXED_TIMESTEP);
      accumulatedFrameTime -= FIXED_TIMESTEP;
      processedInput = true;
    }

    setCurrentJustPressed(frameJustPressed);
    render(timestamp);

    if (processedInput) {
      clearJustPressed();
    }

    requestAnimationFrameImpl(step);
  }

  requestAnimationFrameImpl(step);
}
