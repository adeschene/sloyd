import { formatBoardFeet, formatSquareFeet } from './quantity';

describe('formatBoardFeet', () => {
  it('converts 144 cubic inches to one board foot', () => {
    expect(formatBoardFeet(144)).toBe('1.00 bd ft');
  });

  it('formats a 24 x 5-1/2 x 3/4 board', () => {
    // 24 * 5.5 * 0.75 = 99 cubic inches
    expect(formatBoardFeet(99)).toBe('0.69 bd ft');
  });

  it('formats two of that board', () => {
    expect(formatBoardFeet(198)).toBe('1.38 bd ft');
  });

  it('always shows exactly two decimal places', () => {
    expect(formatBoardFeet(0)).toBe('0.00 bd ft');
    expect(formatBoardFeet(288)).toBe('2.00 bd ft');
  });

  it('rounds rather than truncating', () => {
    // 145 / 144 = 1.00694...; truncation would give 1.00.
    expect(formatBoardFeet(145)).toBe('1.01 bd ft');
  });

  it('is not exact at a floating-point half-way boundary, and that is fine', () => {
    // 144.72 / 144 is 1.00499...9 in binary, not 1.005, so toFixed gives 1.00
    // rather than the 1.01 a decimal-exact rounding would produce. Pinned
    // deliberately: at a 1/100 board foot this is roughly a tenth of a cubic
    // inch of lumber, so it costs nothing at the yard — but a future reader
    // should find the behaviour recorded instead of rediscovering it as a bug.
    expect(formatBoardFeet(144.72)).toBe('1.00 bd ft');
  });

  it('does not round up to a whole board foot', () => {
    // A yard selling in whole board feet is applying a purchasing policy;
    // reporting the true number is the honest thing. Spec section 5.
    expect(formatBoardFeet(150)).toBe('1.04 bd ft');
  });
});

describe('formatSquareFeet', () => {
  it('converts 144 square inches to one square foot', () => {
    expect(formatSquareFeet(144)).toBe('1.00 sq ft');
  });

  it('formats three 24 x 30 panels', () => {
    // 3 * 24 * 30 = 2160 square inches
    expect(formatSquareFeet(2160)).toBe('15.00 sq ft');
  });

  it('always shows exactly two decimal places', () => {
    expect(formatSquareFeet(0)).toBe('0.00 sq ft');
  });
});
