import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = process.cwd();
const skip = new Set(['.git', 'node_modules', 'cloudflare-dist', 'dist']);
const problems = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) { problems.push(`${relative(root,path)}: unexpected symlink`); continue; }
    if (entry.isDirectory()) { walk(path); continue; }
    const name = relative(root, path);
    if (/^(?:\.dev\.vars|\.env)(?:\.|$)/.test(entry.name) || /\.(?:sqlite(?:-.*)?|db|pem|key|log)$/.test(entry.name)) problems.push(`${name}: excluded artifact`);
    if (name === 'scripts/check-sanitization.mjs' || name === 'docs/dashboard-preview.png') continue;
    const text = readFileSync(path, 'utf8');
    const emails = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
    if (emails.some(value => !value.endsWith('@example.com'))) problems.push(`${name}: non-example email`);
    if (/(?:secret_|ntn_|gh[pousr]_)[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problems.push(`${name}: possible secret`);
    if (/https?:\/\/(?:app\.)?notion\.(?:com|so)\/[^\s"']+/.test(text)) problems.push(`${name}: embedded workspace URL`);
  }
}
walk(root);
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
else console.log('Sanitization checks passed.');
