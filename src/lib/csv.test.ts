import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

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
