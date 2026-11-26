/** @file Bounded asynchronous password derivation and privacy-preserving breached-password checks. */
import { scrypt, createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../errors.js';
let active = 0;
const queue = [];
export async function derivePassword(password, salt, options = {}) {
  if (active >= 4) {
    if (queue.length >= 32) throw new ApiError(503, 'Sign-in is busy. Please try again shortly.');
    await new Promise((resolve) => queue.push(resolve));
  } else active++;
  try {
    return await new Promise((resolve, reject) =>
      scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key))),
    );
  } finally {
    const next = queue.shift();
    if (next) next();
    else active--;
  }
}
export const customerHashOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export async function passwordMatchesAsync(row, password, options = customerHashOptions) {
  const candidate = await derivePassword(password, row?.salt || 'nautica-user-dummy-salt', options);
  const valid = typeof row?.hash === 'string' && /^[a-f0-9]{128}$/i.test(row.hash);
  const stored = valid ? Buffer.from(row.hash, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(candidate, stored) && valid;
}
export function commonPassword(value) {
  const text = value.normalize('NFKC').toLowerCase();
  return (
    /^(.)\1{11,}$/u.test(text) ||
    /^\d+$/.test(text) ||
    /^(password|qwerty|letmein|welcome|admin|nautica|iloveyou|abc123|123456|changeme)[\d!@#$%^&*._-]*$/.test(
      text,
    ) ||
    ['passwordpassword', 'qwertyuiopasdf', 'qwertyuiop123', '123456abcdef'].includes(text)
  );
}
export class PasswordPolicy {
  constructor({ required = false, fetcher = globalThis.fetch } = {}) {
    this.required = required;
    this.fetcher = fetcher;
  }
  async check(password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 256)
      throw new ApiError(400, 'Choose a password between 12 and 256 characters.');
    if (commonPassword(password))
      throw new ApiError(
        400,
        'Choose a less common password that has not appeared in known data breaches.',
      );
    if (!this.required) return;
    const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    try {
      const response = await this.fetcher(
        'https://api.pwnedpasswords.com/range/' + hash.slice(0, 5),
        {
          headers: { 'Add-Padding': 'true' },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new Error();
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error();
        chunks.push(Buffer.from(chunk));
      }
      const lines = Buffer.concat(chunks).toString('utf8').trim().split(/\r?\n/);
      let found = false;
      if (!lines.length) throw new Error();
      for (const line of lines) {
        const match = /^([A-F0-9]{35}):(\d+)$/.exec(line.trim());
        if (!match) throw new Error();
        if (match[1] === hash.slice(5) && Number(match[2]) > 0) found = true;
      }
      if (found)
        throw new ApiError(
          400,
          'Choose a less common password that has not appeared in known data breaches.',
        );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        'Password safety checking is temporarily unavailable. Please try again later.',
      );
    }
  }
}
