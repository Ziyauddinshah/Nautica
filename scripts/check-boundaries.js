/** @file Checks tracked private artifacts and the browser/server code boundary. This is not a full secret scanner. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function boundaryIssues(filename, content = '') {
  const issues = [];
  const name = filename.replaceAll('\\', '/');
  if (
    (/(^|\/)\.env(?:\.|$)/.test(name) && name !== '.env.example') ||
    /(^|\/)(?:data|\.cache|node_modules|dist)\//.test(name) ||
    /\.(?:nbk|sqlite(?:-wal|-shm)?|bson|pem|key|p12|pfx)$/.test(name)
  )
    issues.push('Private/generated artifact must not be tracked');
  if (/^-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----$/m.test(content))
    issues.push('Private key material must not be tracked');
  if (name.startsWith('src/') && /\.[cm]?[jt]sx?$/.test(name)) {
    if (/\bprocess\s*\.\s*env\b|\bimport\s*\.\s*meta\s*\.\s*env\b/.test(content))
      issues.push(
        'Browser configuration must use reviewed public API data; environment access needs explicit security review',
      );
    const imports = content.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g);
    for (const [, specifier] of imports) {
      const destination = specifier.startsWith('.')
        ? relative(process.cwd(), resolve(dirname(resolve(filename)), specifier)).replaceAll(
            '\\',
            '/',
          )
        : specifier;
      if (/^(?:server\/|scripts\/|node:|mongodb(?:\/|$)|nodemailer(?:\/|$))/.test(destination))
        issues.push('Browser module imports a private server dependency');
    }
  }
  return [...new Set(issues)];
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  let failures = 0;
  for (const file of files) {
    let content = '';
    if (/\.(?:[cm]?[jt]sx?|json|md|ya?ml)$/.test(file)) content = readFileSync(file, 'utf8');
    for (const issue of boundaryIssues(file, content)) {
      console.error(`${file}: ${issue}`);
      failures++;
    }
  }
  if (failures) process.exitCode = 1;
  else
    console.log(
      'Tracked artifact and browser/server boundary checks passed. Run privacy tests and a proper secret scanner too.',
    );
}
