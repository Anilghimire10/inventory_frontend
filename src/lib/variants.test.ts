import { describe, expect, it } from 'vitest';
import { combinations, comboKey, compareValues, splitValues } from './variants';

describe('compareValues', () => {
  it('puts garment sizes in shelf order, not A to Z', () => {
    expect(['L', 'S', 'XL', 'M', 'xs'].sort(compareValues)).toEqual(['xs', 'S', 'M', 'L', 'XL']);
  });
  it('puts numbers in number order', () => {
    expect(['10', '2', '32', '8'].sort(compareValues)).toEqual(['2', '8', '10', '32']);
  });
  it('puts everything else A to Z, ignoring case', () => {
    expect(['red', 'Blue', 'green'].sort(compareValues)).toEqual(['Blue', 'green', 'red']);
  });
});

describe('comboKey', () => {
  it('is the same combination whatever order its attributes were entered in', () => {
    expect(comboKey({ Size: 'S', Colour: 'Red' })).toBe(comboKey({ colour: 'red ', size: 's' }));
    expect(comboKey({ Size: 'S', Colour: 'Red' })).not.toBe(comboKey({ Size: 'M', Colour: 'Red' }));
  });
});

describe('combinations', () => {
  it('makes every combination, in the order entered', () => {
    expect(
      combinations([
        { name: 'Colour', values: ['Red', 'Blue'] },
        { name: 'Size', values: ['S', 'M'] },
      ]),
    ).toEqual([
      { Colour: 'Red', Size: 'S' },
      { Colour: 'Red', Size: 'M' },
      { Colour: 'Blue', Size: 'S' },
      { Colour: 'Blue', Size: 'M' },
    ]);
  });
});

describe('splitValues', () => {
  it('trims and drops empty values', () => {
    expect(splitValues(' S, M ,, L ,')).toEqual(['S', 'M', 'L']);
  });
});
