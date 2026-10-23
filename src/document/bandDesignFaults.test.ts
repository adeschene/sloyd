import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { bandDesignFaults } from './bandDesignFaults';
import { bandFaults } from './banding';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID } from './bandModel';
import type { Band, BandType, Board, SloydDocument } from './types';

const project = (boards: Board[], bandTypes: BandType[]): SloydDocument =>
  migrateDocument(JSON.parse(JSON.stringify({ ...createDocument('T'), boards, bandTypes })));
const INCH: BandType = { id: 'e1', name: 'Oak lipping', kind: 'solid', thickness: 1, lengthAllowance: 0.5, material: 'oak', widthAllowance: 0.0625 };
const band = (across: Band['side']['across'], from: Band['side']['from'], type: string): Band => ({ side: { across, from }, type });

describe('bandDesignFaults (AI-bands spec §3.2)', () => {
  // The brief's "1in solid band on a 3/4in-thick part's end" alone faults nothing (too-thick needs the band(s) across a
  // dimension to reach it): a 3/4in-square stick, its 1in band on a long edge (0.75 across), is the reachable form.
  const stick = createBoard({ name: 'Stick', length: 12, width: 0.75, thickness: 0.75, bands: [band('width', 'min', 'e1')] });

  it('a 1in solid band on a 3/4in-thick stick raises one too-thick band-fault, in world and bench words', () => {
    const flat = flatDocument(project([stick], [BUILT_IN_BAND, INCH]));
    expect(flat.boards[0]!.bands).toHaveLength(1);
    expect(bandDesignFaults(flat, flat.units)).toEqual([{ kind: 'band-fault', parts: ['Stick'],
      message: "Stick's edging on -z is thicker than the part allows.",
      shown: "Stick's edging on the width min side is thicker than the part allows." }]);
  });

  it('veneer (7/8in wide) on a 1in-thick part is tape-narrow; a band-free or sound part raises nothing', () => {
    const thick = createBoard({ name: 'Slab', length: 20, width: 10, thickness: 1, bands: [band('length', 'max', BUILT_IN_BAND_ID)] });
    const sound = createBoard({ name: 'Shelf', length: 20, width: 10, thickness: 0.75, bands: [band('width', 'max', BUILT_IN_BAND_ID)], position: [0, 0, 20] });
    const plain = createBoard({ name: 'Plain', length: 20, width: 10, thickness: 0.75, position: [0, 0, 40] });
    const flat = flatDocument(project([thick, sound, plain], [BUILT_IN_BAND]));
    expect(bandFaults(flat.boards[1]!, flat.bandTypes)).toEqual([]);
    expect(bandDesignFaults(flat, flat.units)).toEqual([{ kind: 'band-fault', parts: ['Slab'],
      message: "Slab's edging on +x is narrower than the part is thick.",
      shown: "Slab's edging on the length max end is narrower than the part is thick." }]);
  });

  it('one violation per (part, side, kind): two faulted sides, two violations', () => {
    const both = { ...stick, bands: [band('width', 'min', 'e1'), band('width', 'max', 'e1')] };
    const flat = flatDocument(project([both], [BUILT_IN_BAND, INCH]));
    expect(bandDesignFaults(flat, flat.units).map((v) => v.message)).toEqual([
      "Stick's edging on -z is thicker than the part allows.",
      "Stick's edging on +z is thicker than the part allows.",
    ]);
  });
});
