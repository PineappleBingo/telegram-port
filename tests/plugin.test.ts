import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('plugin packaging', () => {
  it('agrees on name and version across the plugin, the marketplace and package.json', () => {
    const plugin = json('.claude-plugin/plugin.json');
    const market = json('.claude-plugin/marketplace.json');
    const pkg = json('package.json');
    expect(plugin.name).toBe('telegram-port');
    expect(plugin.version).toBe(pkg.version);
    expect(market.name).toBe('telegram-port');
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0]).toMatchObject({ name: 'telegram-port', source: './', version: pkg.version });
  });

  it('ships the skill where Claude Code looks for it', () => {
    expect(existsSync('skills/telegram-port/SKILL.md')).toBe(true);
  });

  it('documents installing in both READMEs', () => {
    for (const f of ['README.md', 'README.ko.md']) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).toContain('/plugin marketplace add PineappleBingo/telegram-port');
      expect(text, f).toContain('/plugin install telegram-port@telegram-port');
      expect(text, f).toContain('/telegram-port');
    }
  });
});
