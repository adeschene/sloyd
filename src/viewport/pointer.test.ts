import { CLICK_DRAG_SLOP_PX, clickPairStartedWithDrag, watchClickPairs } from './pointer';

// Fu 27: the slop gate's pure half. Whether BoardMesh/MoveTool/TapeTool still CALL it stays hand-verified (the r3f
// viewport has no unit tests by design); this pins the threshold and the click-pair tracking they share.
describe('click pairs', () => {
  const press = (el: HTMLElement, x: number, y: number) =>
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  const click = (el: HTMLElement, x: number, y: number, detail = 1) =>
    el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, detail, bubbles: true }));

  it('the slop is 2 px, the threshold r3f uses for its own miss handling', () => {
    expect(CLICK_DRAG_SLOP_PX).toBe(2);
  });

  it('a press released within the slop is a click; past it, a drag', () => {
    const el = document.createElement('div');
    const stop = watchClickPairs(el);
    press(el, 10, 10); click(el, 11, 11.4);   // 1.72 px
    expect(clickPairStartedWithDrag()).toBe(false);
    press(el, 10, 10); click(el, 12, 10.1);   // 2.002 px
    expect(clickPairStartedWithDrag()).toBe(true);
    stop();
  });

  it('the second click of a pair keeps what the first decided (a dblclick after an orbit opens nothing)', () => {
    const el = document.createElement('div');
    const stop = watchClickPairs(el);
    press(el, 0, 0); click(el, 40, 0);         // the orbit
    press(el, 40, 0); click(el, 40, 0, 2);     // the pair's second click, still
    expect(clickPairStartedWithDrag()).toBe(true);
    stop();
  });

  it('stops watching after cleanup', () => {
    const el = document.createElement('div');
    const stop = watchClickPairs(el);
    press(el, 0, 0); click(el, 0, 0);
    stop();
    press(el, 0, 0); click(el, 50, 0);
    expect(clickPairStartedWithDrag()).toBe(false);
  });
});
