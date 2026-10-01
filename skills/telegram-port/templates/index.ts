import { startTelegram, type AlertId, type AuditEvent, type EngineLog, type TelegramHandle } from './core/index.js';
import { configAdapter } from './configAdapter.js';
import { actions, status } from './handlers.js';
import { manifest } from './manifest.gen.js';
import { messages } from './messages.__LANG__.js';

let handle: TelegramHandle | null = null;

/** The one line the app's start code calls. Never throws: without a token or owner the bot stays off. */
export async function startBot(log?: EngineLog, onAudit?: (e: AuditEvent) => void): Promise<void> {
  handle = await startTelegram({
    token: process.env.TELEGRAM_BOT_TOKEN,
    ownerChatId: process.env[manifest.owner.env],
    manifest,
    actions,
    status,
    messages,
    config: configAdapter,
    log,
    onAudit,
  });
}

/** Fire-and-forget: false when the bot is off, alerts are paused, or Telegram refused it. */
export function sendAlert(id: AlertId<typeof manifest>, vars?: Record<string, string | number>): Promise<boolean> {
  return handle ? handle.alerts.send(id, vars) : Promise.resolve(false);
}

export async function stopBot(): Promise<void> {
  await handle?.stop();
  handle = null;
}
