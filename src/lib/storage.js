import { boats, slots, extras } from '../domain/booking.js';
export const CURRENCY_KEY = 'nautica.web.currency';
export const PASSES_KEY = 'nautica.web.passes';

export function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return { value: value ? JSON.parse(value) : fallback, error: null };
  } catch {
    return { value: fallback, error: 'Browser storage is unavailable or contains unreadable data.' };
  }
}
export function loadCurrency() {
  const stored = readStored(CURRENCY_KEY, 'INR');
  return ['INR', 'USD'].includes(stored.value) ? stored.value : 'INR';
}
export function loadPasses() {
  const { value, error } = readStored(PASSES_KEY, []);
  if (!Array.isArray(value)) return { value: [], error: 'Saved passes could not be read.' };
  return { error, value: value.filter(pass => pass && typeof pass.id === 'string' &&
    boats.some(boat => boat.id === pass.boatId) && typeof pass.name === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(pass.date) && slots.includes(pass.slot) &&
    Number.isInteger(pass.guests) && pass.guests > 0 && pass.guests <= 30 &&
    Array.isArray(pass.extras) && pass.extras.every(id => extras.some(extra => extra.id === id)) &&
    Number.isSafeInteger(pass.total) && pass.total >= 0 && typeof pass.method === 'string') };
}
export function savePass(booking) {
  // Read again at write time to retain bookings made in another tab.
  const { value, error } = loadPasses();
  if (error) throw new Error('Saved passes cannot be read. Check your browser storage settings.');
  const next = [booking, ...value.filter(pass => pass.id !== booking.id)];
  localStorage.setItem(PASSES_KEY, JSON.stringify(next));
  return next;
}
