import { describe, expect, it } from 'vitest';
import { DENSITY_UNIT, densityText, formatDensity, formatWeight, parseDensity } from './quantity';
import { IMPERIAL, type Units } from './length';

const METRIC: Units = { display: 'metric-mm', precision: 16 };

describe('formatWeight (weight spec §6)', () => {
  it('one decimal under 10, whole from 10', () => {
    expect(formatWeight(1.375, IMPERIAL)).toBe('1.4 lb');
    expect(formatWeight(9.9, IMPERIAL)).toBe('9.9 lb');
    expect(formatWeight(9.96, IMPERIAL)).toBe('10 lb');
    expect(formatWeight(47.3, IMPERIAL)).toBe('47 lb');
    expect(formatWeight(0.04, IMPERIAL)).toBe('0.0 lb');
  });
  it('a metric project prints kg', () => {
    expect(formatWeight(22.0462, METRIC)).toBe('10 kg');
    expect(formatWeight(2.2, METRIC)).toBe('1.0 kg');
  });
});

describe('density text (weight spec §6)', () => {
  it('formats lb/ft³ and kg/m³', () => {
    expect(formatDensity(44, IMPERIAL)).toBe('44 lb/ft³');
    expect(formatDensity(9.25, IMPERIAL)).toBe('9.3 lb/ft³');
    expect(formatDensity(44, METRIC)).toBe('705 kg/m³');
    expect(formatDensity(150, METRIC)).toBe('2403 kg/m³');
    expect(densityText(44, METRIC)).toBe('705');
    expect(DENSITY_UNIT(IMPERIAL)).toBe('lb/ft³');
    expect(DENSITY_UNIT(METRIC)).toBe('kg/m³');
  });
  it('parses a bare number in the field unit, stored as lb/ft³', () => {
    expect(parseDensity('44', IMPERIAL)).toBe(44);
    expect(parseDensity(' 40.5 ', IMPERIAL)).toBe(40.5);
    const v = parseDensity('705', METRIC)!;
    expect(v).toBe(705 / 16.018463);
    expect(densityText(v, METRIC)).toBe('705');
  });
  it('refuses empty, zero, negative and non-numbers', () => {
    for (const t of ['', '0', '-3', 'abc', '4 4', '1/2']) expect(parseDensity(t, IMPERIAL), t).toBeNull();
  });
});
