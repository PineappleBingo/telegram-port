import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = 'skills/telegram-port/core';
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)).map((x) => `${f}/${x}`) : [f]));
const text = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe.each(readdirSync('examples'))('examples/%s', (name) => {
  it('carries the current engine (after changing core: node skills/telegram-port/tools/port.mjs install --force-core --target examples/<name>)', () => {
    const copy = `examples/${name}/src/telegram/core`;
    expect(files(copy).sort()).toEqual(files(CORE).sort());
    for (const f of files(CORE)) expect(text(join(copy, f)), f).toBe(text(join(CORE, f)));
  });
});
