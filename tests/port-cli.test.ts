import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sampleManifest, sampleMessages } from './fixtures.js';

const PORT = 'skills/telegram-port/tools/port.mjs';
const run = (...args: string[]) => spawnSync(process.execPath, [PORT, ...args], { encoding: 'utf8' });

function nodeProject(withManifest = true) {
  const root = mkdtempSync(join(tmpdir(), 'tp-cli-'));
  writeFileSync(join(root, 'package.json'), '{"name":"x","type":"module"}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  mkdirSync(join(root, 'src/telegram'), { recursive: true });
  if (withManifest) writeFileSync(join(root, 'src/telegram/telegram.manifest.json'), JSON.stringify(sampleManifest));
  return root;
}

describe('port.mjs', () => {
  it('refuses a folder that is not a Node/TS project, writing nothing', () => {
    const root = mkdtempSync(join(tmpdir(), 'tp-cli-'));
    const r = run('install', '--target', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Node/TypeScript');
    expect(readdirSync(root)).toEqual([]);
  });

  it('installs and reports what it wrote as JSON', () => {
    const root = nodeProject();
    const r = run('install', '--target', root);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.core.core).toBe('installed');
    expect(out.written).toContain('src/telegram/handlers.ts');
  });

  it('regenerates the manifest module alone', () => {
    const root = nodeProject();
    const r = run('gen', '--target', root);
    expect(r.status).toBe(0);
    expect(readFileSync(join(root, 'src/telegram/manifest.gen.ts'), 'utf8')).toContain('as const');
    expect(existsSync(join(root, 'src/telegram/handlers.ts'))).toBe(false);
  });

  it('writes the preview with the project texts', () => {
    const root = nodeProject();
    writeFileSync(join(root, 'src/telegram/messages.ko.ts'), `export const messages = ${JSON.stringify(sampleMessages)};\n`);
    const r = run('preview', '--target', root);
    expect(r.status).toBe(0);
    const html = readFileSync(join(root, '.telegram-port/preview.html'), 'utf8');
    expect(html).toContain('작업 목록');
    expect(JSON.parse(r.stdout).preview).toBe('.telegram-port/preview.html');
  });

  it('says what is missing when the manifest is not there yet', () => {
    const r = run('gen', '--target', nodeProject(false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('telegram.manifest.json');
  });

  it('explains its usage for an unknown command', () => {
    const r = run('deploy', '--target', nodeProject());
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage');
  });
});
