import { afterEach, describe, expect, it, vi } from 'vitest';
import f2 from './joints/fixtures/2-frames-phantom.json?raw';
import f5 from './joints/fixtures/5-rail-enters-once.json?raw';

// Follow-up 244: repairDocument and plainForRefine run inside the dialogs' memos, so a throw there would
// break the dialog's render. Both catch and refuse instead; this makes the shared write-back throw.
const fail = vi.hoisted(() => ({ on: false }));
vi.mock('../document/document', async (orig) => {
  const real = await orig<typeof import('../document/document')>();
  return { ...real, writeBackFlat: (...a: Parameters<typeof real.writeBackFlat>) => {
    if (fail.on) throw new Error('write-back exploded');
    return real.writeBackFlat(...a);
  } };
});

const { migrateDocument } = await import('../document/document');
const { REPAIR_REFUSAL, repairDocument } = await import('./joints/repair');
const { GATE_REFUSAL } = await import('./joints/unjoin');
const { plainForRefine, refineDialogInfo } = await import('./refine');

const damaged = (raw: string) => migrateDocument(JSON.parse(raw).damaged);
afterEach(() => { fail.on = false; vi.restoreAllMocks(); });

describe('a throw in the dialogs\' memos refuses instead (fu 244)', () => {
  it('repairDocument: the repair refusal, the cause on the console', () => {
    const doc = damaged(f2);
    expect(repairDocument(doc)).toHaveProperty('doc'); // repairs when nothing throws
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fail.on = true;
    expect(repairDocument(doc)).toEqual({ refused: REPAIR_REFUSAL });
    expect(String(err.mock.calls[0])).toContain('write-back exploded');
  });

  it('plainForRefine: the joint gate\'s refusal, the cause on the console', () => {
    const doc = damaged(f5); // fixture 5 is undamaged: the gate explains it
    expect(plainForRefine(doc)).toHaveProperty('plain');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fail.on = true;
    expect(plainForRefine(doc)).toEqual({ refused: { reason: 'joints', message: GATE_REFUSAL } });
    expect(String(err.mock.calls[0])).toContain('write-back exploded');
  });

  it('refineDialogInfo renders through both: a refusal and a refused repair, no throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fail.on = true;
    // Fixture 5: the gate's write-back throws -> the gate refusal (its repair finds no evidence: null).
    expect(refineDialogInfo(damaged(f5))).toMatchObject({ refusal: GATE_REFUSAL, repair: null });
    // Fixture 2: the gate refuses on its own; the repair's write-back throws -> the repair refusal.
    expect(refineDialogInfo(damaged(f2))).toMatchObject({ refusal: GATE_REFUSAL, repair: { refused: REPAIR_REFUSAL } });
  });
});
