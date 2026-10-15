import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { Dir, FathomState, View } from "./types";
import { arrive, clone, fresh, reconcile, restart } from "./world";
import { debug, items, menuItemRect } from "./debug";
import { tick } from "./simulation";
import { render } from "./render";
export { BACKGROUND } from "./render";
export type * from "./types";
function confirm(s: FathomState): FathomState {
  const i = s.menuIndex;
  if (s.screen === "title") {
    s.titleIndex = i ?? 0;
    return i === 0 ? restart(s, "countdown") : arrive(s, "howto");
  }
  if (s.screen === "paused")
    return i === 0
      ? arrive(s, "playing")
      : i === 1
        ? restart(s, "countdown")
        : restart(s, "title");
  if (s.screen === "gameover")
    return restart(s, i === 0 ? "countdown" : "title");
  return s;
}
function controls(
  s: FathomState,
  api: UpdateApi,
): { state: FathomState; held: boolean } {
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "countdown" || s.screen === "cleared")
    return { state: s, held: false };
  const back = s.screen !== "playing" && api.input.pressed("back"),
    pause =
      (s.screen === "playing" || s.screen === "paused") &&
      api.input.pressed("pause");
  if (s.screen === "playing") {
    if (pause) return { state: arrive(s, "paused"), held: false };
    const held = (["up", "down", "left", "right"] as Dir[]).filter(
      (d) => api.input.value(d) > 0,
    );
    // A new held direction replaces the buffered one; keep it when two keys overlap.
    const changed = held.filter((d) => api.input.pressed(d));
    if (changed.length) s.desired = changed[changed.length - 1];
    else if (held.length && s.screenAge === 0)
      s.desired = held[held.length - 1];
    s.pendingSonar ||= api.input.pressed("a");
    s.pendingInk ||= api.input.pressed("b");
    return { state: s, held: held.length > 0 };
  }
  if (s.screen === "paused" && (pause || back))
    return { state: arrive(s, "playing"), held: false };
  if ((s.screen === "howto" || s.screen === "gameover") && back)
    return { state: restart(s, "title"), held: false };
  let accept = api.input.pressed("confirm");
  const list = items(s.screen);
  if (list.length) {
    if (api.input.pressed("up"))
      s.menuIndex = ((s.menuIndex ?? 0) - 1 + list.length) % list.length;
    if (api.input.pressed("down"))
      s.menuIndex = ((s.menuIndex ?? 0) + 1) % list.length;
  }
  for (const p of api.input.pointerSamples()) {
    if (!p.primary) continue;
    let hit = -1;
    for (let i = 0; i < list.length; i++) {
      const r = menuItemRect(s, i)!;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
        hit = i;
    }
    if (hit >= 0 && (p.type === "move" || p.type === "down")) s.menuIndex = hit;
    if (p.type === "down")
      s.pointerDown[p.id] = s.screen === "howto" ? -2 : hit;
    if (p.type === "up") {
      const start = s.pointerDown[p.id];
      if (s.screen === "howto" && start === -2) accept = true;
      else if (hit >= 0 && start === hit) {
        s.menuIndex = hit;
        accept = true;
      }
      delete s.pointerDown[p.id];
    }
  }
  if (accept) {
    if (s.screen === "howto") s = restart(s, "title");
    else s = confirm(s);
  }
  return { state: s, held: false };
}
export const game: Game<FathomState, import("./types").FathomDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const sounds = [
      [860, 1180, 65],
      [430, 110, 430],
      [120, 40, 220],
      [290, 640, 180],
      [90, 1250, 420],
      [180, 28, 600],
      [320, 1280, 700],
    ];
    Object.values(C.CUES).forEach((name, i) => {
      const [freq, freqTo, durationMs] = sounds[i];
      api.audio.define(name, {
        freq,
        freqTo,
        durationMs,
        gain: i === 0 ? 0.07 : 0.12,
        wave: i === 2 ? "triangle" : "sine",
      });
    });
    const art: Record<string, ImageBitmap[]> = {};
    await Promise.all(
      Object.entries({
        glimmerfin: 8,
        lanternjaw: 16,
        gloamfin: 8,
        flarefish: 8,
        drifter: 8,
        "flare-bloom": 8,
        "trench-walls": 19,
      }).map(async ([name, n]) => {
        art[name] = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            api.assets.loadImage(`${name}/${i}.png`),
          ),
        );
      }),
    );
    const sources: Record<string, (s: View) => string | number> = {
      screen: (s) => s.screen,
      depth: (s) => s.depth,
      score: (s) => s.score,
      lives: (s) => s.lives,
      G: (s) => s.brightness.toFixed(3),
      V: (s) => s.visionRadius.toFixed(1),
      R: (s) => s.windowRadius.toFixed(1),
      sonar: (s) => s.sonar.cooldown.toFixed(2),
      ink: (s) => s.ink.cooldown.toFixed(2),
      plankton: (s) => s.planktonRemaining,
      forager: (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    };
    Object.entries(sources).forEach(([k, v]) => api.diagnostics.register(k, v));
    for (let i = 0; i < C.ROSTER_CAP * C.DEN_ORDER.length; i++)
      api.diagnostics.register(`hunter ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} ${p.alert ? "ALERT" : ""}`
          : "—";
      });
    return [fresh(art), debug];
  },
  update(state, api, dt) {
    const input = controls(clone(state), api);
    const s = input.state;
    s.remainder += dt;
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder = Math.max(0, s.remainder - C.TICK_DT);
      for (const cue of tick(s, input.held)) api.audio.play(cue);
    }
    return reconcile(s);
  },
  render,
};
