import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Fu 8: the StorageAdapter seam is real only if nothing outside `storage/` names the concrete module — a desktop build
// then swaps one line in `storage/index.ts` instead of editing every import site and every test's mock path.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });

describe('the storage seam', () => {
  it('no module or test outside storage/ imports or mocks storage/browser', () => {
    const offenders = files('src')
      .filter((f) => !f.startsWith(join('src', 'storage')))
      .filter((f) => /['"][./]*\/?storage\/browser['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
