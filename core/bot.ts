import { Bot } from 'grammy';
import { Alerts, type EngineLog } from './alerts.js';
import { createEngine, type Engine, type EngineOptions, type Outgoing } from './engine.js';
import { splitMessage } from './text.js';

type MessageExtra = { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } };

/** The slice of grammY's Api the engine uses — small enough to fake in tests. */
export interface TelegramApiLike {
  sendMessage(chatId: number, text: string, other?: MessageExtra): Promise<unknown>;
  editMessageText(chatId: number, messageId: number, text: string, other?: MessageExtra): Promise<unknown>;
  setMyCommands(commands: Array<{ command: string; description: string }>): Promise<unknown>;
}

interface TextCtx {
  chat: { id: number };
  from?: { id: number };
  message: { text: string };
}
interface CallbackCtx {
  chat?: { id: number };
  from: { id: number };
  callbackQuery: { data: string; message?: { message_id: number } };
  answerCallbackQuery(): Promise<unknown>;
}
export interface BotLike {
  api: TelegramApiLike;
  on(filter: 'message:text', handler: (ctx: TextCtx) => Promise<void>): void;
  on(filter: 'callback_query:data', handler: (ctx: CallbackCtx) => Promise<void>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  catch(handler: (err: unknown) => void): void;
}

type TgErrorShape = { error_code?: number; description?: string; parameters?: { retry_after?: number } };
const asTgError = (err: unknown): TgErrorShape => (typeof err === 'object' && err !== null ? (err as TgErrorShape) : {});

export function retryAfterSeconds(err: unknown): number | null {
  const e = asTgError(err);
  return e.error_code === 429 ? (e.parameters?.retry_after ?? 1) : null;
}

export function isNotModified(err: unknown): boolean {
  return /message is not modified/i.test(asTgError(err).description ?? '');
}

/** Longest 429 wait worth sitting through; past this the reply is dropped and logged. */
export const MAX_RETRY_WAIT_S = 5;

const realSleep =(ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry(fn: () => Promise<unknown>, sleep: (ms: number) => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      // Re-sending the same menu text is not an error worth surfacing.
      if (isNotModified(err)) return;
      const wait = retryAfterSeconds(err);
      // grammY handles updates in order, so a long wait here would hold every later tap, Cancel included.
      if (wait === null || wait > MAX_RETRY_WAIT_S || attempt >= 3) throw err;
      await sleep(wait * 1000);
    }
  }
}

const markup = (o: Outgoing): MessageExtra | undefined =>
  o.buttons?.length
    ? { reply_markup: { inline_keyboard: o.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } }
    : undefined;

/** Long replies are split; the buttons ride on the last part. The first reply to a tap edits the tapped message. */
export async function deliver(
  api: TelegramApiLike,
  chatId: number,
  outs: Outgoing[],
  opts: { editMessageId?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const sleep = opts.sleep ?? realSleep;
  for (const [i, out] of outs.entries()) {
    const parts = splitMessage(out.text);
    for (const [j, part] of parts.entries()) {
      const extra = j === parts.length - 1 ? markup(out) : undefined;
      if (i === 0 && parts.length === 1 && opts.editMessageId !== undefined) {
        const messageId = opts.editMessageId;
        try {
          await withRetry(() => api.editMessageText(chatId, messageId, part, extra), sleep);
        } catch {
          // The tapped message is gone or too old to edit: say it in a new one instead of not at all.
          await withRetry(() => api.sendMessage(chatId, part, extra), sleep);
        }
      } else {
        await withRetry(() => api.sendMessage(chatId, part, extra), sleep);
      }
    }
  }
}

export interface StartOptions extends Omit<EngineOptions, 'ownerChatId' | 'onPause'> {
  token: string | undefined;
  ownerChatId: number | string | undefined;
  createBot?: (token: string) => BotLike;
}

export interface TelegramHandle {
  engine: Engine;
  alerts: Alerts;
  stop(): Promise<void>;
}

const consoleLog: EngineLog = {
  warn: (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

/**
 * The bot is an extra on the app: a missing token, a bad manifest or a bot that
 * cannot connect leaves the app running and says why in the log.
 */
export async function startTelegram(o: StartOptions): Promise<TelegramHandle | null> {
  const log = o.log ?? consoleLog;
  if (!o.token) {
    log.warn({}, 'telegram off: no bot token');
    return null;
  }
  const owner = Number(o.ownerChatId);
  if (!Number.isFinite(owner) || owner === 0) {
    log.warn({}, 'telegram off: no owner chat id');
    return null;
  }

  if (owner < 0) {
    // Commands are checked against the sender, and no person has a group's id.
    log.warn({ owner }, 'telegram: the owner id is a group; alerts go there but no one can run commands — use your own user id');
  }

  let alerts: Alerts | undefined;
  let engine: Engine;
  try {
    engine = createEngine({ ...o, ownerChatId: owner, log, onPause: (paused) => (paused ? alerts?.pause() : alerts?.resume()) });
  } catch (err) {
    log.error({ err: String(err) }, 'telegram off: the manifest or its bindings are invalid');
    return null;
  }

  // grammY's Bot is a superset of BotLike; the cast is the adapter boundary.
  const bot = o.createBot ? o.createBot(o.token) : (new Bot(o.token) as unknown as BotLike);
  alerts = new Alerts({ manifest: engine.manifest, t: engine.t, log, send: (text) => deliver(bot.api, owner, [{ text }]) });

  bot.on('message:text', async (ctx) => {
    // No sender (a channel post) counts as nobody: 0 never matches an owner.
    const outs = await engine.handle({ chatId: ctx.chat.id, userId: ctx.from?.id ?? 0, text: ctx.message.text });
    await deliver(bot.api, ctx.chat.id, outs);
  });
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const outs = await engine.handle({ chatId, userId: ctx.from.id, callback: ctx.callbackQuery.data });
    await deliver(bot.api, chatId, outs, { editMessageId: ctx.callbackQuery.message?.message_id });
  });
  bot.catch((err) => log.error({ err: String(err) }, 'telegram update failed'));
  bot.api.setMyCommands(engine.commands()).catch((err: unknown) => log.warn({ err: String(err) }, 'telegram commands not registered'));
  bot.start().catch((err: unknown) => log.error({ err: String(err) }, 'telegram bot stopped'));

  return { engine, alerts, stop: () => bot.stop() };
}
