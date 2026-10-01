import { describe, expect, it } from 'vitest';
import { CallbackCodec, MAX_CALLBACK_BYTES, MAX_HASHED } from '../skills/telegram-port/core/callback.js';

describe('CallbackCodec', () => {
  it('round-trips a stable id, with and without an argument containing colons', () => {
    const c = new CallbackCodec(3);
    expect(c.encode('a', 'jobs.list')).toBe('3|a:jobs.list');
    expect(c.decode(c.encode('a', 'jobs.list'))).toEqual({ ok: true, value: { kind: 'a', id: 'jobs.list', arg: undefined } });
    expect(c.decode(c.encode('s', 'v.jobs.level', 'a:b'))).toEqual({ ok: true, value: { kind: 's', id: 'v.jobs.level', arg: 'a:b' } });
  });

  it('hashes data past 64 bytes and still decodes it', () => {
    const c = new CallbackCodec(1);
    const data = c.encode('a', 'wallet.remove', 'x'.repeat(80));
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(MAX_CALLBACK_BYTES);
    expect(data.startsWith('1|h:')).toBe(true);
    expect(c.decode(data)).toEqual({ ok: true, value: { kind: 'a', id: 'wallet.remove', arg: 'x'.repeat(80) } });
  });

  it('treats another rev and a forgotten hash as stale', () => {
    const old = new CallbackCodec(2);
    const fresh = new CallbackCodec(3);
    expect(fresh.decode(old.encode('a', 'jobs.list'))).toEqual({ ok: false, reason: 'stale' });
    const hashed = old.encode('a', 'id', 'y'.repeat(80));
    expect(new CallbackCodec(2).decode(hashed)).toEqual({ ok: false, reason: 'stale' });
  });

  it('keeps a bounded number of hashed buttons, forgetting the oldest', () => {
    const c = new CallbackCodec(1);
    const first = c.encode('s', 'y.f', `${'z'.repeat(70)}0`);
    for (let i = 1; i <= MAX_HASHED; i++) c.encode('s', 'y.f', `${'z'.repeat(70)}${i}`);
    expect(c.decode(first)).toEqual({ ok: false, reason: 'stale' });
    expect(c.decode(c.encode('s', 'y.f', `${'z'.repeat(70)}${MAX_HASHED}`)).ok).toBe(true);
  });

  it('calls anything else unknown', () => {
    const c = new CallbackCodec(1);
    expect(c.decode('hello')).toEqual({ ok: false, reason: 'unknown' });
    expect(c.decode('1|q:id')).toEqual({ ok: false, reason: 'unknown' });
  });
});
