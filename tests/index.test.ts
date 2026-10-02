import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '../skills/telegram-port/core/index.js';

describe('core/index', () => {
  it('exposes the pieces a project uses', () => {
    for (const name of ['startTelegram', 'createEngine', 'validateManifest', 'ManifestError', 'simulate', 'deliver', 'CORE_MESSAGES', 'CORE_VERSION']) {
      expect(core).toHaveProperty(name);
    }
  });

  it('reports the version written in core/VERSION', () => {
    expect(core.CORE_VERSION).toBe(readFileSync(new URL('../skills/telegram-port/core/VERSION', import.meta.url), 'utf8').trim());
  });
});
