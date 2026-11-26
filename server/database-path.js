/** @file Resolves legacy SQLite test/migration paths and protects public directories. */
import { fileURLToPath } from 'node:url';
import { resolve, isAbsolute } from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
// Relative settings always refer to the application directory, never the caller's cwd.
export function databasePath(env = process.env) {
  const configured = env.NAUTICA_DB?.trim();
  if (configured === ':memory:') {
    if (env.NODE_ENV === 'production')
      throw new Error('Production requires a persistent database file.');
    return configured;
  }
  if (env.NODE_ENV === 'production' && (!configured || !isAbsolute(configured)))
    throw new Error('Production requires an absolute NAUTICA_DB path on persistent storage.');
  return resolve(projectRoot, configured || 'data/nautica.sqlite');
}
