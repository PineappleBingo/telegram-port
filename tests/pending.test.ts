import { describe, expect, it } from 'vitest';
import { INPUT_TTL_MS, PendingInputs } from '../core/pending.js';

describe('PendingInputs', () => {
  it('hands a pending input out once', () => {
    const p = new PendingInputs();
    p.set(1, { kind: 'arg', actionId: 'a' });
    expect(p.take(1)).toEqual({ pending: { kind: 'arg', actionId: 'a' } });
    expect(p.take(1)).toBeNull();
  });

  it('expires after the TTL', () => {
    let t = 0;
    const p = new PendingInputs(INPUT_TTL_MS, () => t);
    p.set(1, { kind: 'setting', fieldId: 'f' });
    t = INPUT_TTL_MS + 1;
    expect(p.take(1)).toEqual({ expired: true });
  });

  it('keeps chats apart and cancels', () => {
    const p = new PendingInputs();
    p.set(1, { kind: 'arg', actionId: 'a' });
    p.set(2, { kind: 'arg', actionId: 'b' });
    p.cancel(1);
    expect(p.take(1)).toBeNull();
    expect(p.take(2)).toEqual({ pending: { kind: 'arg', actionId: 'b' } });
  });
});
