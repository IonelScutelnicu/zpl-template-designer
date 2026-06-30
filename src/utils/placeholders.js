export const PLACEHOLDER_TOKEN_RE = /^%([^%]+)%$/;
export const PLACEHOLDER_SPLIT_RE = /(%[^%]+%)/;

export function placeholderName(value) {
  const match = String(value ?? '').match(PLACEHOLDER_TOKEN_RE);
  return match ? match[1] : '';
}

export function placeholderToken(name) {
  return `%${name}%`;
}
