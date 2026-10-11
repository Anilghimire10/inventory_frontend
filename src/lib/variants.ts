/** Ordering, identity and preview of product variants, shared by the variants editor. */

/** Garment sizes in the order a shop shelves them, not the alphabet's. */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'];

/** Values in the order a shopkeeper expects: sizes S before M, numbers 2 before 10, the rest A to Z. */
export function compareValues(a: string, b: string) {
  const sa = SIZE_ORDER.indexOf(a.toUpperCase());
  const sb = SIZE_ORDER.indexOf(b.toUpperCase());
  if (sa >= 0 && sb >= 0) return sa - sb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** A combination's identity whatever order its attributes were entered in (as the API matches it). */
export const comboKey = (attrs: Record<string, string>) =>
  JSON.stringify(
    Object.entries(attrs)
      .map(([k, v]) => [k.trim().toLowerCase(), String(v).trim().toLowerCase()])
      .sort(([x], [y]) => x.localeCompare(y)),
  );

/** Every combination of the given attributes, in the order entered (as the API builds them). */
export function combinations(axes: { name: string; values: string[] }[]) {
  return axes.reduce<Record<string, string>[]>(
    (acc, axis) => acc.flatMap((combo) => axis.values.map((v) => ({ ...combo, [axis.name]: v }))),
    [{}],
  );
}

/** What a typed value list becomes: each value trimmed, empty ones dropped. */
export const splitValues = (text: string) => text.split(',').map((v) => v.trim()).filter(Boolean);
