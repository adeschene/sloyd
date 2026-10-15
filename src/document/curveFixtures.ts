import type { CurveCut } from './types';

/** TEST-ONLY fixtures (as treeFixtures.ts): importing a test module would re-register its tests in the importer. */

/** An arch on a 30 × 5 apron: 3" in from each length end, 1-1/2" rise, on the width min side (spec §2.2). */
export const ARCH: CurveCut = {
  id: 'c1', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [3, 0],
  segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1.5 }, { type: 'line', to: [3, 0] }],
};
/** The length-max / width-min corner of a 36 × 20 top rounded to 2". */
export const CORNER: CurveCut = {
  id: 'c2', through: 'thickness', uFrom: 'max', vFrom: 'min', start: [0, 0],
  segments: [{ type: 'line', to: [2, 0] }, { type: 'arc', to: [0, 2], side: 'left', radius: 2 }, { type: 'line', to: [0, 0] }],
};
