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
