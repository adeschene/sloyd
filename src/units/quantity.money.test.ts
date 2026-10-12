import { formatMoney } from './quantity';

describe('formatMoney', () => {
  it('prints dollars with two decimals and thousands separators', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(21)).toBe('$21.00');
    expect(formatMoney(19.5)).toBe('$19.50');
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(1234567.891)).toBe('$1,234,567.89');
  });
});
