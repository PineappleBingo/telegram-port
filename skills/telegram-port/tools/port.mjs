#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { manifestModule, parseMessages } from './lib/gen.mjs';
import { installProject } from './lib/install.mjs';
import { renderPreview } from './preview/preview.mjs';

const USAGE = 'usage: node tools/port.mjs <install|gen|preview> [--target <dir>] [--dir src/telegram] [--tests tests] [--out <file>] [--force-core]';

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
  },
});
const [command] = positionals;
const root = resolve(values.target);
const telegramDir = join(root, values.dir);
const manifestPath = join(telegramDir, 'telegram.manifest.json');

if (!['install', 'gen', 'preview'].includes(command ?? '')) fail(USAGE);
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
  print(installProject({ root, dir: values.dir, tests: values.tests, forceCore: values['force-core'] }));
} else if (command === 'gen') {
  writeFileSync(join(telegramDir, 'manifest.gen.ts'), manifestModule(manifest));
  print({ generated: `${values.dir}/manifest.gen.ts` });
} else {
  const messagesPath = join(telegramDir, `messages.${manifest.language ?? 'en'}.ts`);
  const messages = existsSync(messagesPath) ? parseMessages(readFileSync(messagesPath, 'utf8')) : null;
  const out = resolve(root, values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPreview(manifest, messages));
  print({ preview: relative(root, out).split(sep).join('/'), messagesRead: messages !== null });
}
