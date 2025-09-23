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

The cabinet loads `/AstroCats3/index.html` inside an iframe, so ensure all asset paths remain relative to that file. You can also open the mini game directly in a new browser tab at `/AstroCats3/index.html` to verify it deploys correctly.
