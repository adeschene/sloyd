import { designToDocument } from '../../document/generated';
import { migrateDocument } from '../../document/document';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { findSites, rangesOf, siteLabel, stopLabel } from './sites';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const named = (doc: ReturnType<typeof design>) => (i: number) => doc.boards[i].name;

describe('findSites', () => {
  it('a rail end against a leg is end-into-face, rail entering', () => {
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
    );
    const [s] = findSites(doc);
    expect(findSites(doc)).toHaveLength(1);
    expect(s.kind).toBe('end-into-face');
    expect(named(doc)(s.enter)).toBe('Rail');
    expect(named(doc)(s.receive)).toBe('Leg');
    expect(s.axis).toBe(0);
    expect(s.side).toBe(-1);
    expect(s.allowed).toEqual(['mortise-tenon', 'dado', 'butt']);
    expect(s.stopEnds).toEqual([]);
    expect(siteLabel(s, doc)).toBe('Rail → Leg: end into face');
    expect(rangesOf(s, doc).tenonLength).toEqual([0.5, 1.5]);
  });

  it('a shelf end flush with a side front and back offers a stopped dado at either end', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('end-into-face');
    expect(named(doc)(s.enter)).toBe('Shelf');
    expect(s.allowed).toEqual(['mortise-tenon', 'dado', 'stopped-dado', 'butt']);
    expect(s.stopEnds.map(stopLabel)).toEqual(['-Z', '+Z']);
    expect(rangesOf(s, doc).dadoDepth).toEqual([0.125, 0.375]);
    expect(rangesOf(s, doc).inset(s.stopEnds[0])).toEqual([0.25, 5.625]);
  });

  it('a thin back panel against a side\'s back edge is face-against-edge', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('face-against-edge');
    expect(named(doc)(s.enter)).toBe('Back');
    expect(s.allowed).toEqual(['rabbet', 'butt']);
    expect(rangesOf(s, doc).rabbetDepth).toEqual([0.125, 0.375]);
  });

  it('a back panel meeting a shelf\'s back edge mid-panel is NOT a site (rule 3 needs the panel\'s edge)', () => {
    const doc = design(
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('a 3/4in top on an apron\'s edge is NOT a site (rule 3 needs a thin panel)', () => {
    const doc = design(
      { name: 'Apron', at: [0, 0, 0], size: [20, 3.5, 0.75] },
      { name: 'Top', at: [-1, 3.5, -5], size: [22, 0.75, 12] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('a 3/4in top flush with an apron\'s end is still NOT a site (thinness, independent of the panel-edge rule)', () => {
    const doc = design(
      { name: 'Apron', at: [0, 0, 0], size: [20, 3.5, 0.75] },
      { name: 'Top', at: [0, 3.5, -5], size: [20, 0.75, 12] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('a top resting on a side\'s END is end-into-face with the side entering (rule 2 wins)', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Top', at: [0, 30, 0], size: [22, 0.75, 11.25] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('end-into-face');
    expect(named(doc)(s.enter)).toBe('Side');
  });

  it('two crossing stretchers of equal thickness are a crossing, the upper one moving', () => {
    const doc = design(
      { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
      { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('crossing');
    expect(named(doc)(s.enter)).toBe('Upper');
    expect(s.side).toBe(-1);
    expect(s.allowed).toEqual(['half-lap', 'butt']);
  });

  it('a cleat lapped under a seat is NOT a site (it does not cross)', () => {
    const doc = design(
      { name: 'Seat', at: [0, 10, 0], size: [20, 0.75, 12] },
      { name: 'Cleat', at: [2, 9.25, 1], size: [1, 0.75, 10] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('two ends meeting are NOT a site', () => {
    const doc = design(
      { name: 'A', at: [0, 0, 0], size: [10, 2, 1] },
      { name: 'B', at: [10, 0, 0], size: [10, 2, 1] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('numbers sites from 1 in (enter, receive, axis) order', () => {
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Leg 2', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
    );
    const sites = findSites(doc);
    expect(sites.map((s) => s.id)).toEqual([1, 2]);
    expect(sites.map((s) => named(doc)(s.receive))).toEqual(['Leg', 'Leg 2']);
  });
});

describe('findSites — stopped dado needs room', () => {
  it('a part under 1/2in along the stop axis, flush with the side, offers no stopped dado', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Slat', at: [0.75, 12, 0], size: [20, 0.75, 0.4] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('end-into-face');
    expect(s.stopEnds).toEqual([]);
    expect(s.allowed).not.toContain('stopped-dado');
  });
});

describe('findSites — the real workbench', () => {
  // Fixture geometry (world boxes, inches). Legs 3.5 sq x 33.25 tall, tops at y=33.25.
  // Rails 1.5 thick, 5.5 (top, y 27.75-33.25) / 3.5 (low, y 6-9.5) wide, ends flush on leg faces.
  // Lower shelf 0.75 thick at y 5.25-6, x -26.5..26.5, z -10.5..10.5. Benchtop 1.5 thick, y 33.25-34.75.
  const labels = () => {
    const doc = migrateDocument(JSON.parse(workbenchRaw));
    return findSites(doc).map((s) => siteLabel(s, doc));
  };
  it('lists every joint site, each explained', () => {
    expect(labels()).toEqual([
      // Each leg's top end (whole 3.5x3.5 end = contact area) meets the benchtop underside: end into face, leg enters.
      'Front left leg → Benchtop: end into face',
      'Front right leg → Benchtop: end into face',
      'Back left leg → Benchtop: end into face',
      'Back right leg → Benchtop: end into face',
      // Front top rail: each end (5.5x1.5, whole end) touches a front leg's inner X face.
      'Front top rail → Front left leg: end into face',
      'Front top rail → Front right leg: end into face',
      // Back top rail: same, onto the back legs.
      'Back top rail → Back left leg: end into face',
      'Back top rail → Back right leg: end into face',
      // Left top rail runs along Z (rotated 90): its ends touch the left legs' Z faces at z=-8.5 and 8.5.
      'Left top rail → Front left leg: end into face',
      'Left top rail → Back left leg: end into face',
      // Right top rail: same on the right legs.
      'Right top rail → Front right leg: end into face',
      'Right top rail → Back right leg: end into face',
      // The four low rails repeat the same four pairings (3.5x1.5 whole ends).
      'Front low rail → Front left leg: end into face',
      'Front low rail → Front right leg: end into face',
      'Back low rail → Back left leg: end into face',
      'Back low rail → Back right leg: end into face',
      'Left low rail → Front left leg: end into face',
      'Left low rail → Back left leg: end into face',
      'Right low rail → Front right leg: end into face',
      'Right low rail → Back right leg: end into face',
      // NOT sites: the shelf's end touches each leg over only 2x0.75 (< its 21x0.75 end), no rule fits;
      // rails' top edges against the 1.5in benchtop fail rule 3 (not thin); rails never touch each other.
    ]);
  });
});
