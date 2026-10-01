import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestModule, messagesModule } from './gen.mjs';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CORE_DIR = join(SKILL_ROOT, 'core');
export const TEMPLATES_DIR = join(SKILL_ROOT, 'templates');

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const versionIn = (dir) => (existsSync(join(dir, 'VERSION')) ? readFileSync(join(dir, 'VERSION'), 'utf8').trim() : null);

/**
 * Copies the engine into <telegramDir>/core. A project engine at the same version is
 * left alone (unless forced) and a newer one is never replaced: someone chose it.
 */
export function installCore(telegramDir, { force = false, from = CORE_DIR } = {}) {
  const target = join(telegramDir, 'core');
  const ours = versionIn(from);
  const theirs = versionIn(target);
  if (theirs && !force) {
    const cmp = compareVersions(theirs, ours);
    if (cmp > 0) return { core: 'newer', from: theirs, to: theirs };
    if (cmp === 0) return { core: 'current', from: theirs, to: theirs };
  }
  // Clear first, so files the new engine dropped do not linger beside it.
  rmSync(target, { recursive: true, force: true });
  cpSync(from, target, { recursive: true });
  return { core: theirs ? 'upgraded' : 'installed', from: theirs, to: ours };
}

const fill = (name, vars) =>
  Object.entries(vars).reduce((text, [key, value]) => text.split(key).join(value), readFileSync(join(TEMPLATES_DIR, name), 'utf8'));

/**
 * Installs the engine and the project layer. A project file that exists is the
 * project's and is never overwritten; only manifest.gen.ts, derived from the JSON,
 * is rewritten every time.
 */
export function installProject({ root, dir = 'src/telegram', tests = 'tests', forceCore = false }) {
  const telegramDir = join(root, dir);
  const manifestPath = join(telegramDir, 'telegram.manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`no ${dir}/telegram.manifest.json: write the manifest first`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const lang = manifest.language ?? 'en';
  const rel = (p) => relative(root, p).split(sep).join('/');
  const vars = { __LANG__: lang, __TELEGRAM__: relative(join(root, tests), telegramDir).split(sep).join('/') };

  const core = installCore(telegramDir, { force: forceCore });
  const files = [
    [join(telegramDir, 'handlers.ts'), fill('handlers.ts', vars)],
    [join(telegramDir, 'configAdapter.ts'), fill('configAdapter.ts', vars)],
    [join(telegramDir, 'index.ts'), fill('index.ts', vars)],
    [join(telegramDir, `messages.${lang}.ts`), messagesModule(manifest)],
    [join(root, tests, 'telegram.wiring.test.ts'), fill('telegram.wiring.test.ts', vars)],
  ];
  const written = [];
  const kept = [];
  for (const [path, text] of files) {
    if (existsSync(path)) {
      kept.push(rel(path));
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    written.push(rel(path));
  }
  const genPath = join(telegramDir, 'manifest.gen.ts');
  writeFileSync(genPath, manifestModule(manifest));
  return { core, written, kept, generated: rel(genPath) };
}
