/** Parse a textarea's raw serial/IMEI entry (one per line, or comma-separated) into a clean list. */
export function parseSerials(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasDuplicateSerials(serials: string[]): boolean {
  return new Set(serials).size !== serials.length;
}

/** A serialised line needs a positive whole-number quantity and exactly one distinct serial per unit. */
export function serialsInvalid(serials: string[], quantity: number): boolean {
  if (!Number.isInteger(quantity) || quantity < 1) return true;
  if (serials.length !== quantity) return true;
  return hasDuplicateSerials(serials);
}
