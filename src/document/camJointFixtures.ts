// TEST-ONLY. The cam-and-bolt joint's carcass: two upright sides and a flat shelf whose ends butt the sides' inner faces
// exactly. Never import a test module instead; never import this from production code.
import { createBoard, createDocument, migrateDocument } from './document';
import { mm } from './holes';
import type { SloydDocument } from './types';
import { isMetric, type Units } from '../units/length';

const IMPERIAL = { T: 0.75, depth: 12, tall: 30, apart: 24, shelfAt: 10 };
const METRIC = { T: mm(18), depth: mm(300), tall: mm(750), apart: mm(600), shelfAt: mm(250) };

/**
 * Two upright sides (`rotation: 90`, so thickness runs along world X), `T` thick, `depth` deep along Z and `tall` high,
 * standing `apart` outside to outside from x = 0; and a flat shelf (`rotation: 0`, length along X, width along Z) between
 * their inner faces at y = `shelfAt`, its ends touching both. Imperial: 3/4" sides 12" deep, 30" tall, 24" apart (inner
 * faces at x = 0.75 and 23.25), shelf 3/4 × 12 × 22.5 at y = 10. Metric: 18 mm sides 300 deep, 750 tall, 600 apart,
 * shelf 18 × 300 × 564 at y = 250 mm.
 */
export function carcass(units?: Units): { doc: SloydDocument; left: string; right: string; shelf: string } {
  const metric = units !== undefined && isMetric(units);
  const s = metric ? METRIC : IMPERIAL;
  const side = (id: string, name: string, x: number) => createBoard({
    id, name, posture: 'upright', rotation: 90, length: s.tall, width: s.depth, thickness: s.T, position: [x, 0, 0],
  });
  const left = side('left', 'Left side', 0);
  const right = side('right', 'Right side', s.apart - s.T);
  const shelf = createBoard({
    id: 'shelf', name: 'Shelf', posture: 'flat', rotation: 0, length: s.apart - 2 * s.T, width: s.depth, thickness: s.T,
    position: [s.T, s.shelfAt, 0],
  });
  const base = createDocument('Carcass');
  const doc = migrateDocument({ ...base, ...(units ? { units } : {}), boards: [left, right, shelf] });
  return { doc, left: 'left', right: 'right', shelf: 'shelf' };
}
