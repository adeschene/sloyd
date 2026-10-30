import { SNAP_COLORS, RING_COLOR } from './SnapMarker';

// The floors in SnapMarker.tsx's header (fu 249, fu 590), measured the way `docs/snap-hues/cvd.mjs` measures them:
// CIEDE2000 on CIELAB (D65), CVD by Machado 2009 at severity 1 applied in linear RGB, WCAG 2.x contrast.

const MAPLE = '#ebe3d4';
const OAK = '#c8955a'; // BoardMesh's SELECTED

type Rgb = [number, number, number];
const rgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

const MACHADO = {
  deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
} as const;
type Vision = keyof typeof MACHADO;

function simulate(c: Rgb, v: Vision): Rgb {
  const l = c.map(lin);
  return MACHADO[v].map((r) => gam(r[0] * l[0]! + r[1] * l[1]! + r[2] * l[2]!)) as Rgb;
}

function luminance(c: Rgb): number {
  const l = c.map(lin);
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function lab(c: Rgb): Rgb {
  const [r, g, b] = c.map(lin) as Rgb;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const X = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const Y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const Z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

function ciede2000([L1, a1, b1]: Rgb, [L2, a2, b2]: Rgb): number {
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hb = hp1 + hp2 < 360 ? hb + 360 : hb - 360;
    hb /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad)
    + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dth = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T, RT = -Math.sin(2 * dth * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

const deltaE = (a: string, b: string, v?: Vision) =>
  v ? ciede2000(lab(simulate(rgb(a), v)), lab(simulate(rgb(b), v))) : ciede2000(lab(rgb(a)), lab(rgb(b)));

const kinds = Object.entries(SNAP_COLORS);
const pairs = kinds.flatMap(([a, ha], i) => kinds.slice(i + 1).map(([b, hb]) => [a, ha, b, hb] as const));

describe('snap-marker colours (SnapMarker.tsx header; fu 249, fu 590)', () => {
  // Pins the measurement against published figures, so a broken ΔE cannot pass every floor vacuously:
  // fu 590 records round 1's guide/line pair as 12.7 normal and 8.1 under deuteranopia.
  it('reproduces fu 590\'s recorded figures', () => {
    expect(deltaE('#5469a6', '#4a86b8')).toBeCloseTo(12.7, 1);
    expect(deltaE('#5469a6', '#4a86b8', 'deut')).toBeCloseTo(8.1, 1);
  });

  it.each(kinds)('%s %s: ≥ 3:1 on the maple ground, ≥ 3.4:1 on the ring, ≥ 35 ΔE from the selected oak', (_k, hex) => {
    expect(contrast(hex, MAPLE)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex, RING_COLOR)).toBeGreaterThanOrEqual(3.4);
    expect(deltaE(hex, OAK)).toBeGreaterThanOrEqual(35);
  });

  it.each(pairs)('%s %s against %s %s: ΔE ≥ 25 normal, ≥ 14 deuteranopia and protanopia', (_a, ha, _b, hb) => {
    expect(deltaE(ha, hb)).toBeGreaterThanOrEqual(25);
    expect(deltaE(ha, hb, 'deut')).toBeGreaterThanOrEqual(14);
    expect(deltaE(ha, hb, 'prot')).toBeGreaterThanOrEqual(14);
  });
});
