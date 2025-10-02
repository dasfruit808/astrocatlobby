# Astrocat Lobby

This project contains a Phaser 3 prototype that showcases a customizable character profile alongside a platforming playground.  Use the keyboard arrows or WASD to move, SPACE to jump and interact, and the **Customize** button to swap between hair, skin, and shirt colors.

## Getting started

```bash
npm install
npm run dev
```

The development server runs with Vite and will automatically reload when you change files.  To produce an optimized build run `npm run build`.

When the dev server starts successfully you should see output similar to:

```
VITE v5.4.20  ready in 396 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

Open the printed local URL in your browser to explore the lobby during development.

## Custom page background

Add a `webpagebackground` image (PNG, JPG/JPEG, WebP, AVIF, or GIF) to the `public/` directory to replace the default gradient backdrop that surrounds the lobby canvas. The image is applied automatically when present and falls back to the gradient when removed.

```
public/
└── webpagebackground.png  ← place your full-page background here (any of the supported extensions work)
```

The background stretches to cover the entire viewport, so large landscape images work best.

## Custom toolbar branding

To replace the Astrocat Lobby wordmark in the navigation toolbar, add a `toolbar-brand.png` image to either the `public/` directory or the embedded mini game folder at `public/AstroCats3/`. The lobby prefers the root image when both exist and gracefully falls back to text when no custom graphic is supplied.

## Custom NPC sprites

The lobby procedurally draws characters like Nova when no override graphic exists. To supply your own art, drop replacement PNGs in `src/assets/` using the exact filenames expected by the runtime. For Nova's portrait specifically, add your artwork as `src/assets/GuideSprite.png`. At build time the loader enumerates that directory with `import.meta.glob("./assets/*.{png,PNG}")`; if the file is missing or renamed, the manifest lookup fails and the game falls back to the default drawing.【F:src/main.js†L461-L482】【F:src/main.js†L1194-L1209】【F:src/main.js†L1474-L1482】

## Embedding the AstroCats3 mini game

1. Copy the production build of the **AstroCats3** mini game into `public/AstroCats3/`, replacing the placeholder `index.html` with your own entry point and keeping all referenced assets alongside it.
2. Run the lobby (`npm run dev`) and approach the glowing arcade cabinet labeled **Starcade**. Press <kbd>E</kbd> to launch the mini game inside the lobby.
3. Close the in-game console with the **Back to lobby** button or the <kbd>Escape</kbd> key when you are finished playing.

The cabinet now looks for `/public/AstroCats3/index.html` inside an iframe, falling back to `/AstroCats3/index.html` when needed, so ensure all asset paths remain relative to those files. You can also open the mini game directly in a new browser tab at `/public/AstroCats3/index.html` (or `/AstroCats3/index.html` if you rely on the legacy location) to verify it deploys correctly.

### Configuring the mini game leaderboard

The bundled AstroCats3 build no longer assumes a hosted leaderboard API when you run the lobby locally. This prevents console
errors from failed network requests during development. To point the mini game at your own deployment, edit the helper at
`public/leaderboard-config.js` and set `configuredBaseUrl` to the base URL that serves the leaderboard endpoints. The script runs
before the mini game boots and keeps the existing dataset/global overrides in place if you already provide them elsewhere.

### Updating the bundled mini game script

For broader browser compatibility the production build ships a transpiled version of the mini game script at
`public/AstroCats3/scripts/app.js`. The original source lives beside it as `app.source.js`. After making changes to the
source file, regenerate the transpiled bundle by running:

```
npx tsc -p tsconfig.astrocat.json
mv public/AstroCats3/scripts/compat/app.source.js public/AstroCats3/scripts/app.js
rmdir public/AstroCats3/scripts/compat
```

This downlevels modern JavaScript features so the game boots cleanly across more browsers.

## Browser compatibility

The Vite build now targets ES2015-era evergreen browsers such as Safari 11 and Chrome 61 and includes runtime shims for `globalThis` and the `URL` constructor. Run `npm run build` before distributing the beta to ensure the transpiled output and compatibility helpers are included. Older browsers that still lack fundamental Web APIs will gracefully fall back to the lobby's built-in warnings instead of crashing.

## Password hashing

Account passwords are hashed with SHA-256 using the browser's Web Crypto API when it is available. When SubtleCrypto is missing, the lobby now falls back to a bundled SHA-256 implementation so the derived hash value remains as strong as the primary path. The fallback uses the same base64 encoding as SubtleCrypto to avoid format drift across browsers.【F:src/main.js†L1891-L2016】

Players who return with a legacy `legacy-` password hash are automatically rehashed with SHA-256 during their next successful login and stored back to local persistence, ensuring the stronger protection applies to existing profiles without breaking sign in flows.【F:src/main.js†L3528-L3561】

## Enhancing the lobby experience

Looking for feature inspiration beyond the core prototype? Check out [Gameplay User Experience Enhancement Ideas](docs/gameplay-ux-enhancement-ideas.md) for a curated list of onboarding, feedback, accessibility, and social improvements that can enrich future iterations of the lobby.
