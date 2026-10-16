import { describe, expect, it } from 'vitest';
import { isTextEntry } from './textEntry';

describe('isTextEntry (fu 9: the one guard App and the viewport share)', () => {
  it.each(['input', 'select', 'textarea'])('a %s is text entry', (tag) => {
    expect(isTextEntry(document.createElement(tag))).toBe(true);
  });
  it('a button, a canvas and nothing are not', () => {
    expect(isTextEntry(document.createElement('button'))).toBe(false);
    expect(isTextEntry(document.createElement('canvas'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
