import { MAX_CALLBACK_BYTES } from '../callback.js';
import type { Engine, Outgoing } from '../engine.js';

export interface SimProblem {
  where: string;
  problem: string;
}
export interface SimReport {
  pressed: number;
  problems: SimProblem[];
}

/**
 * Taps every reachable button once, starting from /start. Read actions run for
 * real; write and danger stop at their confirm screen or prompt, and settings
 * stop before saving — the walk must be safe to run against a live project.
 */
export async function simulate(engine: Engine, opts: { ownerChatId: number; maxPresses?: number }): Promise<SimReport> {
  const chatId = opts.ownerChatId;
  const max = opts.maxPresses ?? 500;
  const problems: SimProblem[] = [];
  const failed = new RegExp(`^${engine.t('core.failed', { code: '__CODE__' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('__CODE__', '[0-9A-Z]+')}$`);
  const staleText = engine.t('core.stale');
  const seen = new Set<string>();
  const queue: Array<{ where: string; out: Outgoing }> = [];
  let pressed = 0;

  const look = (where: string, outs: Outgoing[]) => {
    for (const out of outs) {
      if (out.text.trim() === '') problems.push({ where, problem: 'empty reply' });
      if (failed.test(out.text)) problems.push({ where, problem: 'handler failed' });
      if (out.text === staleText && where !== '/start') problems.push({ where, problem: 'button leads to a stale menu' });
      for (const b of out.buttons?.flat() ?? []) {
        if (Buffer.byteLength(b.data, 'utf8') > MAX_CALLBACK_BYTES) problems.push({ where: `${where} › ${b.text}`, problem: 'callback data over 64 bytes' });
      }
      queue.push({ where, out });
    }
  };

  look('/start', await engine.handle({ chatId, text: '/start' }));
  while (queue.length > 0 && pressed < max) {
    const { where, out } = queue.shift() as { where: string; out: Outgoing };
    for (const b of out.buttons?.flat() ?? []) {
      if (seen.has(b.data)) continue;
      seen.add(b.data);
      const decoded = engine.decode(b.data);
      // Never press what would change state: a write confirm or a settings save.
      if (decoded.ok && (decoded.value.kind === 'c' || (decoded.value.kind === 's' && decoded.value.id.startsWith('y.')))) continue;
      pressed += 1;
      look(`${where} › ${b.text}`, await engine.handle({ chatId, callback: b.data }));
    }
  }
  return { pressed, problems };
}
