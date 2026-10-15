import { parseLength, formatLength, canBeginLength, formatLengthBare, formatMm, formatSize, tradeLength, tradeSize, floorToTick, IMPERIAL, imperialAt, type Units } from './length';

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
    expect(parseLength(input, IMPERIAL)).toBeCloseTo(expected, 9);
  });

  it.each([
    ['18mm', 18 / 25.4],
    ['12.7 mm', 0.5],
    ['25.4MM', 1],
  ])('parses metric %j', (input, expected) => {
    expect(parseLength(input, IMPERIAL)).toBeCloseTo(expected, 9);
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
    expect(parseLength(input, IMPERIAL)).toBeNull();
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
    expect(formatLength(input, IMPERIAL)).toBe(expected);
  });

  it('reduces fractions to lowest terms', () => {
    expect(formatLength(0.25, IMPERIAL)).toBe('1/4"');   // not 4/16
    expect(formatLength(1.125, IMPERIAL)).toBe('1-1/8"'); // not 1-2/16
  });

  it('rounds to the nearest 1/16 by default', () => {
    expect(formatLength(0.7, IMPERIAL)).toBe('11/16"');    // 11.2/16 -> 11/16
    expect(formatLength(0.72, IMPERIAL)).toBe('3/4"');     // 11.52/16 -> 12/16
  });

  it('rounds a value exactly on a boundary away from zero', () => {
    expect(formatLength(1.03125, IMPERIAL)).toBe('1-1/16"');   // 16.5/16 -> 17/16
    expect(formatLength(-1.03125, IMPERIAL)).toBe('-1-1/16"');
  });

  it('honours a 1/32 precision', () => {
    expect(formatLength(1.03125, imperialAt(32))).toBe('1-1/32"');
  });

  it('absorbs floating-point dust', () => {
    expect(formatLength(0.7499999999, IMPERIAL)).toBe('3/4"');
    expect(formatLength(0.1 + 0.2, IMPERIAL)).toBe('5/16"');  // 0.30000000000000004
  });

  it('renders non-finite input as an em dash', () => {
    expect(formatLength(NaN, IMPERIAL)).toBe('—');
    expect(formatLength(Infinity, IMPERIAL)).toBe('—');
  });
});

describe('round-trip', () => {
  it('formats then re-parses to the same value on 1/16 boundaries', () => {
    for (const v of [0.75, 1.5, 30.0625, 12, 0.0625]) {
      expect(parseLength(formatLength(v, IMPERIAL), IMPERIAL)).toBeCloseTo(v, 9);
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
      expect(parseLength(s, IMPERIAL)).not.toBeNull();
      expect(canBeginLength(s[0])).toBe(true);
    }
  });

  // The converse, and the reason the brief's proposed set was narrowed: no
  // pattern in length.ts admits a leading '/', quote or foot mark, so capturing
  // one would seed the box with a value that can never parse and swallow the
  // keystroke on the way.
  it('rejects characters no length can begin with', () => {
    for (const c of ['/', "'", '"', '+', 'm', 'i', 'x']) {
      expect(parseLength(c + '4', IMPERIAL)).toBeNull();
      expect(canBeginLength(c)).toBe(false);
    }
  });

  // Whitespace is the one rejection that is NOT justified by parseLength —
  // `parseLength(' 4')` is 4, because it trims. It is rejected anyway: Space
  // scrolls, and a keystroke that contributes nothing to the number should not
  // be the one that opens the box.
  it('rejects a space even though parseLength tolerates a leading one', () => {
    expect(parseLength(' 4', IMPERIAL)).toBe(4);
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

  // The guard the previous test does NOT pin, discovered by mutating it away
  // and watching the suite stay green. Every named key above is rejected by the
  // character range anyway ('E' sorts above '9'), so deleting `key.length !== 1`
  // cost nothing there — the test read as covering a guard it did not touch.
  // A DIGIT-LEADING multi-character string is what separates them: '12' <= '9'
  // compares first characters and is true, so without the length test this
  // takes a whole string for a keystroke. That matters because the argument is
  // a KeyboardEvent.key and the box it seeds is filled with exactly one
  // character — a predicate that accepts '12' invites a caller that passes the
  // accumulated text.
  it('takes one keystroke, not a string that starts like a length', () => {
    for (const s of ['12', '1 1/2', '3/4', '.5', '-5']) expect(canBeginLength(s)).toBe(false);
  });
});

const MM: Units = { display: 'metric-mm', precision: 16 };
const inch = (mm: number) => mm / 25.4;

describe('formatLength — metric', () => {
  it.each([
    [inch(762), '762 mm'], [inch(19), '19 mm'], [inch(-38), '-38 mm'], [0, '0 mm'], [-0, '0 mm'],
    [inch(18.4999), '18 mm'], [inch(18.5), '19 mm'], [inch(-18.5), '-19 mm'], [inch(0.4), '0 mm'], [inch(-0.4), '0 mm'],
    [0.75, '19 mm'], [24, '610 mm'], [1.5, '38 mm'],
    // halves that land one ulp short in float (0.49999999999999994, 6.499999999999999): only the nudge rounds them up
    [inch(0.5), '1 mm'], [inch(6.5), '7 mm'], [inch(-6.5), '-7 mm'],
  ])('%s in → %s', (v, s) => expect(formatLength(v, MM)).toBe(s));
  it('non-finite → —', () => {
    expect(formatLength(NaN, MM)).toBe('—');
    expect(formatLength(Infinity, MM)).toBe('—');
  });
  it('ignores precision', () => expect(formatLength(0.75, { ...MM, precision: 64 })).toBe('19 mm'));
});

describe('formatLength — imperial is unchanged', () => {
  // Literal strings, not old-vs-new: Task 6 removes the number overload, and a self-comparison could not fail.
  it.each([[0.75, 16, '3/4"'], [1.5, 16, '1-1/2"'], [-2.0625, 16, '-2-1/16"'], [23.47, 64, '23-15/32"'], [0, 16, '0"'],
    [-0.001, 16, '-0"'], [NaN, 16, '—']] as const)('%s @%s → %s', (v, p, s) => {
    expect(formatLength(v, imperialAt(p))).toBe(s);
  });
  it('IMPERIAL is 1/16', () => expect(formatLength(0.6, IMPERIAL)).toBe('5/8"'));
});

describe('formatMm', () => {
  it.each([
    [0.25, 1, '6.4 mm'], [inch(32), 1, '32 mm'], [inch(35), 1, '35 mm'], [inch(5), 1, '5 mm'], [0.25, 0, '6 mm'],
    [inch(-6.35), 1, '-6.4 mm'], [inch(6.45), 1, '6.5 mm'], [inch(-0.05), 1, '-0.1 mm'], [inch(-0.04), 1, '0 mm'], [0, 1, '0 mm'], [NaN, 1, '—'],
  ] as const)('%s, %s dp → %s', (v, d, s) => expect(formatMm(v, d)).toBe(s));
});

describe('formatLengthBare / formatSize', () => {
  it('metric bare is the number alone', () => expect(formatLengthBare(inch(762), MM)).toBe('762'));
  it('imperial bare keeps the mark', () => expect(formatLengthBare(0.75, IMPERIAL)).toBe('3/4"'));
  it('a metric size writes the unit once', () => expect(formatSize([30, 5.5, 0.75], MM)).toBe('762 × 140 × 19 mm'));
  it('an imperial size is the old join', () => expect(formatSize([30, 5.5], IMPERIAL)).toBe('30" × 5-1/2"'));
});

describe('parseLength — metric', () => {
  it.each([
    ['19', inch(19)], ['19.5', inch(19.5)], ['-38', inch(-38)], ['.5', inch(0.5)], ['19mm', inch(19)], ['19 mm', inch(19)],
    ['3/4', 0.75], ['1-1/2', 1.5], ['1 1/2', 1.5], ['19"', 19], ['19 in', 19], ['2\'', 24], ['2\'6"', 30], ['-3/4', -0.75],
    ['- 19', inch(-19)], ['-.5', inch(-0.5)], ['- 3/4', -0.75],
  ])('%s', (t, v) => expect(parseLength(t, MM)).toBeCloseTo(v, 12));
  it.each(['', 'abc', '1/0', '19 cm', 'mm'])('junk %s → null', (t) => expect(parseLength(t, MM)).toBeNull());
  it('imperial reads a spaced sign the same way', () => expect(parseLength('- 19', IMPERIAL)).toBe(-19));
  it('a bare number is still inches in imperial', () => expect(parseLength('19', IMPERIAL)).toBe(19));
  it('mm in imperial is mm', () => expect(parseLength('19mm', IMPERIAL)).toBeCloseTo(inch(19), 12));
  it('round trip within half a mm', () => {
    for (let mm = -500; mm <= 3000; mm += 7.3) {
      const back = parseLength(formatLength(inch(mm), MM).replace(' mm', ''), MM)!;
      expect(Math.abs(back * 25.4 - mm)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe('floorToTick', () => {
  it('floors to the display grid, never up', () => {
    expect(floorToTick(23.47, IMPERIAL)).toBe(Math.floor(23.47 * 16 + 1e-9) / 16);
    expect(formatLength(floorToTick(inch(596.9), MM), MM)).toBe('596 mm');
    expect(floorToTick(inch(596), MM) * 25.4).toBeCloseTo(596, 9);   // exactly on a tick stays
  });
});

describe('tradeLength / tradeSize', () => {
  it('metric: imperial as the yard sells it, mm in brackets', () => {
    expect(tradeLength(0.75, MM)).toBe('3/4" (19 mm)');
    expect(tradeSize([0.75, 5.5, 96], MM)).toBe('3/4" \u00d7 5-1/2" \u00d7 96" (19 \u00d7 140 \u00d7 2438 mm)');
  });
  it('imperial: today\'s strings', () => {
    expect(tradeLength(0.75, IMPERIAL)).toBe('3/4"');
    expect(tradeSize([0.75, 5.5, 96], IMPERIAL)).toBe('3/4" \u00d7 5-1/2" \u00d7 96"');
    expect(tradeSize([0.75, 5.5], imperialAt(64))).toBe('3/4" \u00d7 5-1/2"');
  });
});
