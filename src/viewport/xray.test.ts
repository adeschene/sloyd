import { fadedFor } from './xray';

type View = Parameters<typeof fadedFor>[1];
const v = (o: Partial<View> = {}): View => ({ clean: false, openPath: null, xray: false, selected: new Set<string>(), ...o });

describe('fadedFor', () => {
  it('X-ray off is the assembly fade exactly', () => {
    expect(fadedFor('p1', v())).toBe(false);
    expect(fadedFor('p1', v({ selected: new Set(['p2']) }))).toBe(false);
    const open = v({ openPath: 'a1' });
    expect(fadedFor('a1/leg', open)).toBe(false);
    expect(fadedFor('b2', open)).toBe(true);
    expect(fadedFor('a10/leg', open)).toBe(true);
    const clean = v({ openPath: 'a1', clean: true });
    expect(fadedFor('b2', clean)).toBe(false);
  });
  it('X-ray on with nothing selected fades nothing', () => {
    expect(fadedFor('p1', v({ xray: true }))).toBe(false);
  });
  it('X-ray on fades every part not selected', () => {
    const view = v({ xray: true, selected: new Set(['p1']) });
    expect(fadedFor('p1', view)).toBe(false);
    expect(fadedFor('p2', view)).toBe(true);
  });
  it('an assembly selection keeps all its parts solid', () => {
    const view = v({ xray: true, selected: new Set(['asm']) });
    expect(fadedFor('asm/leg', view)).toBe(false);
    expect(fadedFor('asm/sub/rail', view)).toBe(false);
    expect(fadedFor('p2', view)).toBe(true);
  });
  it('a part inside an instance is selected alone', () => {
    const view = v({ xray: true, selected: new Set(['inst-1/leg']) });
    expect(fadedFor('inst-1/leg', view)).toBe(false);
    expect(fadedFor('inst-1/rail', view)).toBe(true);
  });
  it('the assembly fade survives X-ray', () => {
    const view = v({ openPath: 'a1', xray: true, selected: new Set(['b2']) });
    expect(fadedFor('b2', view)).toBe(true);
    expect(fadedFor('a1/leg', view)).toBe(true);
    expect(fadedFor('a1/leg', { ...view, selected: new Set(['a1/leg']) })).toBe(false);
  });
  it('the X-ray term ignores clean', () => {
    expect(fadedFor('p2', v({ clean: true, xray: true, selected: new Set(['p1']) }))).toBe(true);
  });
});
