/** @file Validates private MongoDB connection settings and production consistency requirements. */
export function mongoConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (env.STORAGE_PROVIDER && env.STORAGE_PROVIDER !== 'mongodb')
    throw new Error('The runtime requires MongoDB; local database fallback is disabled.');
  const uri =
    env.MONGODB_URI?.trim() || (production ? '' : 'mongodb://127.0.0.1:27017/?replicaSet=rs0');
  const database = env.MONGODB_DB?.trim() || (production ? '' : 'nautica_test');
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri))
    throw new Error('Configure a server-only MONGODB_URI.');
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(database))
    throw new Error('Configure an explicit valid MONGODB_DB.');
  // Never print the URI: it can contain database credentials.
  const options = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(uri.split('?')[1] || ''))
    options.append(key.toLowerCase(), value.toLowerCase());
  const has = (key, value) => options.getAll(key.toLowerCase()).includes(value);
  if (
    ['tlsAllowInvalidCertificates', 'tlsAllowInvalidHostnames', 'tlsInsecure'].some((key) =>
      has(key, 'true'),
    )
  )
    throw new Error('Insecure MongoDB TLS settings are forbidden.');
  if (
    options.getAll('w').some((value) => value !== 'majority') ||
    has('j', 'false') ||
    has('journal', 'false') ||
    options.getAll('readpreference').some((value) => value !== 'primary') ||
    options
      .getAll('readconcernlevel')
      .some((value) => !['majority', 'linearizable'].includes(value))
  )
    throw new Error(
      'MongoDB configuration must preserve primary reads and majority journaled writes.',
    );
  if (production) {
    if (!uri.startsWith('mongodb+srv://') && !has('tls', 'true') && !has('ssl', 'true'))
      throw new Error('Production MongoDB requires TLS.');
    if (has('tls', 'false') || has('ssl', 'false') || has('directConnection', 'true'))
      throw new Error('Production requires a TLS replica set or sharded cluster.');
    const hosts = uri
      .slice(uri.indexOf('://') + 3)
      .split('/')[0]
      .split('@')
      .at(-1);
    if (/(^|,)(localhost|127\.|\[::1\])/.test(hosts))
      throw new Error('Production must use the online MongoDB cluster, not local test storage.');
  }
  return { uri, database, production };
}
