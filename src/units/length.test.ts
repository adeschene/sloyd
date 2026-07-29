import { parseLength, formatLength } from './length';

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
