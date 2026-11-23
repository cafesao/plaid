// Fails when AGENTS.md cites something that does not exist:
// - `pnpm <name>` where <name> is neither a package.json script nor a pnpm built-in command;
// - a path in code that starts with src/, e2e/, docs/ or scripts/, or a root file name (e.g. `package.json`, `.nvmrc`).
// Run: node scripts/check-agents-doc.mjs (part of `pnpm check`).
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(root, 'AGENTS.md'), 'utf8');
const scripts = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {});

const PNPM_BUILTINS = new Set([
  'add',
  'approve-builds',
  'dlx',
  'exec',
  'i',
  'import',
  'install',
  'list',
  'ls',
  'outdated',
  'peers',
  'remove',
  'run',
  'store',
  'up',
  'update',
  'view',
  'why'
]);
const PATH_PREFIXES = ['src/', 'e2e/', 'docs/', 'scripts/'];
const ROOT_FILE = /^(\.[\w.-]+|[\w.-]+\.(json|jsonc|ts|js|mjs|md|yaml|yml))$/;

// Code is what agents copy: inline `code` spans and fenced blocks.
const fenced = [...doc.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(m => m[1]);
const prose = doc.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
const inline = [...prose.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);
const code = [...inline, ...fenced];

const problems = [];

const commands = new Set();
for (const snippet of code) {
  for (const m of snippet.matchAll(/\bpnpm\s+(?:run\s+)?([a-z][\w:-]*)/g)) {
    commands.add(m[1]);
  }
}
for (const name of commands) {
  if (!scripts.includes(name) && !PNPM_BUILTINS.has(name)) {
    problems.push(`pnpm ${name}: no such script in package.json`);
  }
}

const paths = new Set();
for (const snippet of code) {
  for (const token of snippet.split(/\s+/)) {
    const path = token.replace(/^['"(]+|['"),.:;]+$/g, '');
    if (PATH_PREFIXES.some(prefix => path.startsWith(prefix)) || ROOT_FILE.test(path)) {
      paths.add(path);
    }
  }
}
for (const path of paths) {
  // For a glob, the fixed part before the first wildcard must exist.
  const fixed = path.includes('*') ? path.slice(0, path.indexOf('*')) : path;
  if (!existsSync(join(root, fixed))) {
    problems.push(`${path}: no such file or directory`);
  }
}

if (problems.length > 0) {
  console.error(`AGENTS.md cites things that do not exist:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`AGENTS.md ok: ${commands.size} pnpm commands and ${paths.size} paths exist.`);
