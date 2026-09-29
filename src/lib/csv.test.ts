import { describe, expect, it } from 'vitest';
import { csvCell, parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('keys rows by the header row', () => {
    expect(parseCsv('name,qty\nRice,5\nDal,2')).toEqual([
      { name: 'Rice', qty: '5' },
      { name: 'Dal', qty: '2' },
    ]);
  });

  it('keeps commas and newlines that sit inside quotes', () => {
    expect(parseCsv('name,address\n"Shop, Ltd","Line 1\nLine 2"')).toEqual([
      { name: 'Shop, Ltd', address: 'Line 1\nLine 2' },
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('name\n"He said ""hi"""')).toEqual([{ name: 'He said "hi"' }]);
  });

  it('handles CRLF and bare CR line endings', () => {
    expect(parseCsv('name,qty\r\nRice,5')).toEqual([{ name: 'Rice', qty: '5' }]);
    expect(parseCsv('name,qty\rRice,5')).toEqual([{ name: 'Rice', qty: '5' }]);
  });

  it('fills short rows rather than leaving holes', () => {
    expect(parseCsv('name,qty,unit\nRice,5')).toEqual([
      { name: 'Rice', qty: '5', unit: '' },
    ]);
  });

  it('returns nothing when there is no data row', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('name,qty')).toEqual([]);
    expect(parseCsv('name,qty\n\n  \n')).toEqual([]);
  });

  it('trims fields and headers', () => {
    expect(parseCsv(' name , qty \n Rice , 5 ')).toEqual([{ name: 'Rice', qty: '5' }]);
  });
});

describe('toCsv', () => {
  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'price', label: 'Price' },
  ];

  it('starts with a byte-order mark so Excel reads Nepali text', () => {
    expect(toCsv(cols, []).charCodeAt(0)).toBe(0xfeff);
  });

  it('neutralises text that would run as a formula, but not numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+977')).toBe("'+977");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('Rice')).toBe('Rice');
  });

  it('parses back to what was exported', () => {
    const rows = [
      { name: 'चामल, basmati', sku: 'R-1', price: 1200 },
      { name: 'He said "hi"', sku: '', price: 0 },
    ];
    expect(parseCsv(toCsv(cols, rows))).toEqual([
      { Name: 'चामल, basmati', SKU: 'R-1', Price: '1200' },
      { Name: 'He said "hi"', SKU: '', Price: '0' },
    ]);
  });
});
