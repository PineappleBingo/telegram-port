import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SKILL = 'skills/telegram-port';
const read = (p: string) => readFileSync(`${SKILL}/${p}`, 'utf8').replace(/\r\n/g, '\n');

describe('SKILL.md', () => {
  it('has a name and a description the router can match', () => {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(read('SKILL.md'));
    expect(fm).not.toBeNull();
    expect(fm![1]).toMatch(/^name: telegram-port$/m);
    const description = /^description: (.+)$/m.exec(fm![1]!)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThan(1024);
    expect(description).toMatch(/Telegram/);
  });

  it('names every reference file it ships, and only those', () => {
    const named = [...read('SKILL.md').matchAll(/`references\/([\w.-]+\.(?:md|html))`/g)].map((m) => m[1]);
    expect(new Set(named)).toEqual(new Set(readdirSync(`${SKILL}/references`)));
  });

  it('points only at files that exist inside the skill folder', () => {
    const docs = ['SKILL.md', ...readdirSync(`${SKILL}/references`).map((f) => `references/${f}`)].map(read).join('\n');
    const paths = [...docs.matchAll(/`((?:references|tools|templates|core)\/[\w./-]+\.\w+)`/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(6);
    for (const p of paths) expect(existsSync(`${SKILL}/${p}`), p).toBe(true);
  });
});
