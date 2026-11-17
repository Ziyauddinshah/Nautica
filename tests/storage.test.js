import { expect, test, vi } from 'vitest';
import { boats, slots } from '../src/domain/booking.js';
import { CURRENCY_KEY, PASSES_KEY, loadCurrency, loadPasses, savePass } from '../src/lib/storage.js';

const legacy = () => ({ id: 'NTC-LEGACY', boatId: boats[0].id, date: '2027-01-15', slot: slots[0], guests: 2, name: 'Existing Guest', extras: ['safety'], total: 126000, method: 'UPI · GPay' });
test('reads valid passes and currency saved by the pre-React version', () => {
  localStorage.setItem(CURRENCY_KEY, JSON.stringify('USD'));
  localStorage.setItem(PASSES_KEY, JSON.stringify([legacy()]));
  expect(loadCurrency()).toBe('USD');
  expect(loadPasses().value).toEqual([legacy()]);
});
test('a new booking preserves legacy passes and merges another tab’s latest write', () => {
  localStorage.setItem(PASSES_KEY, JSON.stringify([legacy()]));
  const booking = { ...legacy(), id: 'NTC-NEW', seats: ['01', '02'] };
  const next = savePass(booking);
  expect(next.map(pass => pass.id)).toEqual(['NTC-NEW', 'NTC-LEGACY']);
  expect(savePass(booking)).toHaveLength(2);
});
test('corrupted storage is not silently overwritten with a confirmed booking', () => {
  localStorage.setItem(PASSES_KEY, '{broken');
  expect(loadPasses().error).toBeTruthy();
  expect(() => savePass(legacy())).toThrow();
  expect(localStorage.getItem(PASSES_KEY)).toBe('{broken');
});
test('unsupported currency falls back and malformed passes are ignored', () => {
  localStorage.setItem(CURRENCY_KEY, JSON.stringify('EUR'));
  localStorage.setItem(PASSES_KEY, JSON.stringify([null, {}, legacy()]));
  expect(loadCurrency()).toBe('INR');expect(loadPasses().value).toHaveLength(1);
});
test('blocked storage reports a read error instead of crashing the application', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(loadCurrency()).toBe('INR');expect(loadPasses().error).toBeTruthy();
});
