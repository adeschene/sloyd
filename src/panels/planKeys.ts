import type { Drawing, P2, Seg2, View } from '../document/drawing';
import type { PartFeature } from '../document/featureKeys';
import { labelHeight, labelWidth } from './diagramLabels';
import { toSvg, type Placement } from './planLayout';

/**
 * The trio's feature keys (feature callouts spec §4): per feature one view (§2.3), letters by identical key line in
 * reading order (§4.2), one tag per instance on a drawn line (§4.3; inv 16), merged and pushed clear (§4.4). Pure; SVG
 * units throughout, so collisions are judged as drawn.
 */
export const KEY_LEADER = 14;
export const KEY_PAD = 3;
export const KEY_PUSHES = 8;

export interface KeyView { view: View; d: Drawing; at: Placement }
export interface KeyTag { letter: string; anchor: P2; centre: P2 }
export interface KeyLine { letter: string; text: string; count: number; shown: string }
export interface KeyPlan { radius: number; tags: KeyTag[]; lines: KeyLine[]; notShown: string[]; unkeyed: string[] }

export const letterOf = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letterOf(Math.floor(i / 26) - 1) + letterOf(i % 26));

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** Ties go Front, then Side, then Plan (§2.3); `views` arrive Plan, Front, Side. */
const TIE = [1, 2, 0];

function isTrue(f: PartFeature, toward: readonly number[]): boolean {
  if (f.trueAxis) return Math.abs(dot(f.trueAxis, toward)) >= 1 - 1e-9;
  if (f.trueNormal) return Math.abs(dot(f.trueNormal, toward)) <= 1e-9;
  return false;
}
const owns = (f: PartFeature) => (s: Seg2) => s.feature !== undefined && f.tags.includes(s.feature);

export function chooseView(f: PartFeature, views: readonly KeyView[]): { i: number; hidden: boolean } | null {
  const has = (i: number, hidden: boolean) => (hidden ? views[i]!.d.hidden : views[i]!.d.visible).some(owns(f));
  const tru = (i: number) => isTrue(f, views[i]!.view.toward);
  const steps: [(i: number) => boolean, boolean][] = [
    [(i) => tru(i) && has(i, false), false],
    [(i) => has(i, false), false],
    [(i) => tru(i) && has(i, true), true],
    [(i) => has(i, true), true],                // ruling P2
  ];
  for (const [ok, hidden] of steps) {
    const i = TIE.find(ok);
    if (i !== undefined) return { i, hidden };
  }
  return null;
}

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function planKeys(features: readonly PartFeature[], views: readonly KeyView[], scale: number, size: { width: number; height: number }): KeyPlan {
  interface Inst { text: string; vi: number; anchor: P2; dir: P2 }
  const insts: Inst[] = [];
  const notShown: string[] = [];
  for (const f of features) {
    const c = chooseView(f, views);
    if (!c) { if (!notShown.includes(f.text)) notShown.push(f.text); continue; }
    const v = views[c.i]!;
    const map = toSvg(v.d, v.at, scale);
    const own = (c.hidden ? v.d.hidden : v.d.visible).filter(owns(f));
    const all = [...v.d.visible, ...v.d.hidden].filter((s) => s.part === f.part).flatMap((s) => [s.a, s.b]);
    const centre: P2 = [
      (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2,
      (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2,
    ];
    let best = own[0]!.a;
    for (const s of own) for (const p of [s.a, s.b]) if (dist(p, centre) > dist(best, centre) + 1e-12) best = p;
    const A = map(best);
    const C = map(centre);
    const l = dist(A, C);
    insts.push({ text: f.text, vi: c.i, anchor: A, dir: l > 1e-9 ? [(A[0] - C[0]) / l, (A[1] - C[1]) / l] : [0, -1] });
  }
  insts.sort((x, y) => x.vi - y.vi || x.anchor[1] - y.anchor[1] || x.anchor[0] - y.anchor[0]);

  const lines: KeyLine[] = [];
  const lineOf = new Map<string, KeyLine>();
  for (const i of insts) {
    let line = lineOf.get(i.text);
    if (!line) { line = { letter: letterOf(lines.length), text: i.text, count: 0, shown: '' }; lines.push(line); lineOf.set(i.text, line); }
    line.count += 1;
  }
  for (const l of lines) l.shown = l.count > 1 ? `${l.text} (${l.count}×)` : l.text;

  const r = Math.max(labelHeight(), ...lines.map((l) => labelWidth(l.letter))) / 2 + KEY_PAD;
  const clamp = (p: P2): P2 => [Math.min(Math.max(p[0], r), size.width - r), Math.min(Math.max(p[1], r), size.height - r)];
  const at = (i: Inst, k: number) => clamp([i.anchor[0] + i.dir[0] * (KEY_LEADER + r + k * r), i.anchor[1] + i.dir[1] * (KEY_LEADER + r + k * r)]);
  const tags: KeyTag[] = [];
  const unkeyed: string[] = [];
  const ordered = [...insts].sort((x, y) => lines.indexOf(lineOf.get(x.text)!) - lines.indexOf(lineOf.get(y.text)!));
  for (const i of ordered) {
    const letter = lineOf.get(i.text)!.letter;
    let centre = at(i, 0);
    if (tags.some((t) => t.letter === letter && dist(t.centre, centre) < 2 * r)) continue;   // merge (§4.4)
    let k = 0;
    while (tags.some((t) => dist(t.centre, centre) < 2 * r - 1e-9) && k < KEY_PUSHES) centre = at(i, ++k);
    if (tags.some((t) => dist(t.centre, centre) < 2 * r - 1e-9)) { if (!unkeyed.includes(letter)) unkeyed.push(letter); continue; }
    tags.push({ letter, anchor: i.anchor, centre });
  }
  return { radius: lines.length > 0 ? r : 0, tags, lines, notShown, unkeyed };
}
