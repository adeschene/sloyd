import { parseLength, formatLength, canBeginLength } from './length';

describe('parseLength', () => {
  it.each([
    ['3/4', 0.75],
    ['0.75', 0.75],
    ['.75', 0.75],
    ['1-1/2', 1.5],
    ['1 1/2', 1.5],
    ['1 1/2"', 1.5],
    ['1-1/2in', 1.5],
    ['2', 2],
    ['2"', 2],
    ["2'", 24],
    [`2'6"`, 30],
    [`2' 6-1/2"`, 30.5],
    ['  3/4  ', 0.75],
    ['-3/4', -0.75],
    ['-1-1/2', -1.5],
  ])('parses %j as %f inches', (input, expected) => {
    expect(parseLength(input)).toBeCloseTo(expected, 9);
  });

  it.each([
    ['18mm', 18 / 25.4],
    ['12.7 mm', 0.5],
    ['25.4MM', 1],
  ])('parses metric %j', (input, expected) => {
    expect(parseLength(input)).toBeCloseTo(expected, 9);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['3/'],
    ['/4'],
    ['3/0'],
    ['1-1/2-1/2'],
    ['1/2/3'],
    ['12mmm'],
    ['NaN'],
    ['1e5'],
  ])('rejects %j', (input) => {
    expect(parseLength(input)).toBeNull();
  });
});

describe('formatLength', () => {
  it.each([
    [0, '0"'],
    [2, '2"'],
    [0.75, '3/4"'],
    [0.5, '1/2"'],
    [1.5, '1-1/2"'],
    [30.0625, '30-1/16"'],
    [-1.5, '-1-1/2"'],
  ])('formats %f as %s', (input, expected) => {
    expect(formatLength(input)).toBe(expected);
  });

  it('reduces fractions to lowest terms', () => {
    expect(formatLength(0.25)).toBe('1/4"');   // not 4/16
    expect(formatLength(1.125)).toBe('1-1/8"'); // not 1-2/16
  });

  it('rounds to the nearest 1/16 by default', () => {
    expect(formatLength(0.7)).toBe('11/16"');    // 11.2/16 -> 11/16
    expect(formatLength(0.72)).toBe('3/4"');     // 11.52/16 -> 12/16
  });

  it('rounds a value exactly on a boundary away from zero', () => {
    expect(formatLength(1.03125)).toBe('1-1/16"');   // 16.5/16 -> 17/16
    expect(formatLength(-1.03125)).toBe('-1-1/16"');
  });

  it('honours a 1/32 precision', () => {
    expect(formatLength(1.03125, 32)).toBe('1-1/32"');
  });

  it('absorbs floating-point dust', () => {
    expect(formatLength(0.7499999999)).toBe('3/4"');
    expect(formatLength(0.1 + 0.2)).toBe('5/16"');  // 0.30000000000000004
  });

  it('renders non-finite input as an em dash', () => {
    expect(formatLength(NaN)).toBe('—');
    expect(formatLength(Infinity)).toBe('—');
  });
});

describe('round-trip', () => {
  it('formats then re-parses to the same value on 1/16 boundaries', () => {
    for (const v of [0.75, 1.5, 30.0625, 12, 0.0625]) {
      expect(parseLength(formatLength(v))).toBeCloseTo(v, 9);
    }
  });
});

// canBeginLength decides which keystroke, arriving with nothing focused, is the
// start of a typed distance rather than a shortcut (App.tsx's Tape capture).
// Its whole claim is that it agrees with parseLength's grammar, so the first
// test below is that agreement rather than a restatement of the character set.
describe('canBeginLength', () => {
  // Every form parseLength documents as accepted. If the predicate rejected any
  // of these first characters, the user would type the first character of a
  // legal length and nothing would happen — the feature silently absent for
  // that whole form.
  it('accepts the first character of everything parseLength accepts', () => {
    for (const s of ['3/4', '0.75', '.5', '1-1/2', '1 1/2', '1 1/2"', "2'6\"", '18mm', '-5', '7']) {
      expect(parseLength(s)).not.toBeNull();
      expect(canBeginLength(s[0])).toBe(true);
    }
  });

  // The converse, and the reason the brief's proposed set was narrowed: no
  // pattern in length.ts admits a leading '/', quote or foot mark, so capturing
  // one would seed the box with a value that can never parse and swallow the
  // keystroke on the way.
  it('rejects characters no length can begin with', () => {
    for (const c of ['/', "'", '"', '+', 'm', 'i', 'x']) {
      expect(parseLength(c + '4')).toBeNull();
      expect(canBeginLength(c)).toBe(false);
    }
  });

  // Whitespace is the one rejection that is NOT justified by parseLength —
  // `parseLength(' 4')` is 4, because it trims. It is rejected anyway: Space
  // scrolls, and a keystroke that contributes nothing to the number should not
  // be the one that opens the box.
  it('rejects a space even though parseLength tolerates a leading one', () => {
    expect(parseLength(' 4')).toBe(4);
    expect(canBeginLength(' ')).toBe(false);
  });

  // The tool shortcuts, named explicitly: capturing a letter would make T and M
  // unreachable the moment the tape was anchored.
  it('rejects the tool shortcut letters in both cases', () => {
    for (const c of ['t', 'T', 'm', 'M']) expect(canBeginLength(c)).toBe(false);
  });

  // Named keys are multi-character KeyboardEvent.key values, which is what the
  // `key.length !== 1` test filters — one rule instead of an enumeration that
  // would have to grow every time a key exists. The empty string is in the list
  // because `''[0]` is undefined and an index-based implementation would throw
  // or coerce rather than return false.
  it('rejects named keys', () => {
    for (const k of ['Enter', 'Escape', 'Backspace', 'ArrowLeft', 'Delete', 'Shift', '']) {
      expect(canBeginLength(k)).toBe(false);
    }
  });
});
