/** @file Runs the synthetic pilot checks and writes a private result report without live providers. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'),
  startedAt = new Date().toISOString();
const checks = [
  ['application-tests', ['test']],
  ['isolated-backup-restoration', ['run', 'test:recovery']],
  ['multi-server-booking-payment-refund-security-pilot', ['run', 'test:mongodb']],
  ['production-build', ['run', 'build']],
];
const results = [];
for (const [name, args] of checks) {
  console.log(`Pilot check: ${name}`);
  const start = Date.now();
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
  results.push({ name, passed: exitCode === 0, durationMs: Date.now() - start });
  if (exitCode !== 0) break;
}
const passed = results.length === checks.length && results.every((r) => r.passed);
await mkdir(resolve(root, 'data'), { recursive: true, mode: 0o700 });
await writeFile(
  resolve(root, 'data/pilot-simulation.json'),
  JSON.stringify(
    {
      mode: 'synthetic-local-pilot',
      startedAt,
      completedAt: new Date().toISOString(),
      passed,
      liveLaunchApproved: false,
      liveProviderDeliveryVerified: false,
      productionBackupRestored: false,
      results,
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
);
console.log(
  'Pilot simulation report saved privately to data/pilot-simulation.json. Live customer acceptance remains separate.',
);
if (!passed) process.exitCode = 1;
