import { describe, expect, it } from 'vitest';
import { bandedParts, bandedRefusal } from './bandedRefusal';
import { createBoard, createDocument } from './document';
import { joineryRefusal } from '../generate/joints/tapers';
import type { FlatDocument } from './types';

const flat = (bands: object[]): FlatDocument => ({ ...createDocument('T'),
  boards: [{ ...createBoard({ id: 'a', name: 'Shelf' }), bands }, createBoard({ id: 'b', name: 'Side' })] } as FlatDocument);
const tape = [{ side: { across: 'width', from: 'min' }, type: 'band-iron-on' }];

describe('banded projects (edge banding spec §6)', () => {
  it('names the banded parts', () => expect(bandedParts(flat(tape))).toEqual(['Shelf']));
  it('Refine refuses, in its words; nothing banded, nothing refused', () => {
    expect(bandedRefusal(flat(tape), 'refine')).toBe("Refine doesn't handle banded parts yet (Shelf). Refine before banding, or remove the bands first.");
    expect(bandedRefusal(flat([]), 'refine')).toBeNull();
  });
  it('joineryRefusal no longer carries it (joinery-features chunk 3)', () => {
    const d = flat(tape);
    expect(joineryRefusal(d, d)).toBeNull();
  });
});
