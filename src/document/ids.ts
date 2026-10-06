let idCounter = 0;

/**
 * A fresh id: a monotonic counter, so two ids minted in one millisecond still
 * differ. Its own module (assemblies plan, Task 1) so the tree modules can mint
 * ids without importing document.ts, which imports them. Board, guide, cut,
 * instance and definition ids all come from here. Never contains '/', the
 * occurrence-path separator (assemblies spec §2.2).
 */
export function nextId(): string {
  idCounter += 1;
  return `b_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
