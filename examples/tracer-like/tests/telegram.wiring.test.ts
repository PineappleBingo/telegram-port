import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configAdapter } from '../src/telegram/configAdapter.js';
import { createEngine, simulate } from '../src/telegram/core/index.js';
import { actions, status } from '../src/telegram/handlers.js';
import { manifest } from '../src/telegram/manifest.gen.js';
import { messages } from '../src/telegram/messages.ko.js';

// Written once by telegram-port; yours to extend.
const raw = JSON.parse(readFileSync(new URL('../src/telegram/telegram.manifest.json', import.meta.url), 'utf8'));
const OWNER = 1;
const engine = () => createEngine({ manifest, actions, status, messages, ownerChatId: OWNER, config: configAdapter });

describe('telegram wiring', () => {
  it('manifest.gen.ts matches telegram.manifest.json (after editing the JSON, run the gen tool)', () => {
    expect(manifest).toEqual(raw);
  });

  it('wires every action, status field, text and setting', () => {
    expect(engine).not.toThrow();
  });

  it('finds every setting path in the config', () => {
    for (const f of raw.settings?.fields ?? []) expect(configAdapter.get(f.path), f.path).not.toBeUndefined();
  });

  it('answers every reachable button without a failure', async () => {
    expect((await simulate(engine(), { ownerChatId: OWNER })).problems).toEqual([]);
  });
});
