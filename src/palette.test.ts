import { readFileSync } from 'node:fs';

// Not `?raw`: Vitest runs the CSS through its pipeline and hands back ''; read from the project root, which is the cwd.
const css = readFileSync('src/styles.css', 'utf8');

/** The hex value of a raw palette token declared in styles.css. */
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`--${name} is not declared as a 6-digit hex`);
  return m[1]!;
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('palette (ui-polish spec §2)', () => {
  // Guards the two below against a stylesheet that loaded as '' (they would pass vacuously).
  it('reads the stylesheet', () => expect(css).toContain(':root {'));

  // Body text and labels on each surface they sit on: WCAG AA, 4.5:1.
  it.each([
    ['walnut-ink', 'walnut-900'],
    ['walnut-ink-dim', 'walnut-900'],
    ['walnut-ink-dim', 'walnut-800'],
    ['walnut-ink-faint', 'walnut-900'],
    ['grey-ink', 'grey-850'],
    ['grey-ink-dim', 'grey-850'],
    ['grey-ink-dim', 'grey-700'],
    ['accent', 'walnut-900'],
    ['accent-bright', 'grey-900'],
    ['on-accent', 'accent'],
    ['alert', 'walnut-900'],
    ['alert', 'walnut-800'],
  ])('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('retires the graphite and brass tokens entirely', () => {
    expect(css).not.toMatch(/--graphite-/);
    expect(css).not.toMatch(/--brass/);
  });
});
