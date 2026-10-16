let idCounter = 0;

/**
 * A fresh id: a monotonic counter, so two ids minted in one millisecond still
 * differ. Its own module (assemblies plan, Task 1) so the tree modules can mint
 * ids without importing document.ts, which imports them. Board, guide, cut,
 * instance and definition ids all come from here. Never contains '/', the
 * occurrence-path separator (assemblies spec §2.2). The prefix names no kind (fu 51: it was `b_`, for boards);
 * ids are opaque, and files keep whatever they were minted with.
 */
export function nextId(): string {
  idCounter += 1;
  return `id_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
