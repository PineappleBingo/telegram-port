import { describe, expect, it } from 'vitest';
import { CORE_MESSAGES } from '../core/messages.core.js';
import { ManifestError, validateManifest } from '../core/manifest.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

const msgs = { ...CORE_MESSAGES.ko, ...sampleMessages };
const clone = () => JSON.parse(JSON.stringify(sampleManifest));
const problemsOf = (raw: unknown, m = msgs): string[] => {
  try {
    validateManifest(raw, m);
    return [];
  } catch (err) {
    if (err instanceof ManifestError) return err.problems;
    throw err;
  }
};

describe('validateManifest', () => {
  it('accepts the sample and fills defaults', () => {
    const m = validateManifest(clone(), msgs);
    expect(m.actions).toHaveLength(5);
    expect(m.alerts[0]?.mutable).toBe(true);
  });

  it('rejects a shape error with its path', () => {
    const raw = clone();
    raw.actions[0].risk = 'maybe';
    expect(problemsOf(raw).join()).toContain('actions.0.risk');
  });

  it('requires a main menu, known references and no reserved menu ids', () => {
    const raw = clone();
    raw.menus[0].id = 'home';
    raw.menus[1].items.push({ action: 'ghost' }, { menu: 'nowhere' });
    raw.menus.push({ id: 'settings', title: 'main.title', items: [] });
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('a menu with id "main" is required');
    expect(p).toContain('unknown action ghost');
    expect(p).toContain('unknown menu nowhere');
    expect(p).toContain('reserved menu id: settings');
  });

  it('flags duplicate ids and commands', () => {
    const raw = clone();
    raw.actions[1].id = 'status.show';
    raw.actions[3].command = 'purge';
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('duplicate action id: status.show');
    expect(p).toContain('duplicate command: purge');
  });

  it('needs a confirm phrase on danger, args on enum items and none elsewhere', () => {
    const raw = clone();
    delete raw.actions[4].confirmPhrase;
    raw.menus[1].items[1] = { action: 'jobs.mode' };
    raw.menus[1].items[0] = { action: 'jobs.list', args: ['x'] };
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('danger action jobs.purge needs confirmPhrase');
    expect(p).toContain('enum action jobs.mode needs args');
    expect(p).toContain('args given for non-enum action jobs.list');
  });

  it('rejects an action that no menu shows and no command reaches', () => {
    const raw = clone();
    raw.actions.push({ id: 'lost', label: 'jobs.list', risk: 'read' });
    expect(problemsOf(raw).join()).toContain('action lost is on no menu and has no command');
  });

  it('refuses secret-looking setting paths, including project patterns', () => {
    const raw = clone();
    raw.settings.fields.push({ id: 'k', path: 'apiKeys.helius', category: 'gen', label: 'set.limit', kind: 'int', apply: 'live' });
    raw.settings.fields.push({ id: 'w', path: 'wallet.seed', category: 'gen', label: 'set.limit', kind: 'int', apply: 'live' });
    raw.settings.excluded = ['*.seed'];
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('setting k: path apiKeys.helius looks secret');
    expect(p).toContain('setting w: path wallet.seed looks secret');
  });

  it('refuses every common way of naming a secret', () => {
    const paths = ['wallet.private_key', 'helius.key', 'birdeye.api-key', 'signer.keypair', 'wallet.mnemonic', 'wallet.seed', 'db.pass', 'auth.credentials', 'gpg.passphrase', 'ssh.pwd'];
    const raw = clone();
    paths.forEach((path, i) => raw.settings.fields.push({ id: `s${i}`, path, category: 'gen', label: 'set.limit', kind: 'int', apply: 'live' }));
    const p = problemsOf(raw).join('\n');
    for (const path of paths) expect(p).toContain(`path ${path} looks secret`);
  });

  it('checks setting categories and enum options', () => {
    const raw = clone();
    raw.settings.fields[0].category = 'nope';
    delete raw.settings.fields[1].options;
    const p = problemsOf(raw).join('\n');
    expect(p).toContain('setting jobs.enabled: unknown category nope');
    expect(p).toContain('setting jobs.level: enum needs options');
  });

  it('lists every text key the messages file lacks', () => {
    const { ['status.jobs.queue']: _q, ['jobs.add.ask']: _a, ...partial } = sampleMessages;
    const p = problemsOf(clone(), { ...CORE_MESSAGES.ko, ...partial }).join('\n');
    expect(p).toContain('missing text: status.jobs.queue');
    expect(p).toContain('missing text: jobs.add.ask');
  });
});
