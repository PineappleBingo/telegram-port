import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareVersions, installCore, installProject } from '../skills/telegram-port/tools/lib/install.mjs';
import { sampleManifest } from './fixtures.js';

const PLUGIN_VERSION = readFileSync('skills/telegram-port/core/VERSION', 'utf8').trim();

function project(manifest: object | null = sampleManifest) {
  const root = mkdtempSync(join(tmpdir(), 'tp-'));
  mkdirSync(join(root, 'src/telegram'), { recursive: true });
  if (manifest) writeFileSync(join(root, 'src/telegram/telegram.manifest.json'), JSON.stringify(manifest, null, 2));
  return root;
}
const read = (root: string, p: string) => readFileSync(join(root, p), 'utf8');

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
  });
});

describe('installProject', () => {
  it('lays out the project layer on a first run', () => {
    const root = project();
    const r = installProject({ root });
    expect(r.core).toEqual({ core: 'installed', from: null, to: PLUGIN_VERSION });
    expect(r.written.sort()).toEqual([
      'src/telegram/configAdapter.ts', 'src/telegram/handlers.ts', 'src/telegram/index.ts',
      'src/telegram/messages.ko.ts', 'tests/telegram.wiring.test.ts',
    ]);
    expect(r.generated).toBe('src/telegram/manifest.gen.ts');
    expect(existsSync(join(root, 'src/telegram/core/index.ts'))).toBe(true);
    expect(read(root, 'tests/telegram.wiring.test.ts')).toContain("from '../src/telegram/core/index.js'");
    expect(read(root, 'tests/telegram.wiring.test.ts')).toContain("'../src/telegram/messages.ko.js'");
    expect(read(root, 'src/telegram/index.ts')).toContain("from './messages.ko.js'");
    expect(read(root, 'src/telegram/manifest.gen.ts')).toContain('"manifestRev": 3');
  });

  it('keeps every file the project already has, and regenerates only the manifest module', () => {
    const root = project();
    installProject({ root });
    writeFileSync(join(root, 'src/telegram/handlers.ts'), '// EDITED by a person\n');
    writeFileSync(join(root, 'src/telegram/messages.ko.ts'), '// EDITED messages\n');
    writeFileSync(join(root, 'src/telegram/telegram.manifest.json'), JSON.stringify({ ...sampleManifest, manifestRev: 4 }));
    const r = installProject({ root });
    expect(r.written).toEqual([]);
    expect(r.kept).toContain('src/telegram/handlers.ts');
    expect(read(root, 'src/telegram/handlers.ts')).toBe('// EDITED by a person\n');
    expect(read(root, 'src/telegram/messages.ko.ts')).toBe('// EDITED messages\n');
    expect(read(root, 'src/telegram/manifest.gen.ts')).toContain('"manifestRev": 4');
    expect(r.core.core).toBe('current');
  });

  it('refuses to run before the manifest exists', () => {
    expect(() => installProject({ root: project(null) })).toThrow(/telegram\.manifest\.json/);
  });
});

describe('installCore', () => {
  it('never downgrades a newer engine', () => {
    const root = project();
    mkdirSync(join(root, 'src/telegram/core'), { recursive: true });
    writeFileSync(join(root, 'src/telegram/core/VERSION'), '9.0.0\n');
    expect(installCore(join(root, 'src/telegram'))).toEqual({ core: 'newer', from: '9.0.0', to: '9.0.0' });
    expect(existsSync(join(root, 'src/telegram/core/index.ts'))).toBe(false);
  });

  it('upgrades an older engine and drops files the new one no longer has', () => {
    const root = project();
    mkdirSync(join(root, 'src/telegram/core'), { recursive: true });
    writeFileSync(join(root, 'src/telegram/core/VERSION'), '0.0.1\n');
    writeFileSync(join(root, 'src/telegram/core/gone.ts'), 'old\n');
    expect(installCore(join(root, 'src/telegram'))).toEqual({ core: 'upgraded', from: '0.0.1', to: PLUGIN_VERSION });
    expect(existsSync(join(root, 'src/telegram/core/gone.ts'))).toBe(false);
    expect(read(root, 'src/telegram/core/VERSION').trim()).toBe(PLUGIN_VERSION);
  });

  it('replaces a same-version engine only when forced', () => {
    const root = project();
    installCore(join(root, 'src/telegram'));
    writeFileSync(join(root, 'src/telegram/core/index.ts'), '// drifted\n');
    expect(installCore(join(root, 'src/telegram')).core).toBe('current');
    expect(read(root, 'src/telegram/core/index.ts')).toBe('// drifted\n');
    expect(installCore(join(root, 'src/telegram'), { force: true }).core).toBe('upgraded');
    expect(read(root, 'src/telegram/core/index.ts')).not.toBe('// drifted\n');
  });
});
