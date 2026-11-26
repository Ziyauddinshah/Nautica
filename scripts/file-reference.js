/** @file Generates or checks the repository file index from tracked and unignored source files. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const target = 'docs/FILE_REFERENCE.md';
const files = [
  ...new Set([
    ...execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
    target,
  ]),
].sort();
const special = {
  'package.json': 'Runtime dependencies, development tools and npm commands.',
  'package-lock.json': 'Generated dependency versions and integrity hashes; update through npm.',
  '.env.example':
    'Placeholder server environment settings; copy privately, never commit populated secrets.',
  '.gitignore': 'Files Git must exclude, including local data, keys and private backups.',
  '.dockerignore': 'Files excluded from container build contexts.',
  '.prettierrc.json': 'Shared code layout rules.',
  '.prettierignore': 'Generated and private files excluded from formatting.',
  Dockerfile: 'Production application image build; no production secrets belong in image layers.',
  'compose.yaml': 'Application replicas and ingress deployment wiring.',
  'index.html': 'Browser HTML entry loaded by Vite.',
  'vite.config.js': 'Build/test configuration and development restrictions on private file access.',
  [target]: 'Generated file-by-file navigation index; regenerate with npm run docs:generate.',
};
function purpose(file) {
  if (special[file]) return special[file];
  const content = readFileSync(file, 'utf8'),
    header = content.match(/@file\s+([^\n]*?)(?:\s*\*\/|$)/);
  if (header) return header[1].replaceAll('|', '/');
  if (file.endsWith('.md'))
    return (content.match(/^#\s+(.+)/m)?.[1] || 'Project documentation.') + '.';
  if (file.startsWith('.github/'))
    return 'Repository automation; checks run against synthetic data without production secrets.';
  if (file.startsWith('deploy/'))
    return 'Ingress/deployment configuration; review trusted proxy and network boundaries before production.';
  return 'Project configuration or asset; review its references before changing it.';
}
let output =
  '# Repository file reference\n\nGenerated with `npm run docs:generate`. Start with [the developer guide](DEVELOPER_GUIDE.md).\nPurpose comments describe modules; feature guides explain business rules and security limits.\n\n';
for (const group of [
  ...new Set(files.map((file) => (file.includes('/') ? file.split('/')[0] : 'Root'))),
]) {
  output += `## ${group}\n\n| File | Purpose |\n| --- | --- |\n`;
  for (const file of files.filter(
    (file) => (file.includes('/') ? file.split('/')[0] : 'Root') === group,
  ))
    output += `| [${file}](../${file}) | ${purpose(file)} |\n`;
  output += '\n';
}
// Keep generated output byte-stable; Prettier preserves this table with the ignore marker.
output = '<!-- prettier-ignore-start -->\n' + output + '<!-- prettier-ignore-end -->\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) {
    console.error('File reference is stale. Run npm run docs:generate.');
    process.exitCode = 1;
  } else console.log('File reference is current.');
} else writeFileSync(target, output);
