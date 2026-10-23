import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { profileDesignFaults, profileFaultKinds } from './profileDesignFaults';
import { collapseViolations } from './assemblyChecks';
import { profileFaults } from './profiles';
import { problemKey } from '../generate/run';
import { carriedSummary } from './carryText';
import { ARCH } from './curveFixtures';
import type { Board, ProfileCut, SloydDocument } from './types';

const project = (boards: Board[]): SloydDocument =>
  migrateDocument(JSON.parse(JSON.stringify({ ...createDocument('T'), boards })));
const side = { across: 'width', from: 'max' } as const;
const roundover = (size: number, id = 'p1', over: Partial<ProfileCut> = {}): ProfileCut => ({
  id, face: 'max', kind: 'roundover', size, fillet: 0, facing: 'face',
  run: { start: { side, through: 'min' }, end: { side: { ...side }, through: 'max' } }, ...over,
});
const top = (profiles: ProfileCut[], extra: Partial<Board> = {}) =>
  createBoard({ name: 'Top', length: 24, width: 12, thickness: 0.75, profiles, ...extra });

describe('profileDesignFaults (AI-profiles spec R6.1)', () => {
  it('a 1in roundover on a 3/4in-thick top is a straight run that faults, in world and bench words', () => {
    const flat = flatDocument(project([top([roundover(1)])]));
    const b = flat.boards[0]!;
    expect(b.profiles).toHaveLength(1);
    const kinds = profileFaultKinds(b, b.profiles[0]!);
    expect(kinds).toEqual(['runs-off']);
    const v = profileDesignFaults(flat, flat.units);
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe('profile-fault');
    expect(v[0]!.parts).toEqual(['Top']);
    expect(v[0]!.message).toBe("Top's roundover on +y/+z is bigger than the edge.");
    expect(v[0]!.shown).toMatch(/^Top's roundover 1" on the edge between the thickness face \(max side\) and the width face \(max side\) /);
  });

  it('the straight-run curveFaults branch is what catches the oversized bit', () => {
    const flat = flatDocument(project([top([roundover(1)])]));
    const b = flat.boards[0]!;
    // profileFaults alone finds nothing here (the prism overrun is curveFaults' kind): only the straight-run branch reports it.
    expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
    expect(profileFaultKinds(b, b.profiles[0]!)).toEqual(['runs-off']);
  });

  it('a sound profile raises nothing; a profile-free part raises nothing', () => {
    const flat = flatDocument(project([top([roundover(0.25)]), createBoard({ name: 'Plain', length: 5, width: 5, thickness: 1, position: [0, 0, 40] })]));
    expect(profileDesignFaults(flat, flat.units)).toEqual([]);
  });

  it('a curved part\'s profile fault is not reported (carried, never authored)', () => {
    const flat = flatDocument(project([top([roundover(1)], { curves: [ARCH] })]));
    expect(flat.boards[0]!.curves.length).toBeGreaterThan(0);
    expect(profileDesignFaults(flat, flat.units)).toEqual([]);
  });

  it('a part with a two-side run (carried, never authored) raises no profile-fault though its profile is faulted', () => {
    const two = roundover(5, 'p9', { run: {
      start: { side: { across: 'width', from: 'max' }, from: 'min', at: 20 },
      end: { side: { across: 'length', from: 'max' }, from: 'min', at: 6 },
    } });
    const flat = flatDocument(project([top([two])]));
    const b = flat.boards[0]!;
    expect(b.profiles).toHaveLength(1);
    expect(profileFaults(b, b.profiles[0]!).length).toBeGreaterThan(0);
    expect(profileDesignFaults(flat, flat.units)).toEqual([]);
  });

  it('two faulted profiles on one assembly part stay two problems', () => {
    const faulted = [roundover(1, 'p1'), roundover(1, 'p2', { kind: 'cove', face: 'min' })];
    const flat = flatDocument(project([top(faulted)]));
    const v = profileDesignFaults(flat, flat.units);
    expect(new Set(v.map((x) => x.message)).size).toBeGreaterThan(1);
    const authored = { parts: new Map([['Top', { label: 'Top', assembly: 'A', placement: 'A1' }]]), placements: new Map([['A', ['A1']]]) };
    expect(v).toHaveLength(2);
    expect(collapseViolations(v, authored)).toHaveLength(2);
  });

  it('carriedSummary\'s fault keys read the same helper (a resize that oversizes a straight profile is "no longer fits")', () => {
    // A CURVED part, so its profile is carried (AI-profiles spec R6.3; an uncurved one-side profile is authored, never a
    // carried-summary line). The straight top edge (width max) is opposite the arch.
    const mk = (t: number) => project([createBoard({ name: 'Apron', length: 30, width: 5, thickness: t, curves: [ARCH], profiles: [roundover(0.5)] })]);
    const thin = flatDocument(mk(0.4)).boards[0]!;
    expect(thin.profiles).toHaveLength(1);
    // Only the straight-run branch sees the bit run off a 0.4in-thick part (profileFaults is empty).
    expect(profileFaults(thin, thin.profiles[0]!)).toEqual([]);
    expect(profileFaultKinds(thin, thin.profiles[0]!)).toEqual(['runs-off']);
    expect(carriedSummary(mk(0.75), mk(0.4)).check).toEqual(['Apron was resized — its curve and edge profile no longer fit; see Properties.']);
    expect(carriedSummary(mk(0.75), mk(1)).check[0]).toMatch(/stay measured/);
  });

  it('shown text: a Roman ogee keeps its capital R and a loop reads "all round" without "on" (Ruling 12)', () => {
    const ogee = roundover(1, 'p1', { kind: 'ogee' });
    const f1 = flatDocument(project([top([ogee])]));
    const v1 = profileDesignFaults(f1, f1.units);
    expect(v1.length).toBeGreaterThan(0);
    expect(v1[0]!.shown).toBe('Top\'s Roman ogee 1" on the edge between the thickness face (max side) and the width face (max side) is bigger than the edge.');
    const loop = roundover(1, 'p2', { run: { loop: true } });
    const f2 = flatDocument(project([top([loop])]));
    const v2 = profileDesignFaults(f2, f2.units);
    expect(v2.length).toBeGreaterThan(0);
    expect(v2[0]!.shown).toBe('Top\'s roundover 1" all round the thickness face (max side) is bigger than the edge.');
  });

  it('a new faulted run at another span on an edge the original already faulted on is a distinct fault (final review)', () => {
    const stop = (a: number, z: number, id: string) => roundover(1, id, { run: {
      start: { side, from: 'min', at: a }, end: { side: { ...side }, from: 'min', at: z } } });
    const flat = flatDocument(project([top([stop(2, 10, 'p1'), stop(14, 20, 'p2')])]));
    const v = profileDesignFaults(flat, flat.units);
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.message)).toEqual([
      "Top's roundover on +y/+z from 2in to 10in is bigger than the edge.",
      "Top's roundover on +y/+z from 14in to 20in is bigger than the edge.",
    ]);
    expect(new Set(v.map((x) => problemKey(x))).size).toBe(2);
    expect(v.map((x) => x.shown)).toEqual([
      "Top's roundover 1\" on the edge between the thickness face (max side) and the width face (max side) from 2\" to 10\" is bigger than the edge.",
      "Top's roundover 1\" on the edge between the thickness face (max side) and the width face (max side) from 14\" to 20\" is bigger than the edge.",
    ]);
  });
});
