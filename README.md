# Fathom

**A small light. A very deep sea.**

Fathom is a browser maze chase about hunting in the dark. Graze every plankton
mote to descend. Eating brightens your forager and expands its circular window
onto the maze—but it also makes you easier to hunt. Explored ground stays
remembered, even when it slips outside your window and goes black again.

Three predators read the abyss differently: the Lanternjaw follows light,
the Gloamfin listens for sound, and the Flarefish burns through the dark with
its own flare. Sonar finds corridors and marks hunters, but it can give your
position away. Ink blinds the sighted hunters, not the one that hears.

## Run

Requires Node.js 20.19+ (or 22.12+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Everything runs locally in the browser; no
backend, downloaded fonts, or external services are needed.

## Build and serve

```sh
npm run build
npm run preview
```

`dist/` is the complete static site, with `index.html` at its root. Serve that
directory at a host's root or beneath a sub-path. All asset requests are relative
to the page. No additional generation or copying step is required.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD, held | Swim; release to stop |
| Space | Sonar pulse |
| Either Shift | Ink cloud |
| Escape / P | Pause or resume |
| M | Toggle sound |
| Up / Down, Enter or Space | Select / confirm a menu item |
| Escape | Back |
| Mouse / touch | Select and activate menus |
| Backtick | Engine diagnostics |

Touch devices also get a four-way pad and action buttons. Sonar and ink are
unlimited, with cooldowns. The three lives shown on the HUD are **reserves**:
your current attempt is additional to those. A catch preserves your score,
eaten plankton, and explored terrain. Clearing a maze adds a bonus and descends
to a fresh one with a larger predator roster and shorter sonar range.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests run the real Simple 2D engine with a counted clock and a Node canvas.
They cover maze geometry, immutable debug poses, input, screen transitions,
frame partitioning, movement, sensing, predator encounters, and progression.

`src/game.ts` registers actions, cues, art, and diagnostics with the engine. The
render-free fixed-step simulation is in `src/simulation.ts`, shared geometry and
state construction in `src/world.ts`, the automation surface in `src/debug.ts`,
and canvas presentation in `src/render.ts`. The engine owns the frame loop,
canvas fit, input, loading, audio, and diagnostics overlay. No debug object is
installed on the browser page.

See [`showcase/showcase.md`](showcase/showcase.md) for the player-facing
presentation and captured media.
