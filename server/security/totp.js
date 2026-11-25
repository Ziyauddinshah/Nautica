import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../errors.js';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of bytes) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[value << 5 - bits & 31];
  return result;
}
export function decode32(value) {
  let bits = 0,
    buffer = 0,
    out = [];
  for (const c of value) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error('Invalid key.');
    buffer = buffer << 5 | n;
    bits += 5;
    if (bits >= 8) {
      out.push(buffer >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function totp(secret, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', decode32(secret)).update(counter).digest(),
    offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function matchingStep(secret, code, now = Date.now(), last = -1) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) if (step > last && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  return null;
}
export function secretBox(hex) {
  const configured = typeof hex === 'string' && /^[a-fA-F0-9]{64}$/.test(hex);
  function key() {
    if (!configured) throw new ApiError(503, 'Admin authentication is temporarily unavailable.');
    return Buffer.from(hex, 'hex');
  }
  return {
    configured,
    seal(value, context) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from(context));
      return {
        iv: iv.toString('hex'),
        data: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex'),
        tag: cipher.getAuthTag().toString('hex')
      };
    },
    open(value, context) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv, 'hex'));
        decipher.setAAD(Buffer.from(context));
        decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(value.data, 'hex')), decipher.final()]).toString('utf8');
      } catch {
        throw new ApiError(503, 'Admin authentication is temporarily unavailable.');
      }
    }
  };
}
