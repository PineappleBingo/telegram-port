import type { ActionSpec } from './manifest.js';

/**
 * The engine asks this before any handler runs, so a handler cannot skip it:
 * read runs at once, write needs a confirm tap, danger needs the typed phrase.
 */
export function guardDecision(action: ActionSpec): 'run' | 'confirm' | 'danger' {
  if (action.risk === 'danger') return 'danger';
  if (action.risk === 'write') return 'confirm';
  return 'run';
}

/** Exact match after trimming: a near miss ("purge", "PURGE!") is not consent. */
export function phraseMatches(expected: string, typed: string): boolean {
  return typed.trim() === expected;
}
