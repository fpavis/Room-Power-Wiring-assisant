/**
 * Random hex id. Uses getRandomValues because crypto.randomUUID does not exist on
 * plain http, which is how phones and tablets reach the local dev server.
 */
export function randomId(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}
