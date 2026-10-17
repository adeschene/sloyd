/**
 * THE storage seam's one import site (fu 8): everything outside `storage/` imports the adapter from here, never from a
 * concrete module, and tests mock this path. A desktop build swaps the line below for its own `StorageAdapter`.
 */
export { storage } from './browser';
