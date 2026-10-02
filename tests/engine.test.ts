import { describe, expect, it, vi } from 'vitest';
import { createEngine, type ActionHandler, type Outgoing } from '../skills/telegram-port/core/engine.js';
import { ManifestError } from '../skills/telegram-port/core/manifest.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

const OWNER = 42;
const raw = () => JSON.parse(JSON.stringify(sampleManifest));

function setup(over: Partial<Record<string, ActionHandler>> = {}) {
  const calls: Array<[string, string | undefined]> = [];
  const handler = (id: string): ActionHandler => async (arg) => {
    calls.push([id, arg]);
    return `${id} ok`;
  };
  const actions: Record<string, ActionHandler> = {
    'status.show': handler('status.show'),
    'jobs.list': handler('jobs.list'),
    'jobs.mode': handler('jobs.mode'),
    'jobs.add': handler('jobs.add'),
    'jobs.purge': handler('jobs.purge'),
    ...over,
  };
  const store: Record<string, unknown> = { 'jobs.enabled': true, 'jobs.level': 'low', 'jobs.share': 0.1, 'jobs.limit': 5 };
  const log = { warn: vi.fn(), error: vi.fn() };
  const onAudit = vi.fn();
  const onPause = vi.fn();
  let now = 0;
  const engine = createEngine({
    manifest: raw(),
    actions,
    status: { 'jobs.today': () => 7, 'jobs.queue': () => 2 },
    messages: sampleMessages,
    ownerChatId: OWNER,
    config: { get: (p) => store[p], set: (p, v) => void (store[p] = v) },
    onAudit,
    onPause,
    log,
    now: () => now,
  });
  const say = (text: string) => engine.handle({ chatId: OWNER, text });
  const tap = (data: string) => engine.handle({ chatId: OWNER, callback: data });
  const button = (out: Outgoing | undefined, label: string) => {
    const b = out?.buttons?.flat().find((x) => x.text.includes(label));
    if (!b) throw new Error(`no "${label}" in ${JSON.stringify(out)}`);
    return b.data;
  };
  return { engine, calls, store, log, onAudit, onPause, say, tap, button, advance: (ms: number) => (now += ms) };
}

const open = async (s: ReturnType<typeof setup>, menuLabel: string) => (await s.tap(s.button((await s.say('/start'))[0], menuLabel)))[0];

describe('createEngine', () => {
  it('refuses a missing handler, a missing status function, or settings without a config adapter', () => {
    const base = { manifest: raw(), messages: sampleMessages, ownerChatId: 1, status: { 'jobs.today': () => 1, 'jobs.queue': () => 1 }, config: { get: () => 1, set: () => undefined } };
    const all = { 'status.show': () => 'x', 'jobs.list': () => 'x', 'jobs.mode': () => 'x', 'jobs.add': () => 'x', 'jobs.purge': () => 'x' };
    const { ['jobs.purge']: _p, ...missing } = all;
    expect(() => createEngine({ ...base, actions: missing })).toThrow(/no handler for action jobs.purge/);
    expect(() => createEngine({ ...base, actions: all, status: { 'jobs.today': () => 1 } })).toThrow(/no status function for jobs.queue/);
    const { config: _c, ...noConfig } = base;
    expect(() => createEngine({ ...noConfig, actions: all })).toThrow(ManifestError);
  });
});

describe('Engine.handle', () => {
  it('ignores everyone but the owner, buttons included', async () => {
    const s = setup();
    const data = s.button((await s.say('/start'))[0], '지금 상태');
    expect(await s.engine.handle({ chatId: 7, text: '/start' })).toEqual([]);
    expect(await s.engine.handle({ chatId: 7, callback: data })).toEqual([]);
    expect(s.calls).toEqual([]);
    expect(s.log.warn).toHaveBeenCalled();
  });

  it('opens the main menu with its items and reserved menus', async () => {
    const s = setup();
    const main = (await s.say('/start'))[0]!;
    expect(main.text).toBe('메인');
    expect(main.buttons!.flat().map((b) => b.text)).toEqual(['지금 상태', '작업', '⚙️ 설정', '📊 상태']);
  });

  it('runs a read action at once, by button and by command, and shows its reply', async () => {
    const s = setup();
    const out = await s.tap(s.button((await s.say('/start'))[0], '지금 상태'));
    expect(out[0]!.text).toBe('status.show ok');
    expect((await s.say('/jobs'))[0]!.text).toBe('jobs.list ok');
    expect(s.calls).toEqual([['status.show', undefined], ['jobs.list', undefined]]);
  });

  it('confirms a write action before running it, and cancel runs nothing', async () => {
    const s = setup();
    const jobs = await open(s, '작업');
    const ask = (await s.tap(s.button(jobs, '모드 · fast')))[0]!;
    expect(ask.text).toContain('모드 (fast) — 실행할까요?');
    expect(s.calls).toEqual([]);
    await s.tap(s.button(ask, '취소'));
    expect(s.calls).toEqual([]);
    const again = (await s.tap(s.button(jobs, '모드 · fast')))[0]!;
    await s.tap(s.button(again, '실행'));
    expect(s.calls).toEqual([['jobs.mode', 'fast']]);
  });

  it('runs a danger action only on the exact phrase, and audits it', async () => {
    const s = setup();
    const ask = (await s.say('/purge'))[0]!;
    expect(ask.text).toContain('PURGE');
    expect((await s.say('purge'))[0]!.text).toContain('실행하지 않았습니다');
    expect(s.calls).toEqual([]);
    await s.say('/purge');
    await s.say(' PURGE ');
    expect(s.calls).toEqual([['jobs.purge', undefined]]);
    expect(s.onAudit).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'jobs.purge', outcome: 'ok', chatId: OWNER }));
  });

  it('will not run a danger action from a confirm button', async () => {
    const s = setup();
    const forged = s.engine.decode('3|c:jobs.purge');
    expect(forged.ok).toBe(true);
    const out = await s.tap('3|c:jobs.purge');
    expect(out[0]!.text).toContain('메뉴가 바뀌었습니다');
    expect(s.calls).toEqual([]);
  });

  it('runs a write confirm once, with the argument it showed, and refuses a forged or expired one', async () => {
    const s = setup();
    const jobs = await open(s, '작업');
    const yes = s.button((await s.tap(s.button(jobs, '모드 · fast')))[0], '실행');
    await s.tap(yes);
    await s.tap(yes);
    expect(s.calls).toEqual([['jobs.mode', 'fast']]);
    expect((await s.tap('3|c:jobs.mode:evil'))[0]!.text).toContain('메뉴가 바뀌었습니다');
    const late = s.button((await s.tap(s.button(jobs, '모드 · off')))[0], '실행');
    s.advance(5 * 60_000 + 1);
    await s.tap(late);
    expect(s.calls).toEqual([['jobs.mode', 'fast']]);
  });

  it('ignores a member of the owner chat who is not the owner', async () => {
    const s = setup();
    expect(await s.engine.handle({ chatId: OWNER, userId: 99, text: '/jobs' })).toEqual([]);
    expect((await s.engine.handle({ chatId: OWNER, userId: OWNER, text: '/jobs' }))[0]!.text).toBe('jobs.list ok');
    expect(s.calls).toEqual([['jobs.list', undefined]]);
  });

  it('asks for a number argument, re-asks on junk, then confirms the write', async () => {
    const s = setup();
    expect((await s.say('/add'))[0]!.text).toBe('몇 개를 추가할까요?');
    expect((await s.say('many'))[0]!.text).toBe('숫자를 입력하세요.');
    const ask = (await s.say('3'))[0]!;
    expect(ask.text).toContain('작업 추가 (3) — 실행할까요?');
    await s.tap(s.button(ask, '실행'));
    expect(s.calls).toEqual([['jobs.add', '3']]);
  });

  it('takes a command argument inline', async () => {
    const s = setup();
    const ask = (await s.say('/add 4'))[0]!;
    await s.tap(s.button(ask, '실행'));
    expect(s.calls).toEqual([['jobs.add', '4']]);
  });

  it('drops a pending input on a new command, and on timeout', async () => {
    const s = setup();
    await s.say('/add');
    expect((await s.say('/jobs'))[0]!.text).toBe('jobs.list ok');
    expect((await s.say('5'))[0]!.text).toBe('메인');
    await s.say('/add');
    s.advance(5 * 60_000 + 1);
    expect((await s.say('5'))[0]!.text).toContain('입력 시간이 지났습니다');
    expect(s.calls).toEqual([['jobs.list', undefined]]);
  });

  it('drops a pending input when the user taps into settings', async () => {
    const s = setup();
    const settings = await open(s, '⚙️ 설정');
    await s.say('/add');
    await s.tap(s.button(settings, '일반'));
    expect((await s.say('5'))[0]!.text).toBe('메인');
    expect(s.calls).toEqual([]);
  });

  it('shows only an error code when a handler throws', async () => {
    const s = setup({ 'jobs.list': async () => { throw new Error('token=abc123 leaked'); } });
    const out = (await s.say('/jobs'))[0]!;
    expect(out.text).toMatch(/^실패했습니다 \(오류 [0-9A-Z]{6}\)\.$/);
    expect(out.text).not.toContain('abc123');
    expect(s.log.error).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'jobs.list' }), expect.any(String));
  });

  it('answers a stale button with the stale notice and a way back', async () => {
    const s = setup();
    const out = (await s.tap('2|a:jobs.list'))[0]!;
    expect(out.text).toContain('메뉴가 바뀌었습니다');
    expect(out.buttons!.flat()[0]!.data).toBe('3|m:main');
    expect(s.calls).toEqual([]);
  });

  it('shows the status screen and routes settings', async () => {
    const s = setup();
    expect((await open(s, '📊 상태'))!.text).toBe('📊 상태\n오늘 작업: 7\n대기열: 2');
    expect((await s.say('/status'))[0]!.text).toContain('오늘 작업: 7');
    const settings = await open(s, '⚙️ 설정');
    expect(settings!.text).toBe('⚙️ 설정');
  });

  it('pauses and resumes alerts by command', async () => {
    const s = setup();
    expect((await s.say('/pause'))[0]!.text).toContain('알림을 멈췄습니다');
    expect((await s.say('/resume'))[0]!.text).toContain('다시 켰습니다');
    expect(s.onPause.mock.calls).toEqual([[true], [false]]);
  });

  it('lists the bot commands with their labels', () => {
    const s = setup();
    expect(s.engine.commands()).toEqual([
      { command: 'start', description: '메인 메뉴' },
      { command: 'now', description: '지금 상태' },
      { command: 'jobs', description: '작업 목록' },
      { command: 'add', description: '작업 추가' },
      { command: 'purge', description: '전체 삭제' },
      { command: 'settings', description: '⚙️ 설정' },
      { command: 'status', description: '📊 상태' },
      { command: 'pause', description: '알림 멈추기' },
      { command: 'resume', description: '알림 다시 켜기' },
    ]);
  });
});
