import JsBarcode from 'jsbarcode';

/** Render a CODE128 barcode (any alphanumeric value, no fixed-length format) as inline SVG markup. */
export function renderBarcodeSvg(code: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    height: 45,
  });
  return svg.outerHTML;
}

/** A 12-digit numeric code for products that don't have a barcode yet. */
export function generateBarcodeValue(): string {
  return Math.floor(Math.random() * 1_000_000_000_000)
    .toString()
    .padStart(12, '0');
}
