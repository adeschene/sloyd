import { createHash } from 'node:crypto';
import { render } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import { CutList } from './CutList';

/**
 * Dovetails Task 7 (spec §5.2): a cut list sheet with no dovetail is byte for byte as before. The hash was taken from this
 * exact render BEFORE Task 7 touched `CutList.tsx` or `cutlist.ts`. Its own file, and the ONLY render in it: `useId` (the
 * diagram's pattern ids) counts renders, so a render before this one would change the bytes for a reason that is not ours.
 */
it('identity: a dovetail-free sheet (a dado row drawn, a plain row) renders byte for byte as before this round', () => {
  useStore.getState().replaceDocument({ ...createDocument('Id'), boards: [
    createBoard({ name: 'Shelf', material: 'oak', thickness: 0.75, length: 24, width: 8,
      cuts: [{ id: 'c1', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] }),
    createBoard({ name: 'Side', material: 'oak', thickness: 0.75, length: 30, width: 8 }),
  ] });
  const { container } = render(<CutList onClose={() => {}} />);
  expect(container.querySelector('.cutlist-diagram')).not.toBeNull();
  // The weight round's additions (weight spec §5.1): asserted, then removed, so the rest is the same bytes as before.
  const added = [...container.querySelectorAll('.cutlist-weight, .cutlist-weight-total')];
  expect(added.map((e) => e.textContent)).toEqual(['8.2 lb', 'Weight: about 8.2 lb']);
  for (const e of added) e.remove();
  expect(createHash('sha256').update(container.innerHTML).digest('hex'))
    .toBe('d836a5529336a8811555e6359a128c48980f0f25e6c3167791aa96fc3770c3e6');
});
