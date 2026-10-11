import { describe, expect, it } from 'vitest';
import { createScanBurst } from './scan-burst';

/** Feed a code as keystrokes `gap` ms apart, then Enter `endGap` ms later. */
function type(code: string, gap: number, endGap = gap) {
  const burst = createScanBurst();
  let t = 1000;
  for (const ch of code) {
    burst.char(ch, t);
    t += gap;
  }
  return burst.end(t - gap + endGap);
}

describe('createScanBurst', () => {
  it('reads a fast burst ended by Enter as a scan', () => {
    expect(type('8901234567890', 8)).toBe('8901234567890');
  });
  it('leaves a person typing alone', () => {
    expect(type('8901234567890', 120)).toBeNull();
  });
  it('leaves a short fast burst alone', () => {
    expect(type('12', 5)).toBeNull();
  });
  it('is not a scan when Enter comes long after the last character', () => {
    expect(type('8901234567890', 8, 500)).toBeNull();
  });
  it('starts again after a pause, so typing before a scan is not part of it', () => {
    const burst = createScanBurst();
    burst.char('4', 0); // a person, earlier
    let t = 500;
    for (const ch of '12345678') {
      burst.char(ch, t);
      t += 6;
    }
    expect(burst.end(t)).toBe('12345678');
  });
  it('counts the burst so far', () => {
    const burst = createScanBurst();
    expect(burst.char('1', 0)).toBe(1);
    expect(burst.char('2', 5)).toBe(2);
    expect(burst.char('3', 500)).toBe(1);
  });
});
