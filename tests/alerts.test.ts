import { describe, expect, it, vi } from 'vitest';
import { Alerts } from '../core/alerts.js';
import { validateManifest } from '../core/manifest.js';
import { CORE_MESSAGES } from '../core/messages.core.js';
import { makeT } from '../core/text.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

function setup(send = vi.fn(async (_text: string) => undefined)) {
  const manifest = validateManifest(JSON.parse(JSON.stringify(sampleManifest)), { ...CORE_MESSAGES.ko, ...sampleMessages });
  const log = { warn: vi.fn(), error: vi.fn() };
  return { alerts: new Alerts({ manifest, t: makeT(sampleMessages, CORE_MESSAGES.ko), send, log }), send, log };
}

describe('Alerts', () => {
  it('fills the template and sends', async () => {
    const { alerts, send } = setup();
    expect(await alerts.send('job.done', { name: 'A' })).toBe(true);
    expect(send).toHaveBeenCalledWith('작업 A 완료');
  });

  it('holds mutable alerts while paused but always sends the unmutable ones', async () => {
    const { alerts, send } = setup();
    alerts.pause();
    expect(await alerts.send('job.done', { name: 'A' })).toBe(false);
    expect(await alerts.send('job.crash', { name: 'B' })).toBe(true);
    alerts.resume();
    expect(await alerts.send('job.done', { name: 'C' })).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never throws: an unknown id or a failed send is logged and reported false', async () => {
    const { alerts, log } = setup(vi.fn(async () => { throw new Error('network'); }));
    expect(await alerts.send('nope')).toBe(false);
    expect(await alerts.send('job.done', { name: 'A' })).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
