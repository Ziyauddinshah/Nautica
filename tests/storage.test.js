import { expect,test,vi } from 'vitest';
import { CURRENCY_KEY,loadCurrency } from '../src/lib/storage.js';
import { clearLegacyPassCache } from '../src/hooks/useCustomerSession.js';
test('retains the non-sensitive currency preference',()=>{for(const currency of ['INR','USD']){localStorage.setItem(CURRENCY_KEY,JSON.stringify(currency));expect(loadCurrency()).toBe(currency);}});
test('unsupported currency falls back to INR',()=>{localStorage.setItem(CURRENCY_KEY,JSON.stringify('EUR'));expect(loadCurrency()).toBe('INR');});
test('malformed currency data is handled without crashing',()=>{localStorage.setItem(CURRENCY_KEY,'{broken');expect(loadCurrency()).toBe('INR');});
test('blocked browser storage does not affect authentication',()=>{vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});expect(loadCurrency()).toBe('INR');});
test('legacy personal pass cache is removed without clearing currency',()=>{localStorage.setItem(CURRENCY_KEY,JSON.stringify('USD'));localStorage.setItem('nautica.web.passes',JSON.stringify([{name:'Other user'}]));clearLegacyPassCache();expect(localStorage.getItem('nautica.web.passes')).toBeNull();expect(loadCurrency()).toBe('USD');});
