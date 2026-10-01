import { describe, expect, it, vi } from 'vitest';
import { renderStatus } from '../core/status.js';
import { makeT } from '../core/text.js';

const t = makeT({ 'status.a': '가', 'status.b': '나', 'status.c': '다' }, {});

describe('renderStatus', () => {
  it('lists every field, showing — for null and for a field that throws', async () => {
    const onError = vi.fn();
    const text = await renderStatus('📊', ['a', 'b', 'c'], { a: () => 3, b: async () => null, c: () => { throw new Error('boom'); } }, t, onError);
    expect(text).toBe('📊\n가: 3\n나: —\n다: —');
    expect(onError).toHaveBeenCalledWith('c', expect.any(Error));
  });
});
