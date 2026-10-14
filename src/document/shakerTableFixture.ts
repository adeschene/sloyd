// TEST-ONLY. The Shaker table design json shared by the headline flow (generate/joints/tapers.test.ts) and Refine's round
// trip (refineDesign.test.ts), so the two cannot drift (fu 301).
// Built the way the prompt teaches: four legs 1.75 x 28.25 x 1.75 tapering their INSIDE faces toward the floor by the
// corner rule, start 22.5 (below the aprons, which begin at 23.25), amount 0.5; four 5in aprons inset 0.25 from the
// legs' outside faces at the top of the legs; a top overhanging 1in all round. 30 x 20 x 29 overall. The four legs share
// the role 'leg' (they are the same leg turned); every other part has none.
const leg = (name: string, x: number, z: number, faces: string[]) => ({ name, role: 'leg', material: 'oak',
  at: { x, y: 0, z }, size: { x: 1.75, y: 28.25, z: 1.75 }, miters: [], bevels: [], chamfers: [], tapers: [{ faces, toward: '-y', start: 22.5, amount: 0.5 }] });
const plain = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'oak',
  at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, miters: [], bevels: [], chamfers: [], tapers: [] });

export const SHAKER_TABLE_JSON = { name: 'Shaker table', assemblies: [], parts: [
  leg('Leg FL', 0, 0, ['+x', '+z']), leg('Leg FR', 28.25, 0, ['-x', '+z']),
  leg('Leg BL', 0, 18.25, ['+x', '-z']), leg('Leg BR', 28.25, 18.25, ['-x', '-z']),
  plain('Apron F', [1.75, 23.25, 0.25], [26.5, 5, 0.75]), plain('Apron B', [1.75, 23.25, 19], [26.5, 5, 0.75]),
  plain('Apron L', [0.25, 23.25, 1.75], [0.75, 5, 16.5]), plain('Apron R', [29, 23.25, 1.75], [0.75, 5, 16.5]),
  plain('Top', [-1, 28.25, -1], [32, 0.75, 22]),
] };
