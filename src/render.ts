import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { Body, View } from "./types";
import {
  center,
  delta,
  dirs,
  distance,
  distances,
  los,
  neighbor,
  tile,
} from "./world";
import { items, menuItemRect } from "./debug";
export const BACKGROUND = "#03060c";
const aqua = "#8bf6e0",
  dim = "#547c85",
  white = "#e0f6ef",
  amber = "#ff8951";
const face = { down: 0, up: 2, left: 4, right: 6 };
type Ctx = CanvasRenderingContext2D;
function text(
  ctx: Ctx,
  t: string,
  x: number,
  y: number,
  size = 14,
  color = white,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}
function line(
  ctx: Ctx,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = dim,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  color: string,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "#00000000");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function sprite(
  ctx: Ctx,
  s: View,
  sheet: string,
  index: number,
  x: number,
  y: number,
  w = C.TILE,
): void {
  const img = s.art[sheet]?.[index];
  if (img) ctx.drawImage(img, x - w / 2, y - w / 2, w, w);
}
function amberLight(ctx: Ctx, b: { x: number; y: number }): void {
  glow(ctx, b.x, b.y, 19, "#ff733f60");
  ctx.fillStyle = "#ffb16c";
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
function ground(ctx: Ctx, s: View, x: number, y: number, v: string): void {
  if (v === "u") return;
  const t = tile(s, x, y),
    p = center(x, y);
  let frame = 16;
  if (t === "#")
    frame =
      (tile(s, x, y - 1) === "#" ? 1 : 0) +
      (tile(s, x + 1, y) === "#" ? 2 : 0) +
      (tile(s, x, y + 1) === "#" ? 4 : 0) +
      (tile(s, x - 1, y) === "#" ? 8 : 0);
  else if (t === "g") frame = 18;
  ctx.globalAlpha = v === "l" ? 1 : 0.26;
  sprite(ctx, s, "trench-walls", frame, p.x, p.y);
  if (s.plankton[y]?.[x] === "*") {
    ctx.shadowColor = aqua;
    ctx.shadowBlur = v === "l" ? 8 : 0;
    ctx.fillStyle = v === "l" ? "#a9ffe7" : "#52847e";
    ctx.beginPath();
    ctx.arc(p.x, p.y, C.PLANKTON_DOT / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}
function terrain(ctx: Ctx, s: View): void {
  s.visibility.forEach((row, y) =>
    [...row].forEach((v, x) => ground(ctx, s, x, y, v)),
  );
}
function body(ctx: Ctx, s: View, p: Body, sheet: string, frame: number): void {
  sprite(ctx, s, sheet, frame, p.x, p.y);
}
function mazeView(ctx: Ctx, s: View): void {
  const f = s.forager;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.clip();
  ctx.save();
  ctx.beginPath();
  ctx.arc(f.x, f.y, s.windowRadius, 0, Math.PI * 2);
  ctx.clip();
  terrain(ctx, s);
  glow(ctx, f.x, f.y, s.windowRadius, "#28d7bb0b");
  for (const p of s.drifters) amberLight(ctx, p);
  for (const p of s.predators)
    if (p.kind === "lanternjaw" && p.state !== "den") amberLight(ctx, p);
  ctx.restore();
  // A bloom is full vision, including beyond the Kindle window.
  for (const p of s.predators)
    if (p.flaring) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      terrain(ctx, s);
      ctx.restore();
    }
  for (const c of s.inkClouds) {
    glow(ctx, c.x, c.y, c.radius, "#00020bff");
    ctx.fillStyle = "#01030ce0";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of s.pulses) {
    const m = distances(s, p.ox, p.oy, true),
      color =
        p.tint === "cyan" ? aqua : p.tint === "violet" ? "#b29dff" : "#ff995b";
    // The crest runs along edges of the same corridor graph as the flood.
    // Interpolation between centers makes it flow, instead of hopping cells.
    for (const [k, d] of m) {
      const age = p.front - d;
      if (age < 0 || age > 1 || d >= p.range) continue;
      const [x, y] = k.split(",").map(Number),
        c = center(x, y);
      for (const dir of dirs) {
        if (m.get(neighbor(s, x, y, dir).join(",")) !== d + 1) continue;
        const [dx, dy] = delta[dir];
        const px = c.x + dx * C.TILE * age,
          py = c.y + dy * C.TILE * age;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 20;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - dy * 12, py + dx * 12);
        ctx.lineTo(px + dy * 12, py - dx * 12);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  for (const p of s.drifters)
    if (p.lit) body(ctx, s, p, "drifter", Math.floor(s.playAge * 8) % 8);
  for (const p of s.predators) {
    if (p.lit) {
      const directlyLit =
        p.alert ||
        (distance(s.forager, p) <= s.visionRadius &&
          los(s, s.forager, p, true)) ||
        s.predators.some((q) => q.flaring && distance(q, p) <= C.FLARE_RADIUS);
      if (!directlyLit && p.mark > 0)
        ctx.globalAlpha = Math.min(1, p.mark / C.SONAR_MARK_TIME);
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (Math.floor(s.playAge * 8) % 8)
          : face[p.dir] + (Math.floor(s.playAge * 7) % 2);
      body(ctx, s, p, p.kind, frame);
      ctx.globalAlpha = 1;
    }
    if (p.alert) {
      ctx.save();
      const color = p.kind === "gloamfin" ? "#b39aff" : amber;
      const progress = 1 - p.alertLeft / C.ALERT_TIME;
      ctx.globalAlpha = 1 - progress;
      circle(ctx, p.x, p.y, 14 + progress * 30, color, 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          ctx,
          p.x + Math.cos(a) * 20,
          p.y + Math.sin(a) * 20,
          p.x + Math.cos(a) * (28 + progress * 16),
          p.y + Math.sin(a) * (28 + progress * 16),
          color,
        );
      }
      ctx.restore();
    }
    if (p.state !== "den" && (p.flareCharging || p.flaring || p.fade > 0)) {
      const frame = p.flareCharging
        ? Math.min(2, Math.floor((p.flareAge / C.FLARE_CHARGE) * 3))
        : p.flaring
          ? 3 +
            Math.min(
              2,
              Math.floor(((p.flareAge - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
            )
          : p.fade > 0.15
            ? 6
            : 7;
      sprite(ctx, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
    }
  }
  glow(ctx, f.x, f.y, 40, "#36efd53a");
  body(
    ctx,
    s,
    f,
    "glimmerfin",
    face[f.dir] + (f.moving ? Math.floor(s.playAge * 9) % 2 : 0),
  );
  ctx.restore();
  // Thin instrument framing stays outside the fog.
  line(ctx, 64, 79, 1216, 79, "#153039");
  line(ctx, 64, 657, 1216, 657, "#153039");
  for (const [x, y, sx, sy] of [
    [64, 80, 1, 1],
    [1216, 80, -1, 1],
    [64, 656, 1, -1],
    [1216, 656, -1, -1],
  ]) {
    line(ctx, x, y, x + sx * 12, y, "#528581");
    line(ctx, x, y, x, y + sy * 12, "#528581");
  }
}
function hud(ctx: Ctx, s: View): void {
  text(ctx, "F A T H O M", 64, 38, 18, aqua);
  text(ctx, C.DIVE_LABEL + " / 01", 64, 60, 11, dim);
  text(ctx, String(s.score).padStart(6, "0"), 640, 61, 48, white, "center");
  text(ctx, "PLANKTON", 1216, 29, 10, dim, "right");
  text(
    ctx,
    String(s.planktonRemaining).padStart(3, "0"),
    1216,
    58,
    25,
    aqua,
    "right",
  );
  text(ctx, `DEPTH ${String(s.depth).padStart(2, "0")}`, 64, 696, 16, white);
  for (let i = 0; i < s.lives; i++)
    sprite(ctx, s, "glimmerfin", 6, 222 + i * 26, 690, 24);
  const gauge = (
    x: number,
    name: string,
    key: string,
    cd: number,
    max: number,
  ) => {
    const ready = cd === 0;
    text(ctx, `${key}  ${name}`, x, 684, 12, ready ? aqua : dim);
    text(
      ctx,
      ready ? "READY" : cd.toFixed(1) + "s",
      x + 224,
      684,
      11,
      ready ? aqua : dim,
      "right",
    );
    ctx.fillStyle = "#153038";
    ctx.fillRect(x, 696, 224, 3);
    ctx.fillStyle = ready ? aqua : "#487e87";
    ctx.fillRect(x, 696, 224 * Math.max(0, 1 - cd / max), 3);
  };
  gauge(586, "SONAR", "SPACE", s.sonar.cooldown, C.SONAR_COOLDOWN);
  gauge(858, "INK", "SHIFT", s.ink.cooldown, C.INK_COOLDOWN);
  text(ctx, s.muted ? "M / OFF" : "M / ON", 1216, 697, 11, dim, "right");
}
function menu(ctx: Ctx, s: View): void {
  items(s.screen).forEach((t, i) => {
    const r = menuItemRect(s, i)!;
    const selected = s.menuIndex === i;
    ctx.fillStyle = selected ? "#10332f" : "#071219";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? "#5edbb4" : "#173039";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    text(
      ctx,
      selected ? "›" : "·",
      r.x + 20,
      r.y + 31,
      22,
      selected ? aqua : dim,
    );
    text(ctx, t, r.x + 48, r.y + 30, 16, selected ? white : dim);
    if (selected) text(ctx, "↵", r.x + r.w - 22, r.y + 30, 16, aqua, "right");
  });
}
function title(ctx: Ctx, s: View): void {
  // A bathymetric instrument plate: restrained, original, and entirely local.
  text(ctx, "PELAGIC SURVEY  /  EXPEDITION 001", 64, 49, 11, dim);
  text(ctx, "36° N  /  ABYSSAL ZONE", 1216, 49, 11, dim, "right");
  line(ctx, 64, 68, 1216, 68, "#173039");
  const ox = 640,
    oy = 274;
  for (const r of [76, 112, 158, 206])
    circle(ctx, ox, oy, r, r === 158 ? "#23534f" : "#10272d");
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      r = i % 6 === 0 ? 211 : 218;
    line(
      ctx,
      ox + Math.cos(a) * r,
      oy + Math.sin(a) * r,
      ox + Math.cos(a) * 224,
      oy + Math.sin(a) * 224,
      "#244440",
    );
  }
  glow(ctx, ox, oy, 230, "#1cba9a13");
  ctx.save();
  ctx.beginPath();
  ctx.arc(ox, oy, 159, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.2;
  for (let y = 1; y < 17; y++)
    for (let x = 1; x < 35; x++) {
      const p = center(x, y);
      if (distance(p, { x: ox, y: oy }) < 200) ground(ctx, s, x, y, "r");
    }
  ctx.restore();
  text(ctx, C.TITLE_TEXT, 640, 320, 100, white, "center");
  text(ctx, C.TAGLINE_TEXT.split("").join(" "), 640, 362, 14, aqua, "center");
  sprite(ctx, s, "glimmerfin", 6, 640, 195, 48);
  glow(ctx, 640, 195, 55, "#57ffe635");
  text(ctx, "A SMALL LIGHT. A VERY DEEP SEA.", 640, 395, 11, dim, "center");
  menu(ctx, s);
  text(ctx, "01", 122, 283, 13, aqua);
  line(ctx, 150, 278, 361, 278, "#234642");
  text(ctx, "LIGHT IS A LIABILITY", 122, 306, 11, dim);
  text(ctx, "03", 1158, 283, 13, amber, "right");
  line(ctx, 918, 278, 1130, 278, "#433329");
  text(ctx, "THREE WAYS TO BE FOUND", 1158, 306, 11, dim, "right");
  line(ctx, 64, 648, 1216, 648, "#173039");
  text(ctx, "↑ ↓  SELECT     ENTER  CONFIRM", 64, 683, 12, dim);
  text(ctx, "HEADPHONES RECOMMENDED  /  M SOUND", 1216, 683, 12, dim, "right");
}
function howto(ctx: Ctx, s: View): void {
  text(ctx, "FIELD GUIDE / 01", 64, 57, 12, aqua);
  text(ctx, "LEARN THE DARK", 64, 121, 42, white);
  text(
    ctx,
    "Your light finds the maze. Your light also finds you.",
    64,
    157,
    16,
    dim,
  );
  line(ctx, 64, 184, 1216, 184, "#23413e");
  const entries = [
    ["MOVE", "ARROWS / WASD", "Hold to swim. Turn early; release to stop."],
    ["SONAR", "SPACE", "Flood corridors with sound. Remember the way."],
    ["INK", "SHIFT", "Blind light-hunters. Sound still finds you."],
    ["PAUSE / MUTE", "ESC OR P / M", "Take a breath. The abyss can wait."],
  ];
  entries.forEach(([t, k, d], i) => {
    const y = 230 + i * 85;
    text(ctx, k, 64, y, 12, aqua);
    text(ctx, t, 64, y + 25, 20, white);
    text(ctx, d, 64, y + 46, 12, dim);
  });
  const hunters = [
    [
      "lanternjaw",
      "THE LANTERNJAW",
      "Follows your glow. That amber light may bite.",
    ],
    ["gloamfin", "THE GLOAMFIN", "Hears you. Every sonar pulse is a risk."],
    ["flarefish", "THE FLAREFISH", "Hunts light. Its flare sees through rock."],
  ];
  hunters.forEach(([sheet, t, d], i) => {
    const y = 247 + i * 106;
    sprite(ctx, s, sheet, 6, 736, y, 48);
    text(ctx, t, 780, y - 4, 18, sheet === "gloamfin" ? "#b9a4fb" : amber);
    text(ctx, d, 780, y + 25, 12, dim);
  });
  text(
    ctx,
    "Eat every mote to descend. Eating grows your light,",
    706,
    572,
    13,
    white,
  );
  text(
    ctx,
    "and the circular window you carry through the dark.",
    706,
    594,
    13,
    white,
  );
  line(ctx, 64, 635, 1216, 635, "#23413e");
  text(
    ctx,
    "ENTER / ESC / TAP ANYWHERE  →  RETURN",
    640,
    679,
    13,
    aqua,
    "center",
  );
}
export function render(s: View, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (s.screen === "howto") {
    howto(ctx, s);
    return;
  }
  if (s.screen === "gameover") {
    text(ctx, "SIGNAL LOST", 640, 220, 18, amber, "center");
    text(ctx, "THE DEEP KEEPS YOU", 640, 281, 45, white, "center");
    text(
      ctx,
      `SCORE ${String(s.score).padStart(6, "0")}   /   DEPTH ${s.depth}`,
      640,
      338,
      18,
      aqua,
      "center",
    );
    menu(ctx, s);
    text(ctx, "There is always another light.", 640, 641, 13, dim, "center");
    return;
  }
  mazeView(ctx, s);
  hud(ctx, s);
  if (s.screen === "paused") {
    ctx.fillStyle = "#03080dbb";
    ctx.fillRect(340, 170, 600, 474);
    text(ctx, "HOLDING DEPTH", 640, 293, 36, white, "center");
    text(ctx, "The current can wait.", 640, 332, 13, dim, "center");
    menu(ctx, s);
  }
  if (s.screen === "countdown" || s.screen === "cleared") {
    ctx.fillStyle = "#03080ddc";
    ctx.fillRect(380, 264, 520, 160);
    text(
      ctx,
      s.screen === "cleared" ? `DEPTH ${s.depth} CLEARED` : "DIVE",
      640,
      326,
      36,
      aqua,
      "center",
    );
    text(
      ctx,
      s.screen === "cleared"
        ? `+${C.SCORE_CLEAR}  /  DESCENDING`
        : `${Math.max(1, Math.ceil(2 - s.screenAge))}  /  KEEP YOUR LIGHT LOW`,
      640,
      369,
      13,
      white,
      "center",
    );
  }
}
