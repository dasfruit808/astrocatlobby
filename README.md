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

Add a `webpagebackground.png` file to the `public/` directory to replace the default gradient backdrop that surrounds the lobby canvas. The image is applied automatically when present and falls back to the gradient when removed.

## Embedding the AstroCats3 mini game

1. Copy the production build of the **AstroCats3** mini game into `public/AstroCats3/`, replacing the placeholder `index.html` with your own entry point and keeping all referenced assets alongside it.
2. Run the lobby (`npm run dev`) and approach the glowing arcade cabinet labeled **Starcade**. Press <kbd>E</kbd> to launch the mini game inside the lobby.
3. Close the in-game console with the **Back to lobby** button or the <kbd>Escape</kbd> key when you are finished playing.

The cabinet now looks for `/public/AstroCats3/index.html` inside an iframe, falling back to `/AstroCats3/index.html` when needed, so ensure all asset paths remain relative to those files. You can also open the mini game directly in a new browser tab at `/public/AstroCats3/index.html` (or `/AstroCats3/index.html` if you rely on the legacy location) to verify it deploys correctly.

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

The Vite build now targets evergreen browsers as far back as Safari 13/Chrome 61 and includes runtime shims for `globalThis` and the `URL` constructor. Run `npm run build` before distributing the beta to ensure the transpiled output and compatibility helpers are included. Older browsers that still lack fundamental Web APIs will gracefully fall back to the lobby's built-in warnings instead of crashing.
