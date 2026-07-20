export function safeLocalStorageRemove(key) {
  try { localStorage.removeItem(key); } catch (_) { }
}
