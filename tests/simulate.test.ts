import { describe, expect, it, vi } from 'vitest';
import { createEngine, type ActionHandler } from '../core/engine.js';
import { simulate } from '../core/testing/simulate.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

function engine(over: Record<string, ActionHandler> = {}) {
  const spy = vi.fn(async (_arg: string | undefined) => 'ok');
  const actions: Record<string, ActionHandler> = {
    'status.show': spy, 'jobs.list': spy, 'jobs.mode': spy, 'jobs.add': spy, 'jobs.purge': spy, ...over,
  };
  const e = createEngine({
    manifest: JSON.parse(JSON.stringify(sampleManifest)),
    actions,
    status: { 'jobs.today': () => 1, 'jobs.queue': () => 2 },
    messages: sampleMessages,
    ownerChatId: 1,
    config: { get: () => 0.5, set: vi.fn() },
  });
  return { e, spy };
}

describe('simulate', () => {
  it('presses every reachable button and runs only read actions', async () => {
    const { e, spy } = engine();
    const report = await simulate(e, { ownerChatId: 1 });
    expect(report.problems).toEqual([]);
    expect(report.pressed).toBeGreaterThan(10);
    // status.show and jobs.list are read; mode/add/purge stop at their confirm or prompt.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reports a handler that fails and one that answers with nothing', async () => {
    const { e } = engine({
      'jobs.list': async () => { throw new Error('db down'); },
      'status.show': async () => '   ',
    });
    const report = await simulate(e, { ownerChatId: 1 });
    expect(report.problems.map((p) => p.problem)).toEqual(expect.arrayContaining(['handler failed', 'empty reply']));
    expect(report.problems.find((p) => p.problem === 'handler failed')!.where).toContain('작업 목록');
  });
});
