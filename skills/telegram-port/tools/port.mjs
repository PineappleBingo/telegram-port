#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { manifestModule, parseMessages } from './lib/gen.mjs';
import { installProject, languageOf } from './lib/install.mjs';
import { renderPreview } from './preview/preview.mjs';

const USAGE =
  'usage: node tools/port.mjs <install|gen|preview> [--target <dir>] [--dir src/telegram] [--tests tests] [--out <file>] [--force-core] [--runner vitest|jest] [--module esm|cjs]';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: '.' },
    dir: { type: 'string', default: 'src/telegram' },
    tests: { type: 'string', default: 'tests' },
    out: { type: 'string', default: '.telegram-port/preview.html' },
    'force-core': { type: 'boolean', default: false },
    runner: { type: 'string' },
    module: { type: 'string' },
  },
});
const [command] = positionals;
const root = resolve(values.target);
const telegramDir = join(root, values.dir);
const manifestPath = join(telegramDir, 'telegram.manifest.json');

if (!['install', 'gen', 'preview'].includes(command ?? '')) fail(USAGE);
for (const flag of ['dir', 'tests', 'out']) {
  const r = relative(root, resolve(root, values[flag]));
  if (r.startsWith('..') || isAbsolute(r)) fail(`--${flag} must stay inside the target: ${values[flag]}`);
}
if (values.runner && !['vitest', 'jest'].includes(values.runner)) fail('--runner must be vitest or jest');
if (values.module && !['esm', 'cjs'].includes(values.module)) fail('--module must be esm or cjs');
if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'tsconfig.json'))) {
  fail('telegram-port supports Node/TypeScript projects only: package.json and tsconfig.json are required.');
}
if (!existsSync(manifestPath)) fail(`no ${values.dir}/telegram.manifest.json: write the manifest first`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`${values.dir}/telegram.manifest.json is not valid JSON: ${err.message}`);
}

const print = (result) => process.stdout.write(`${JSON.stringify(result)}\n`);

if (command === 'install') {
  try {
    print(installProject({
      root, dir: values.dir, tests: values.tests, forceCore: values['force-core'], runner: values.runner, module: values.module,
    }));
  } catch (err) {
    fail(err.message);
  }
} else if (command === 'gen') {
  writeFileSync(join(telegramDir, 'manifest.gen.ts'), manifestModule(manifest));
  print({ generated: `${values.dir}/manifest.gen.ts` });
} else {
  let lang;
  try {
    lang = languageOf(manifest);
  } catch (err) {
    fail(err.message);
  }
  const messagesPath = join(telegramDir, `messages.${lang}.ts`);
  const messages = existsSync(messagesPath) ? parseMessages(readFileSync(messagesPath, 'utf8')) : null;
  const out = resolve(root, values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPreview(manifest, messages));
  print({ preview: relative(root, out).split(sep).join('/'), messagesRead: messages !== null });
}
