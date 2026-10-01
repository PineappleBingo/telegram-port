import { describe, expect, it, vi } from 'vitest';
import { deliver, isNotModified, retryAfterSeconds, startTelegram, type BotLike, type TelegramApiLike } from '../core/bot.js';
import { sampleManifest, sampleMessages } from './fixtures.js';

const api = (): TelegramApiLike & { sendMessage: ReturnType<typeof vi.fn>; editMessageText: ReturnType<typeof vi.fn> } => ({
  sendMessage: vi.fn(async () => ({})),
  editMessageText: vi.fn(async () => ({})),
  setMyCommands: vi.fn(async () => true),
});
const tgError = (code: number, description: string, retry_after?: number) =>
  Object.assign(new Error(description), { error_code: code, description, parameters: retry_after ? { retry_after } : {} });

describe('error helpers', () => {
  it('reads retry_after from a 429 and spots "not modified"', () => {
    expect(retryAfterSeconds(tgError(429, 'Too Many Requests', 3))).toBe(3);
    expect(retryAfterSeconds(tgError(400, 'Bad Request'))).toBeNull();
    expect(isNotModified(tgError(400, 'Bad Request: message is not modified'))).toBe(true);
  });
});

describe('deliver', () => {
  it('splits long text and puts the buttons on the last part', async () => {
    const a = api();
    await deliver(a, 1, [{ text: `${'a'.repeat(4000)}\n${'b'.repeat(200)}`, buttons: [[{ text: 'ok', data: '1|m:main' }]] }]);
    expect(a.sendMessage).toHaveBeenCalledTimes(2);
    expect(a.sendMessage.mock.calls[0]![2]).toBeUndefined();
    expect(a.sendMessage.mock.calls[1]![2]).toEqual({ reply_markup: { inline_keyboard: [[{ text: 'ok', callback_data: '1|m:main' }]] } });
  });

  it('edits the pressed message for the first reply, and ignores "not modified"', async () => {
    const a = api();
    a.editMessageText.mockRejectedValueOnce(tgError(400, 'Bad Request: message is not modified'));
    await deliver(a, 1, [{ text: 'menu' }, { text: 'more' }], { editMessageId: 9 });
    expect(a.editMessageText).toHaveBeenCalledWith(1, 9, 'menu', undefined);
    expect(a.sendMessage).toHaveBeenCalledWith(1, 'more', undefined);
  });

  it('waits out a 429 and gives up after three tries', async () => {
    const a = api();
    const sleep = vi.fn(async () => undefined);
    a.sendMessage.mockRejectedValueOnce(tgError(429, 'Too Many Requests', 2)).mockResolvedValueOnce({});
    await deliver(a, 1, [{ text: 'hi' }], { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
    a.sendMessage.mockRejectedValue(tgError(429, 'Too Many Requests', 1));
    await expect(deliver(a, 1, [{ text: 'hi' }], { sleep })).rejects.toThrow('Too Many Requests');
  });
});

describe('startTelegram', () => {
  const base = { manifest: JSON.parse(JSON.stringify(sampleManifest)), messages: sampleMessages, status: { 'jobs.today': () => 1, 'jobs.queue': () => 1 }, config: { get: () => 1, set: () => undefined } };
  const handlers = { 'status.show': () => 'x', 'jobs.list': () => 'x', 'jobs.mode': () => 'x', 'jobs.add': () => 'x', 'jobs.purge': () => 'x' };

  function fakeBot(start: () => Promise<void>) {
    const a = api();
    const on = vi.fn();
    const bot: BotLike = { api: a, on, start, stop: vi.fn(async () => undefined), catch: vi.fn() };
    return { bot, a, on };
  }

  it('stays off without a token or an owner, saying why', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    expect(await startTelegram({ ...base, actions: handlers, token: undefined, ownerChatId: 1, log })).toBeNull();
    expect(await startTelegram({ ...base, actions: handlers, token: 't', ownerChatId: '', log })).toBeNull();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('takes commands only from the owner person, and warns when the owner id is a group', async () => {
    const { bot, a, on } = fakeBot(() => new Promise(() => undefined));
    await startTelegram({ ...base, actions: handlers, token: 't', ownerChatId: 5, createBot: () => bot });
    const onText = on.mock.calls.find((c) => c[0] === 'message:text')![1];
    await onText({ chat: { id: 5 }, from: { id: 6 }, message: { text: '/start' } });
    expect(a.sendMessage).not.toHaveBeenCalled();
    const log = { warn: vi.fn(), error: vi.fn() };
    const group = fakeBot(() => new Promise(() => undefined));
    await startTelegram({ ...base, actions: handlers, token: 't', ownerChatId: -100123, log, createBot: () => group.bot });
    expect(log.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('group'));
  });

  it('stays off on an invalid manifest without throwing', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const { ['jobs.purge']: _p, ...missing } = handlers;
    expect(await startTelegram({ ...base, actions: missing, token: 't', ownerChatId: 1, log })).toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.stringContaining('jobs.purge') }), expect.any(String));
  });

  it('keeps the app running when the bot fails to start', async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const { bot, a } = fakeBot(() => Promise.reject(new Error('401 Unauthorized')));
    const handle = await startTelegram({ ...base, actions: handlers, token: 'bad', ownerChatId: '1', log, createBot: () => bot });
    expect(handle).not.toBeNull();
    await new Promise((r) => setImmediate(r));
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.stringContaining('401') }), 'telegram bot stopped');
    expect(a.setMyCommands).toHaveBeenCalled();
  });

  it('wires messages and buttons to the engine and sends alerts to the owner', async () => {
    const { bot, a, on } = fakeBot(() => new Promise(() => undefined));
    const handle = await startTelegram({ ...base, actions: handlers, token: 't', ownerChatId: 5, createBot: () => bot });
    const onText = on.mock.calls.find((c) => c[0] === 'message:text')![1];
    await onText({ chat: { id: 5 }, from: { id: 5 }, message: { text: '/start' } });
    expect(a.sendMessage.mock.calls[0]![1]).toBe('메인');
    expect(await handle!.alerts.send('job.done', { name: 'A' })).toBe(true);
    expect(a.sendMessage).toHaveBeenLastCalledWith(5, '작업 A 완료', undefined);
    const onCb = on.mock.calls.find((c) => c[0] === 'callback_query:data')![1];
    const answer = vi.fn(async () => true);
    await onCb({ chat: { id: 5 }, from: { id: 5 }, callbackQuery: { data: '3|m:jobs', message: { message_id: 11 } }, answerCallbackQuery: answer });
    expect(answer).toHaveBeenCalled();
    expect(a.editMessageText).toHaveBeenCalledWith(5, 11, '작업', expect.anything());
  });
});
