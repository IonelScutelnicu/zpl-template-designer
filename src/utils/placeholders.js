// Placeholders inside element Content. A placeholder is written %name%, where
// name is an identifier — the stricter grammar matters because Content mixes
// literals with placeholders, and the older %[^%]+% pattern read "50% off %sku%"
// as a placeholder named " off ".
// A literal percent is written %%.
const NAME = '[A-Za-z_][A-Za-z0-9_.-]*';

// Matches when a string is nothing but one placeholder, end to end.
export const WHOLE_PLACEHOLDER_RE = new RegExp(`^%(${NAME})%$`);
export const PLACEHOLDER_SPLIT_RE = new RegExp(`(%%|%${NAME}%)`);

// %% first so an escaped percent never starts a placeholder.
const SCAN_RE = new RegExp(`%%|%(${NAME})%`, 'g');

export const PLACEHOLDER_NAME_RE = new RegExp(`^${NAME}$`);

// A placeholder being typed, anchored at the caret: the "%" in "Price: %" or the
// "%pr" in "Price: %pr". The name is optional so autocomplete can offer every
// known name the moment "%" is typed.
export const PLACEHOLDER_PREFIX_RE = new RegExp(`%(${NAME})?$`);

// A complete placeholder ending exactly at this point — used to tell the closing
// "%" of "%price%" from the opening "%" of a new one.
export const PLACEHOLDER_AT_END_RE = new RegExp(`%${NAME}%$`);

/**
 * Whether a string is usable as a placeholder name — the rule the Content
 * grammar enforces, reused by the UI so a name that could never be recognised
 * as a placeholder can't be defined in the first place.
 */
export function isValidPlaceholderName(name) {
  return PLACEHOLDER_NAME_RE.test(String(name ?? ''));
}

export function placeholderName(value) {
  const match = String(value ?? '').match(WHOLE_PLACEHOLDER_RE);
  return match ? match[1] : '';
}

export function toPlaceholder(name) {
  return `%${name}%`;
}

/**
 * Placeholder names used in a string, in order of first appearance, without duplicates.
 */
export function placeholderNames(text) {
  const names = [];
  for (const match of String(text ?? '').matchAll(SCAN_RE)) {
    if (match[1] && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

// A placeholder with no value resolves to its bare name, so it stays legible on
// the canvas and still encodes in a barcode.
function placeholderValue(values, name) {
  const value = values?.[name];
  return value === undefined || value === null || value === '' ? name : String(value);
}

/**
 * Substitute Preview Data values into a Content string, yielding the literal
 * text the label shows: %% collapses to a single %.
 */
export function resolvePlaceholders(text, values = {}) {
  return String(text ?? '').replace(SCAN_RE, (match, name) => (
    name ? placeholderValue(values, name) : '%'
  ));
}

/**
 * Substitute Preview Data values into a Content string, leaving the result in
 * Content grammar for a ZPL render: %% stays escaped, and a value's own % is
 * escaped so it reads as a literal. The %%-to-% collapse then happens exactly
 * once, in encodeFieldData — resolving to literal text first would collapse it
 * twice and print Content "%%%%" as one percent instead of two.
 */
export function substitutePlaceholders(text, values = {}) {
  return String(text ?? '').replace(SCAN_RE, (match, name) => (
    name ? placeholderValue(values, name).replace(/%/g, '%%') : match
  ));
}

/**
 * The characters a Content string's field data actually carries: %% collapses to
 * one %, and a %name% placeholder stands for itself, because that is what the
 * emitter writes. Measuring anything else double-counts an escaped percent —
 * substituting the placeholder as well would measure data the ZPL does not hold.
 */
export function emittedContent(text) {
  return String(text ?? '').replace(SCAN_RE, (match, name) => (name ? match : '%'));
}
