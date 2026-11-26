/** @file Trusted operator CLI to create/update an individual admin without printing its password. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { openRepository } from '../server/runtime.js';
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
let db;
try {
  const username = (
    process.env.NAUTICA_ADMIN_USER || (await prompt.question('Admin username: '))
  ).trim();
  let password = process.env.NAUTICA_ADMIN_PASSWORD;
  if (!password) {
    process.stdout.write('Password (at least 12 characters; hidden): ');
    muted = true;
    password = await prompt.question('');
    muted = false;
    process.stdout.write('\nConfirm password: ');
    muted = true;
    const confirmation = await prompt.question('');
    muted = false;
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('Passwords do not match.');
  }
  db = await openRepository();
  await db.setAdmin(username, password);
  console.log(
    `Admin account ${username} is ready. Sign in at /admin. Existing sessions for this account were revoked. Complete authenticator enrollment before using admin features; existing MFA is preserved.`,
  );
} catch (error) {
  muted = false;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
  await db?.close();
}
