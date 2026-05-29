export function safeArray(data) {
  return Array.isArray(data) ? data : [];
}
