import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument } from '../../document/document';
import type { FlatDocument } from '../../document/document';
import { SHAKER_TABLE_JSON } from '../../document/shakerTableFixture';
import { applyJoints } from './recipes';
import type { JoinWatch, JointChoice } from './recipes';
import { findSites } from './sites';
import { defaultChoice } from './choose';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);

type Event = { what: 'cut' | 'resize'; part: number; amount?: number };
/** Records each event as it arrives; `cuts` and `dims` snapshot the board at that moment. */
const recorder = () => {
  const events: Event[] = [];
  const seen: { part: number; cuts: number; length: number }[] = [];
  const watch: JoinWatch = {
    cut: (part, b) => { events.push({ what: 'cut', part }); seen.push({ part, cuts: b.cuts.length, length: b.length }); },
    resize: (part, b, _d, _end, amount) => { events.push({ what: 'resize', part, amount }); seen.push({ part, cuts: b.cuts.length, length: b.length }); },
  };
  return { events, seen, watch };
};
/** Ids are minted per run, so two runs agree on everything but them. */
const withoutIds = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' ? undefined : x)));
const kinds = (events: Event[], part: number) => events.filter((e) => e.part === part).map((e) => e.what);

const rabbetPick = (depth: number) => (s: { id: number; kind: string }): JointChoice => s.kind === 'face-against-edge'
  ? { site: s.id, joint: 'rabbet', depth } : { site: s.id, joint: 'butt' };
const lapAll = (s: { id: number }): JointChoice => ({ site: s.id, joint: 'half-lap' });

const mortise = () => {
  const doc = design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] });
  return { doc, choices: [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }] as JointChoice[] };
};
const dado = (stopped: boolean) => {
  const doc = design({ name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] }, { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] });
  const sites = findSites(doc);
  const choices: JointChoice[] = [stopped
    ? { site: 1, joint: 'stopped-dado', depth: 0.25, stopAt: sites[0].stopEnds[1], inset: 0.75 }
    : { site: 1, joint: 'dado', depth: 0.25 }];
  return { doc, choices };
};
const rabbet = () => {
  const doc = design(
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
  );
  return { doc, choices: findSites(doc).map(rabbetPick(0.375)) };
};
const lap = () => {
  const doc = design({ name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] }, { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] });
  return { doc, choices: findSites(doc).map(lapAll) };
};
const shaker = () => {
  const doc = flatDocument(designToDocument(SHAKER_TABLE_JSON as never, { centre: false }).doc);
  const sites = findSites(doc);
  return { doc, choices: sites.map((s) => defaultChoice(s, doc, sites)) };
};
const run = (f: { doc: FlatDocument; choices: JointChoice[] }, watch?: JoinWatch) => applyJoints(f.doc, findSites(f.doc), f.choices, watch);

describe('applyJoints reports what it cuts and resizes', () => {
  it('mortise-tenon reports the entering part\'s growth, its four shoulder wastes, and the mortise', () => {
    const r = recorder();
    run(mortise(), r.watch);
    // Leg is part 0, Rail part 1: the rail grows by the tenon first, then four wastes, then the leg's mortise.
    expect(r.events).toEqual([
      { what: 'resize', part: 1, amount: 1 },
      { what: 'cut', part: 1 }, { what: 'cut', part: 1 }, { what: 'cut', part: 1 }, { what: 'cut', part: 1 },
      { what: 'cut', part: 0 },
    ]);
    // The resize is reported before it happens: the rail still has its old length and no cut.
    expect(r.seen[0]).toEqual({ part: 1, cuts: 0, length: 18 });
  });

  it('stopped-dado reports the notch on the entering part and the shortened pocket', () => {
    const r = recorder();
    run(dado(true), r.watch);
    expect(r.events).toEqual([{ what: 'resize', part: 1, amount: 0.25 }, { what: 'cut', part: 1 }, { what: 'cut', part: 0 }]);
    const plain = recorder();
    run(dado(false), plain.watch);
    expect(plain.events).toEqual([{ what: 'resize', part: 1, amount: 0.25 }, { what: 'cut', part: 0 }]);
  });

  it('rabbet reports each receiver\'s pocket, the butting part\'s trim (amount < 0), and the panel\'s own trims', () => {
    const r = recorder();
    run(rabbet(), r.watch);
    // Left 0, Right 1, Shelf 2, Back 3.
    expect(kinds(r.events, 0)).toEqual(['cut']);
    expect(kinds(r.events, 1)).toEqual(['cut']);
    const shelf = r.events.filter((e) => e.part === 2);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].what).toBe('resize');
    expect(shelf[0].amount).toBeCloseTo(-0.25, 9);
    const back = r.events.filter((e) => e.part === 3);
    // Trimmed to the rabbet lines at both of its side ends.
    expect(back).toHaveLength(2);
    for (const e of back) { expect(e.what).toBe('resize'); expect(e.amount!).toBeLessThan(0); }
    // The pockets come last, after every trim.
    expect(r.events.slice(-2).map((e) => e.what)).toEqual(['cut', 'cut']);
  });

  it('half-lap reports both notches', () => {
    const r = recorder();
    run(lap(), r.watch);
    // Upper (1) enters and is notched first, then Lower (0).
    expect(r.events).toEqual([{ what: 'cut', part: 1 }, { what: 'cut', part: 0 }]);
  });

  it.each([['mortise-tenon', mortise], ['dado', () => dado(false)], ['stopped-dado', () => dado(true)], ['rabbet', rabbet], ['half-lap', lap], ['shaker table', shaker]] as const)(
    'a watched %s run returns a result identical to an unwatched one', (_n, make) => {
      const f = make();
      const r = recorder();
      expect(withoutIds(run(f, r.watch))).toEqual(withoutIds(run(f)));
      expect(r.events.length).toBeGreaterThan(0);
    });
});
