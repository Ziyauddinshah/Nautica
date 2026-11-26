/** @file Pure validation and public data rules for signature. */
import { createHmac, timingSafeEqual } from 'node:crypto';
export function validSignature(value, message, secret) {
  if (typeof value !== 'string' || !/^\w{64}$/.test(value) || !secret) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  const supplied = Buffer.from(value, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
