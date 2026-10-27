import { designToDocument } from './generated';
import { flatDocument } from './document';
import { axisDimensions } from './geometry';
import type { Board } from './document';
import { resizeEnd } from './resizeEnd';

const grooved = (): Board => {
  const doc = flatDocument(designToDocument({
    name: 'T',
    parts: [{ name: 'P', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 12, y: 0.5, z: 4 } }],
  }).doc);
  const b = doc.boards[0];
  b.cuts = [{ id: 'g', face: 'thickness', from: 'min', across: 'length', offset: 1, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 }];
  return b;
};
const lengthAxis = (b: Board) => axisDimensions(b).indexOf('length');

describe('resizeEnd', () => {
  it('grows the max end and keeps a running groove running out', () => {
    const b = grooved();
    const k = lengthAxis(b);
    resizeEnd(b, k, 1, 0.5);
    expect(b.length).toBe(12.5);
    expect(b.cuts[0].stopMax).toBe(0);
    expect(b.cuts[0].stopMin).toBe(0);
  });

  it('grows the min end, drops the position, and keeps both ends running out', () => {
    const b = grooved();
    const k = lengthAxis(b);
    const at = b.position[k];
    resizeEnd(b, k, -1, 0.5);
    expect(b.length).toBe(12.5);
    expect(b.position[k]).toBeCloseTo(at - 0.5, 12);
    expect(b.cuts[0].stopMin).toBe(0);
    expect(b.cuts[0].stopMax).toBe(0);
  });

  it('calls onResize before anything changes, with the dimension, end and amount', () => {
    const b = grooved();
    const k = lengthAxis(b);
    const seen: unknown[] = [];
    resizeEnd(b, k, 1, 0.5, (d, end, amount) => { seen.push([d, end, amount, b.length]); });
    expect(seen).toEqual([['length', 'max', 0.5, 12]]);
  });
});
