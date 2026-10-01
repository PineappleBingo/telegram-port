import { describe, expect, it } from 'vitest';
import { guardDecision, phraseMatches } from '../core/guard.js';

describe('guardDecision', () => {
  it('runs read, confirms write, gates danger', () => {
    expect(guardDecision({ id: 'a', label: 'l', risk: 'read' })).toBe('run');
    expect(guardDecision({ id: 'a', label: 'l', risk: 'write' })).toBe('confirm');
    expect(guardDecision({ id: 'a', label: 'l', risk: 'danger', confirmPhrase: 'X' })).toBe('danger');
  });
});

describe('phraseMatches', () => {
  it('ignores surrounding spaces only', () => {
    expect(phraseMatches('PURGE', '  PURGE ')).toBe(true);
    expect(phraseMatches('PURGE', 'purge')).toBe(false);
    expect(phraseMatches('PURGE', 'PURGE!')).toBe(false);
    expect(phraseMatches('PURGE', 'PUR GE')).toBe(false);
  });
});
