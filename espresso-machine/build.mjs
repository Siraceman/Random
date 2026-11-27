import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

// One world unit is about 2 mm of the real machine.
const WIDTH = 600;
const HEIGHT = 440;

// The shot model: a typical double espresso.
const SHOT = { dose: 18, out: 36, bar: 9, rise: 1.6, firstDrop: 6, end: 28, temp: 93 };

const BOARD = { x: -170, y: -100, w: 300, d: 215, r: 8 };
const BOARD_H = 8;
const BODY = { x: -140, y: -75, w: 180, d: 150, r: 4 };
const FRONT = BODY.x + BODY.w; // x = 40, the face that looks at the viewer
const FOOT_H = 6;
const BODY_Z = FOOT_H;
const BODY_TOP = 180;
const TRAY = { x: FRONT, y: -58, w: 46, d: 116, r: 4 };
const TRAY_TOP = 22;
const GRATE_TOP = TRAY_TOP + 1.5;
const GROUP = [66, 0];
const HEAD_Z = 104;
const HEAD_TOP = 132;
const RING_Z = 95;
const BOWL_Z = 86;
const SPOUT_Z = 72;
const CUP = { x: GROUP[0], y: GROUP[1], r: 14, inner: 12.6, z: GRATE_TOP, h: 27 };
const CUP_TOP = CUP.z + CUP.h;
const CUP_FLOOR = CUP.z + 3;
const FILL_H = CUP.h - 3 - 4.5; // 36 g of espresso and its crema come to just under the rim
const SPOUTS = [[GROUP[0], 4.6], [GROUP[0], -4.6]];
const GAUGE = { y: 40, z: 150, r: 16 };
const DISPLAY = { y0: -60, y1: -24, z0: 142, z1: 160 };
const BUTTON = { y: -42, z: 120, r: 6 };
const KNOB = { y: 44, z: 118, r: 7 };
const WAND = { x: 58, y: 60, top: 100, tip: 54 };
const TAMPER = [92, 82];

const P = k.fitProjection(
  [...k.boxCorners(BOARD, -BOARD_H, 0), ...k.boxCorners(BODY, 0, BODY_TOP + 13), [150, -60, 90]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 33 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
const byDepth = (points) => [...points].sort((a, b) => depth(a[0], a[1]) - depth(b[0], b[1]));
const X = [1, 0, 0];
const alongX = (y, z, x = FRONT) => G.frameOf([x, y, z], X, [0, 0, 1], [0, -1, 0]);

// A point on the front face, angle measured clockwise from straight up as you face the machine.
const onFront = (cy, cz, r, angle, x = FRONT) => [x, cy - r * Math.sin(angle), cz + r * Math.cos(angle)];
const frontPath = (points, closed = false) => k.pathOf(points.map(at), closed);
const sidePath = (points, closed = false) => k.pathOf(points.map(at), closed);

// A rounded slot drawn in a vertical plane, as a closed outline.
function slotOn(face, a0, a1, z0, z1, plane = face === "y" ? BODY.y + BODY.d : FRONT) {
  const r = Math.min(z1 - z0, a1 - a0) / 2;
  const ring = k.roundedPlan({ x: a0, y: z0, w: a1 - a0, d: z1 - z0, r }, 4);
  return sidePath(ring.map(([a, z]) => (face === "y" ? [a, plane, z] : [plane, a, z])), true);
}

function board() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BOARD, -BOARD_H, BOARD_H, P)}"/>`];
  out.push(S(k.slabOf(BOARD, -BOARD_H, BOARD_H, P, 8, 1.6), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(BOARD, 5), 0, P), { tone: "faint" }));
  const screws = k.corners(BOARD, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // A ruler strip along the front edge, ticks every 5 units (1 cm).
  const strip = { x: BOARD.x + BOARD.w - 15, y: BOARD.y + 22, w: 7, d: BOARD.d - 44, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.y + 4, strip.y + strip.d - 4, 5, 5, strip.x + 0.8, 0.6, [2, 3.6], P, "y");
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 3.5, strip.y + 2, 0.6]), at([strip.x + 3.5, strip.y + strip.d - 2, 0.6])], { size: 0.45 }));
  return out.join("");
}

function machine() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(BODY, -4), 0, BODY_Z, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BODY, 14))) {
    out.push(S(k.cylinder(x, y, 7, 0, 1.5, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, 1.5, FOOT_H - 1.5, P, 24), { tone: "mid" }));
  }
  const seams = [BODY_Z + 20, BODY_TOP - 10].map((z) => L(k.sideSeam(BODY, z, P, 4), { tone: "faint" })).join("");
  out.push(S(k.slabOf(BODY, BODY_Z, BODY_TOP - BODY_Z, P, 4, 1.2), { tone: "mid", inner: seams }));
  // The side panel (+y): screws at its corners and a bank of closed vent slots near the pump.
  const side = BODY.y + BODY.d;
  const screws = [[-130, BODY_Z + 28], [30, BODY_Z + 28], [-130, BODY_TOP - 18], [30, BODY_TOP - 18]];
  out.push(L(screws.map(([x, z]) => k.sideRing([x, side, z], 1.8, "y", P, 14)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, z]) => at([x, side, z])), { size: 0.45 }));
  const vents = [];
  for (let i = 0; i < 7; i++) vents.push(slotOn("y", -118 + i * 9, -114 + i * 9, BODY_Z + 36, BODY_Z + 70));
  out.push(L(vents.join(""), { tone: "lo" }));
  // Rocker switch and its pilot lamp on the side panel.
  const rocker = { x: 6, y: side, w: 16, d: 2, r: 1 };
  out.push(S(k.slabOf(rocker, BODY_Z + 30, 11, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: 8, y: side + 2, w: 12, d: 1.6, r: 0.8 }, BODY_Z + 32, 7, P, 3), { tone: "hi", crease: "lo" }));
  out.push(L(k.segment([14, side + 3.6, BODY_Z + 32], [14, side + 3.6, BODY_Z + 39], P), { tone: "lo" }));
  out.push(D([at([-6, side, BODY_Z + 35.5])], { size: 0.9, tone: "hi", pulse: true }));
  out.push(L(k.sideRing([-6, side, BODY_Z + 35.5], 2.2, "y", P, 16), { tone: "lo" }));
  return out.join("");
}

// The cup warmer on top: a gallery rail round a plate, with two cups kept warm upside down.
const RAIL = k.insetPlan(BODY, 6);
const RAIL_Z = BODY_TOP;
const RAIL_H = 12;
function railBar(axis, at0, from, to) {
  const plan = axis === "x" ? { x: from, y: at0 - 1.4, w: to - from, d: 2.8, r: 1.2 } : { x: at0 - 1.4, y: from, w: 2.8, d: to - from, r: 1.2 };
  return S(k.slabOf(plan, RAIL_Z + RAIL_H - 2.8, 2.8, P, 3), { tone: "mid", crease: "none" });
}
function post(x, y) {
  return S(k.cylinder(x, y, 1.5, RAIL_Z, RAIL_H, P, 14), { tone: "mid", crease: "none" }) + S(k.cylinder(x, y, 2.6, RAIL_Z, 1.2, P, 16), { tone: "lo" });
}
const [rx0, ry0, rx1, ry1] = [RAIL.x, RAIL.y, RAIL.x + RAIL.w, RAIL.y + RAIL.d];
function topBack() {
  const out = [];
  out.push(L(k.planOutline(k.insetPlan(BODY, 12), BODY_TOP, P, 4), { tone: "faint" }));
  const holes = [];
  for (let i = 0; i < 9; i++) holes.push(k.planOutline({ x: -116 + i * 15, y: -50, w: 4, d: 100, r: 2 }, BODY_TOP, P, 3));
  out.push(L(holes.join(""), { tone: "faint" }));
  out.push(post(rx0, ry0), post(rx1, ry0), post(rx0, ry1));
  out.push(railBar("x", ry0, rx0, rx1), railBar("y", rx0, ry0, ry1));
  return out.join("");
}
function warmCup(x, y) {
  const out = [];
  const handle = G.frameOf([x - 1.6, y - 13 - 3.6, BODY_TOP + 13], X, [0, 0, 1], [0, 1, 0]);
  out.push(S(G.ringBand(0, 3.2, 3, 5.4, handle, P), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(x, y, 13, BODY_TOP, 24, P, 40, 0.6), { tone: "hi", crease: "lo", inner: L(k.sideArc(x, y, 13, BODY_TOP + 4, P, 30), { tone: "faint" }) }));
  out.push(L(k.ring(x, y, 7, BODY_TOP + 24, P, 30), { tone: "lo" }));
  return out.join("");
}
function topFront() {
  return [railBar("x", ry1, rx0, rx1), railBar("y", rx1, ry0, ry1), post(rx1, ry1)].join("");
}

// Dials and controls on the front face.
const BAR_MAX = 16;
const SWEEP = (Math.PI * 3) / 4;
const barAngle = (bar) => -SWEEP + (Math.min(BAR_MAX, Math.max(0, bar)) / BAR_MAX) * 2 * SWEEP;
const needleAt = (bar) => {
  const a = barAngle(bar);
  const tip = onFront(GAUGE.y, GAUGE.z, GAUGE.r - 4.6, a, FRONT + 4.4);
  const tail = onFront(GAUGE.y, GAUGE.z, -3.2, a, FRONT + 4.4);
  return k.pathOf([at(tail), at(tip)]);
};
function gauge() {
  const F = alongX(GAUGE.y, GAUGE.z);
  const out = [];
  out.push(S(G.disc(0, 1.2, GAUGE.r + 2.4, F, P), { tone: "mid" }));
  out.push(S(G.disc(1.2, 4, GAUGE.r, F, P), { tone: "hi", crease: "lo", inner: L(G.arcOf(F, 2.6, GAUGE.r, P), { tone: "faint" }) }));
  const s = 4.05;
  out.push(L(G.circleOf(F, s, GAUGE.r - 1.6, P), { tone: "lo" }));
  const minor = [];
  const major = [];
  for (let bar = 0; bar <= BAR_MAX; bar += 1) {
    const a = barAngle(bar);
    const inner = GAUGE.r - 1.6 - (bar % 4 === 0 ? 3.4 : 1.8);
    (bar % 4 === 0 ? major : minor).push(frontPath([onFront(GAUGE.y, GAUGE.z, GAUGE.r - 1.6, a, FRONT + s), onFront(GAUGE.y, GAUGE.z, inner, a, FRONT + s)]));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  // The brewing band, 8 to 10 bar, as an arc on the scale.
  const band = [];
  for (let i = 0; i <= 12; i++) band.push(onFront(GAUGE.y, GAUGE.z, GAUGE.r - 2.4, barAngle(8 + (i / 12) * 2), FRONT + s));
  out.push(`<path class="iso-line" data-tone="hi" d="${frontPath(band)}" style="stroke-width:1.6;stroke-linecap:butt"/>`);
  out.push(k.faceTextSvg(k.sideMatrix([FRONT + s, GAUGE.y + 3.4], GAUGE.z - 7.4, P, "right"), "BAR", { size: 2.6, tone: "lo" }));
  out.push(D([at(onFront(GAUGE.y, GAUGE.z, GAUGE.r + 1.2, Math.PI / 4)), at(onFront(GAUGE.y, GAUGE.z, GAUGE.r + 1.2, -Math.PI / 4)), at(onFront(GAUGE.y, GAUGE.z, GAUGE.r + 1.2, Math.PI))], { size: 0.45 }));
  return out.join("");
}
function hub() {
  const F = alongX(GAUGE.y, GAUGE.z);
  return S(G.disc(4.05, 4.9, 1.5, F, P), { tone: "hi", crease: "lo" });
}

const DISPLAY_TEXT_AT = [FRONT + 2.6, DISPLAY.y1 - 4, DISPLAY.z0 + 4.6];
function display() {
  const out = [];
  const { y0, y1, z0, z1 } = DISPLAY;
  out.push(S(k.slabOf({ x: FRONT, y: y0, w: 2.4, d: y1 - y0, r: 1.2 }, z0, z1 - z0, P, 3, 0.4), { tone: "mid" }));
  const win = [[FRONT + 2.4, y1 - 3, z1 - 3], [FRONT + 2.4, y0 + 3, z1 - 3], [FRONT + 2.4, y0 + 3, z0 + 3], [FRONT + 2.4, y1 - 3, z0 + 3]];
  out.push(`<clipPath id="es-window"><path d="${frontPath(win, true)}"/></clipPath>`);
  out.push(`<path class="es-glass" d="${frontPath(win, true)}"/>`);
  out.push(`<g clip-path="url(#es-window)">${k.faceTextSvg(k.sideMatrix(DISPLAY_TEXT_AT, DISPLAY_TEXT_AT[2], P, "right"), String(SHOT.temp) + "°", { size: 9.6, tone: "hi" }).replace("<text", '<text data-part="screen"')}</g>`);
  out.push(L(frontPath(win, true), { tone: "lo" }));
  out.push(D([[FRONT + 2.4, y1 - 1.5, z1 - 1.5], [FRONT + 2.4, y0 + 1.5, z1 - 1.5], [FRONT + 2.4, y0 + 1.5, z0 + 1.5], [FRONT + 2.4, y1 - 1.5, z0 + 1.5]].map(at), { size: 0.4 }));
  return out.join("");
}

function button() {
  const F = alongX(BUTTON.y, BUTTON.z);
  const out = [];
  out.push(S(G.disc(0, 1.2, BUTTON.r + 2, F, P), { tone: "mid" }));
  out.push(`<g data-part="button">${S(G.disc(1.2, 4.2, BUTTON.r, F, P), { tone: "hi", crease: "lo" })}${L(G.circleOf(F, 4.2, BUTTON.r - 1.8, P), { tone: "lo" })}</g>`);
  out.push(`<g data-part="lamp">${D([at([FRONT, BUTTON.y, BUTTON.z + BUTTON.r + 6])], { size: 0.9, tone: "faint" })}</g>`);
  out.push(L(k.sideRing([FRONT, BUTTON.y, BUTTON.z + BUTTON.r + 6], 2, "x", P, 16), { tone: "lo" }));
  return out.join("");
}

function knob() {
  const F = alongX(KNOB.y, KNOB.z);
  const out = [];
  out.push(S(G.disc(0, 1.6, 4, F, P), { tone: "mid" }));
  const ribs = G.ribsOf(F, 2.2, 8.4, KNOB.r, 28, P, { fade: [0.05, 0.4], seams: true });
  out.push(S(G.disc(1.6, 8.6, KNOB.r, F, P), { tone: "mid" }));
  out.push(k.fadedSvg(ribs, { tone: "lo" }));
  out.push(L(frontPath([onFront(KNOB.y, KNOB.z, 1.2, 0.5, FRONT + 8.65), onFront(KNOB.y, KNOB.z, KNOB.r - 1.4, 0.5, FRONT + 8.65)]), { tone: "hi" }));
  out.push(D([at(onFront(KNOB.y, KNOB.z, 1.2, 0.5, FRONT + 8.65))], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function wand() {
  const out = [];
  const { x, y, top, tip } = WAND;
  const arm = G.frameAlong([FRONT, y, top], X);
  out.push(S(G.disc(0, 2, 5, arm, P), { tone: "mid" }));
  out.push(S(G.disc(2, x - FRONT - 2.6, 2.2, arm, P), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.2, tip + 4, top - tip - 4, P, 18), { tone: "mid", crease: "none" }));
  // A cork grip sleeve with seam rings.
  out.push(S(k.cylinder(x, y, 3.3, top - 22, 14, P, 22), { tone: "lo", inner: L([top - 19, top - 15.5, top - 12].map((z) => k.sideArc(x, y, 3.3, z, P, 16)).join(""), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, 2.8, tip, 4, P, 18, 0.3), { tone: "mid" }));
  out.push(S(G.sphereOf([x, y, top], 3.2, P), { tone: "mid" }));
  return out.join("");
}

function tray() {
  const out = [];
  out.push(S(k.slabOf(TRAY, BODY_Z + 2, TRAY_TOP - BODY_Z - 2, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(TRAY, BODY_Z + 8, P, 4), { tone: "faint" }) }));
  const grate = k.insetPlan(TRAY, 2.2);
  out.push(S(k.slabOf(grate, TRAY_TOP, GRATE_TOP - TRAY_TOP, P, 3), { tone: "lo", crease: "none" }));
  const slots = [];
  for (let i = 0; i < 12; i++) slots.push(k.planOutline({ x: grate.x + 5, y: grate.y + 5 + i * 9, w: grate.w - 10, d: 3.4, r: 1.7 }, GRATE_TOP, P, 3));
  out.push(L(slots.join(""), { tone: "faint" }));
  // A float window on the tray front shows how full the tray is.
  const front = TRAY.x + TRAY.w;
  out.push(L(slotOn("x", -46, -26, BODY_Z + 7, BODY_Z + 12, front), { tone: "lo" }));
  out.push(`<path data-part="float" class="es-coffee" d="${slotOn("x", -45, -38, BODY_Z + 8, BODY_Z + 11, front)}"/>`);
  return out.join("");
}

// The cup: drawn as body, then the opening and the coffee, then its front wall again over the stream.
const cupRim = (r, z) => k.ring(CUP.x, CUP.y, r, z, P, 48);
const coffeeAt = (grams) => CUP_FLOOR + (Math.min(grams, SHOT.out + 4) / SHOT.out) * FILL_H;
function cupBody() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.cylinder(CUP.x, CUP.y, CUP.r, CUP.z, 0.1, P, 40).fill}" style="filter:blur(4px)"/>`);
  const handle = G.frameOf([CUP.x - 1.8, CUP.y - CUP.r - 4, CUP.z + 15], X, [0, 0, 1], [0, 1, 0]);
  out.push(S(G.ringBand(0, 3.6, 3.4, 6.2, handle, P), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(CUP.x, CUP.y, CUP.r - 3, CUP.z, 2.4, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(CUP.x, CUP.y, CUP.r, CUP.z + 2.4, CUP.h - 2.4, P, 48, 0.6), { tone: "hi", crease: "lo" }));
  out.push(`<clipPath id="es-mouth"><path d="${cupRim(CUP.inner, CUP_TOP)}"/></clipPath>`);
  out.push(`<path class="es-inside" d="${cupRim(CUP.inner, CUP_TOP)}"/>`);
  out.push(`<g clip-path="url(#es-mouth)"><path data-part="coffee" class="es-coffee" d="${cupRim(CUP.inner, coffeeAt(0))}"/><path data-part="crema" class="iso-line" data-tone="faint" d="${cupRim(CUP.inner * 0.62, coffeeAt(0))}"/></g>`);
  return out.join("");
}
function cupFront() {
  // Everything outside the mouth: the near wall that hides the stream's foot and the coffee's near edge.
  const box = `M0 0H${WIDTH}V${HEIGHT}H0Z`;
  const out = [`<clipPath id="es-wall"><path clip-rule="evenodd" d="${box}${cupRim(CUP.inner, CUP_TOP)}"/></clipPath>`];
  const wall = k.cylinder(CUP.x, CUP.y, CUP.r, CUP.z + 2.4, CUP.h - 2.4, P, 48, 0.6);
  out.push(`<g clip-path="url(#es-wall)">${S({ ...wall, outline: "" }, { tone: "hi", crease: "lo" })}</g>`);
  out.push(L(cupRim(CUP.inner, CUP_TOP), { tone: "lo" }));
  return out.join("");
}

// Coffee streams from the two spouts down to the surface.
const streamOf = (grams, flow) => {
  const surface = coffeeAt(grams);
  const width = 0.5 + flow * 1.1;
  return SPOUTS.map(([x, y]) => {
    const a = at([x, y, SPOUT_Z]);
    const b = at([x, y, surface]);
    return `M${(a[0] - width / 2).toFixed(2)} ${a[1].toFixed(2)}L${(a[0] + width / 2).toFixed(2)} ${a[1].toFixed(2)}L${(b[0] + width / 2).toFixed(2)} ${b[1].toFixed(2)}L${(b[0] - width / 2).toFixed(2)} ${b[1].toFixed(2)}Z`;
  }).join("");
};
function streams() {
  const mouth = at([CUP.x, CUP.y, CUP_TOP]);
  const clip = `M0 0H${WIDTH}V${mouth[1].toFixed(1)}H0Z${cupRim(CUP.inner, CUP_TOP)}`;
  return `<clipPath id="es-fall"><path d="${clip}"/></clipPath><g clip-path="url(#es-fall)"><path data-part="stream" class="es-stream" d="" /></g>`;
}

function group() {
  const out = [];
  const [gx, gy] = GROUP;
  // Spout block and the two spouts.
  for (const [x, y] of byDepth(SPOUTS)) out.push(S(k.cylinder(x, y, 1.9, SPOUT_Z, 8, P, 14), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(gx, gy, 8, SPOUT_Z + 6, BOWL_Z - SPOUT_Z - 6, P, 28, 0.4), { tone: "mid" }));
  // The basket holder: a turned bowl that carries the 18 g puck.
  const V = G.frameOf([gx, gy, BOWL_Z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  out.push(S(G.solidOf([[0, 9], [3, 13.6, 1], [RING_Z - BOWL_Z, 16]], V, P), { tone: "mid" }));
  out.push(S(G.disc(RING_Z - BOWL_Z, HEAD_Z - BOWL_Z, 17.2, V, P), { tone: "mid", inner: L(G.arcOf(V, RING_Z - BOWL_Z + 4.5, 17.2, P), { tone: "faint" }) }));
  // Bayonet lugs on the holder ring.
  for (const angle of [Math.PI / 2 + 0.5, -Math.PI / 2 - 0.5].sort((a, b) => depth(...G.pointOf(V, 0, 1, a)) - depth(...G.pointOf(V, 0, 1, b)))) {
    const c = G.pointOf(V, 0, 18.4, angle);
    out.push(S(k.cylinder(c[0], c[1], 2.4, RING_Z + 2, 5, P, 14), { tone: "mid" }));
  }
  // Neck from the front face, then the head with its gasket line and cap.
  out.push(S(k.slabOf({ x: FRONT, y: gy - 15, w: gx - FRONT, d: 30, r: 3 }, HEAD_Z + 2, HEAD_TOP - HEAD_Z - 6, P, 3, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(gx, gy, 19.5, HEAD_Z, HEAD_TOP - HEAD_Z, P, 56, 0.8), { tone: "mid", inner: L([HEAD_Z + 3, HEAD_TOP - 6].map((z) => k.sideArc(gx, gy, 19.5, z, P, 40)).join(""), { tone: "faint" }) }));
  out.push(D(G.dotsOf(G.frameOf([gx, gy, HEAD_TOP], [0, 0, 1], [1, 0, 0], [0, 1, 0]), 0, 15.5, 6, P, { all: true }), { size: 0.5 }));
  out.push(L(k.ring(gx, gy, 15.5, HEAD_TOP, P, 48), { tone: "faint" }));
  out.push(S(k.cylinder(gx, gy, 10, HEAD_TOP, 6, P, 36, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(gx, gy, 4.4, HEAD_TOP + 6, 4, P, 20), { tone: "hi", crease: "lo" }));
  return out.join("");
}

// The portafilter handle runs forward and to the right, a little down.
function handle() {
  const dir = [0.86, -0.48, -0.17];
  const F = G.frameAlong([GROUP[0], GROUP[1], RING_Z + 4], dir);
  const out = [];
  out.push(S(G.solidOf([[16, 4.2], [24, 3.6], [26, 4.4]], F, P), { tone: "mid" }));
  const grip = [[26, 5], [34, 5.6, 1], [62, 6.4, 1], [70, 6.2, 1], [74, 4.8, 1], [75.5, 2.4, 1], [76, 0]];
  const ribs = G.ribsOf(F, 30, 56, 5.9, 22, P, { fade: [0.05, 0.4], r1: 6.3 });
  out.push(S(G.solidOf(grip, F, P), { tone: "lo", inner: k.fadedSvg(ribs, { tone: "faint" }) + L(G.arcOf(F, 30, 5.45, P, { slope: 0.03 }) + G.arcOf(F, 56, 6.3, P, { slope: 0.03 }), { tone: "faint" }) }));
  return out.join("");
}

function tamper() {
  const [x, y] = TAMPER;
  const out = [`<path class="iso-halo" d="${k.cylinder(x, y, 15, 0, 0.1, P, 40).fill}" style="filter:blur(4px)"/>`];
  out.push(S(k.cylinder(x, y, 14.5, 0, 7, P, 48, 0.6), { tone: "hi", crease: "lo", inner: L(k.sideArc(x, y, 14.5, 2.2, P, 36), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, 6, 7, 3, P, 24), { tone: "mid" }));
  const V = G.frameOf([x, y, 10], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  out.push(S(G.solidOf([[0, 4.2], [6, 3.4, 1], [14, 4.6, 1], [22, 8.2, 1], [27, 7.6, 1], [29.5, 4, 1], [30, 0]], V, P), { tone: "mid" }));
  return out.join("");
}

const FLOW = SHOT.out / (SHOT.end - SHOT.firstDrop);
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An espresso machine on a wooden board, seen from the front left. A pressure gauge and a timer display sit high on the front, a group head with a portafilter sticks out below them over a cup on the drip tray, and a steam wand hangs at the left. Pulling a shot moves the gauge needle up to 9 bar while two streams of coffee fill the cup.",
  body: [
    board(),
    machine(),
    topBack(),
    byDepth([[-96, -32], [-58, -32]]).map(([x, y]) => warmCup(x, y)).join(""),
    topFront(),
    gauge(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="both" d="${needleAt(0)}" style="stroke-width:1.1"/>`,
    hub(),
    display(),
    button(),
    knob(),
    tray(),
    cupBody(),
    streams(),
    cupFront(),
    group(),
    handle(),
    wand(),
    tamper(),
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const SHOT = ${JSON.stringify(SHOT)};
const FLOW = ${FLOW};
const GAUGE = ${JSON.stringify(GAUGE)}, FRONT = ${FRONT}, BAR_MAX = ${BAR_MAX}, SWEEP = ${SWEEP};
const CUP = ${JSON.stringify(CUP)}, CUP_FLOOR = ${CUP_FLOOR}, FILL_H = ${FILL_H}, SPOUT_Z = ${SPOUT_Z};
const SPOUTS = ${JSON.stringify(SPOUTS)};
const DISPLAY_TEXT_AT = ${JSON.stringify(DISPLAY_TEXT_AT)};
const at = (point) => iso(point, P);
const onFront = ${onFront.toString()};
const barAngle = ${barAngle.toString()};
const needleAt = ${needleAt.toString().replace("k.pathOf", "pathOf")};
const coffeeAt = ${coffeeAt.toString()};
const cupRim = (r, z) => ring(CUP.x, CUP.y, r, z, P, 48);
const streamOf = ${streamOf.toString()};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const needle = svg.querySelector('[data-part="needle"]');
const coffee = svg.querySelector('[data-part="coffee"]');
const crema = svg.querySelector('[data-part="crema"]');
const stream = svg.querySelector('[data-part="stream"]');
const screen = svg.querySelector('[data-part="screen"]');
const lamp = svg.querySelector('[data-part="lamp"] circle');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// The true shot: pump pressure rises to 9 bar, the first drops reach the cup at 6 s,
// then about 1.6 g/s runs until 36 g at 28 s, when the pump stops and the valve vents the group.
const pressureAt = (t) => t < 0 ? 0 : t <= SHOT.end ? SHOT.bar * (1 - Math.exp(-t / SHOT.rise)) : SHOT.bar * (1 - Math.exp(-SHOT.end / SHOT.rise)) * Math.exp(-(t - SHOT.end) / 0.5);
const flowAt = (t) => {
  if (t < SHOT.firstDrop || t > SHOT.end + 1.5) return 0;
  const on = Math.min(1, (t - SHOT.firstDrop) / 1.5);
  const off = t > SHOT.end ? Math.max(0, 1 - (t - SHOT.end) / 1.5) : 1;
  return on * off;
};
const yieldAt = (t) => {
  if (t <= SHOT.firstDrop) return 0;
  const end = Math.min(t, SHOT.end);
  let grams = (end - SHOT.firstDrop) * FLOW - 0.75 * FLOW;
  grams = Math.max(0, grams);
  if (t > SHOT.end) grams += Math.min(1.5, t - SHOT.end) * FLOW * 0.5;
  return Math.min(SHOT.out + 0.75 * FLOW, Math.max(0, grams + (t < SHOT.firstDrop + 1.5 ? 0 : 0)));
};

let clock = -1, brewing = false, bar = 0, frame = 0, last = 0, visible = false, rest = 0, touring = true;
const CYCLE = SHOT.end + 6;
function draw(t) {
  const grams = brewing || t > 0 ? yieldAt(Math.max(0, t)) : 0;
  const flow = flowAt(t);
  needle.setAttribute("d", needleAt(bar));
  const level = coffeeAt(grams);
  coffee.setAttribute("d", cupRim(CUP.inner, level));
  crema.setAttribute("d", grams > 1 ? cupRim(CUP.inner * 0.62, level) : "");
  stream.setAttribute("d", flow > 0.02 ? streamOf(grams, flow) : "");
  const seconds = Math.max(0, Math.min(t, SHOT.end));
  const shown = t < 0 ? SHOT.temp + "°" : seconds.toFixed(0) + "s";
  if (screen.textContent !== shown) screen.textContent = shown;
  lamp.style.opacity = t >= 0 && t <= SHOT.end ? "1" : "";
  const phase = t < 0 ? "ready · " + SHOT.temp + " °C" : t < SHOT.firstDrop ? "pre-infusion" : t <= SHOT.end ? "extracting" : "done";
  const text = phase + " · " + bar.toFixed(1) + " bar · " + Math.max(0, t < 0 ? 0 : seconds).toFixed(1) + " s · " + grams.toFixed(1) + " g out";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (clock >= 0) clock += dt;
  if (clock > CYCLE) { clock = -1; brewing = false; rest = 0; }
  if (clock < 0) { rest += dt; if (touring && rest > 2.5) start(); }
  const want = clock < 0 ? 0 : pressureAt(clock);
  bar = still.matches ? want : bar + (want - bar) * (1 - Math.exp(-dt / 0.18));
  draw(clock);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
function start() { clock = 0; brewing = true; rest = 0; }
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function pull() { touring = false; if (clock < 0 || clock > SHOT.end) start(); else clock = SHOT.end + 0.001; run(); }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("click", pull);
stage.addEventListener("keydown", (event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); pull(); } });
if (still.matches) { touring = false; clock = 16; bar = pressureAt(16); }
draw(clock);
`;

const style = `<style>
.es-coffee{fill:var(--anatomy-mid);stroke:none}
.es-inside{fill:var(--anatomy-shade-0);stroke:none}
.es-stream{fill:var(--anatomy-hi);stroke:none}
.es-glass{fill:var(--anatomy-shade-0);stroke:none}
.iso-stage{cursor:pointer;outline:none}
</style>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Espresso machine",
  hint: "Click or press space to pull a shot",
  readout: `ready · ${SHOT.temp} °C · 0.0 bar · 0.0 s · 0.0 g out`,
  keys: [
    { mark: "lit", label: "Gauge needle: pump pressure at the group, 0–16 bar" },
    { mark: "raised", label: "Cup and streams: 18 g of ground coffee in, 36 g of espresso out" },
  ],
  caption:
    `A pump pushes ${SHOT.temp} °C water from the boiler through 18 g of tamped coffee in the portafilter. Pressure climbs to about 9 bar in a few seconds, the first drops reach the cup around 6 s, and a 1:2 shot of 36 g is done at about 28 s, when the pump stops and a valve vents the group. Typical numbers for a double shot; the tamper on the board is 58 mm, the size of the basket.`,
  body: `${style}<div class="iso-stage" tabindex="0" role="button" aria-label="Espresso machine: press space or click to pull a shot">${svg}</div>`,
});

const name = theme === "light" ? "espresso-machine-light.html" : "espresso-machine.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Espresso machine", theme, body, script: kitScript() + live }));
console.log("wrote", name);
