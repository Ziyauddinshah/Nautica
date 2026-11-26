/** @file Trusted interactive console recovery that revokes sessions and authorizes MFA re-enrollment. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { openRepository } from '../server/runtime.js';
let muted = false,
  repo,
  prompt;
try {
  if (!process.stdin.isTTY)
    throw new Error('Run admin:mfa:reset in an interactive trusted server terminal.');
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const username = (
    await prompt.question('Admin username to authorize for new enrollment: ')
  ).trim();
  process.stdout.write('Current admin password (hidden): ');
  muted = true;
  const password = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  const confirmed = await prompt.question(
    'This revokes admin sessions and recovery codes. Type the same username to continue: ',
  );
  if (confirmed !== username) throw new Error('Reset cancelled.');
  repo = await openRepository();
  await repo.mfa.reset(username, password);
  console.log(
    'Existing admin sessions and recovery codes were revoked. Complete new authenticator enrollment at /admin.',
  );
} catch (error) {
  muted = false;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt?.close();
  await repo?.close();
}
