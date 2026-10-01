import { describe, expect, it } from 'vitest';
import { CORE_MESSAGES } from '../skills/telegram-port/core/messages.core.js';
import { errorCode, makeT, splitMessage } from '../skills/telegram-port/core/text.js';

describe('makeT', () => {
  const t = makeT({ 'hello': '안녕 {name}', 'core.done': '끝' }, { 'core.done': '완료', 'core.back': '뒤로' });

  it('fills variables and keeps unknown placeholders', () => {
    expect(t('hello', { name: '진호' })).toBe('안녕 진호');
    expect(t('hello')).toBe('안녕 {name}');
  });

  it('prefers the project text, falls back to core, then to the key', () => {
    expect(t('core.done')).toBe('끝');
    expect(t('core.back')).toBe('뒤로');
    expect(t('nope')).toBe('nope');
  });

  it('says whether a key exists', () => {
    expect(t.has('core.back')).toBe(true);
    expect(t.has('nope')).toBe(false);
  });
});

describe('splitMessage', () => {
  it('keeps short text whole', () => {
    expect(splitMessage('abc')).toEqual(['abc']);
  });

  it('cuts at the last newline before the limit, and hard-cuts a line with none', () => {
    expect(splitMessage('aaaa\nbbbb\ncc', 10)).toEqual(['aaaa\nbbbb', 'cc']);
    expect(splitMessage('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});

describe('errorCode', () => {
  it('is short, upper-case and varies', () => {
    const a = errorCode(() => 1_000);
    expect(a).toMatch(/^[0-9A-Z]{6}$/);
    expect(errorCode(() => 2_000_000)).not.toBe(a);
  });
});

describe('CORE_MESSAGES', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(CORE_MESSAGES.en).sort()).toEqual(Object.keys(CORE_MESSAGES.ko).sort());
  });
});
