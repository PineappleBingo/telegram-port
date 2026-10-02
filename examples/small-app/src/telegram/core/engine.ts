import { randomBytes } from 'node:crypto';
import { CallbackCodec, type DecodeResult } from './callback.js';
import { guardDecision, phraseMatches } from './guard.js';
import {
  ManifestError, validateManifest, type ActionId, type ActionSpec, type Manifest, type ManifestLike, type StatusField,
} from './manifest.js';
import { CORE_MESSAGES } from './messages.core.js';
import { INPUT_TTL_MS, PendingInputs } from './pending.js';
import { SettingsUi, type Button, type ConfigAdapter, type Outgoing } from './settings.js';
import { renderStatus, type StatusFn } from './status.js';
import type { EngineLog } from './alerts.js';
import { errorCode, makeT, type Messages, type Translate } from './text.js';

export type { Button, ConfigAdapter, EngineLog, Outgoing, StatusFn };

export interface Incoming {
  chatId: number;
  /** The person who sent it; when given, it must be the owner (a group chat id would admit every member). */
  userId?: number;
  text?: string;
  callback?: string;
}
export type ActionResult = string | void;
export type ActionHandler = (arg: string | undefined, ctx: { chatId: number }) => Promise<ActionResult> | ActionResult;
export interface AuditEvent {
  at: number;
  chatId: number;
  actionId: string;
  arg?: string;
  outcome: 'ok' | 'failed';
}

/** What a project writes: one handler per action and one function per status field, checked by the compiler. */
export interface Bindings<M extends ManifestLike> {
  actions: { [K in ActionId<M>]: ActionHandler };
  status?: { [K in StatusField<M>]: StatusFn };
}

export interface EngineOptions {
  manifest: unknown;
  actions: Readonly<Record<string, ActionHandler>>;
  status?: Readonly<Record<string, StatusFn>>;
  messages: Messages;
  ownerChatId: number;
  config?: ConfigAdapter;
  onAudit?: (e: AuditEvent) => void;
  onPause?: (paused: boolean) => void;
  log?: EngineLog;
  now?: () => number;
  inputTtlMs?: number;
}

export interface Engine {
  readonly manifest: Manifest;
  readonly t: Translate;
  handle(input: Incoming): Promise<Outgoing[]>;
  decode(data: string): DecodeResult;
  commands(): Array<{ command: string; description: string }>;
}

const silent: EngineLog = { warn: () => undefined, error: () => undefined };

export function createEngine(o: EngineOptions): Engine {
  const language = (o.manifest as { language?: unknown } | null)?.language === 'ko' ? 'ko' : 'en';
  const core = CORE_MESSAGES[language];
  const m = validateManifest(o.manifest, { ...core, ...o.messages });
  const problems = [
    ...m.actions.filter((a) => typeof o.actions[a.id] !== 'function').map((a) => `no handler for action ${a.id}`),
    ...(m.status?.fields ?? []).filter((f) => typeof o.status?.[f] !== 'function').map((f) => `no status function for ${f}`),
    ...(m.settings && !o.config ? ['settings need a config adapter'] : []),
  ];
  if (problems.length) throw new ManifestError(problems);

  const t = makeT(o.messages, core);
  const log = o.log ?? silent;
  const now = o.now ?? Date.now;
  const codec = new CallbackCodec(m.manifestRev);
  const inputTtlMs = o.inputTtlMs ?? INPUT_TTL_MS;
  const pending = new PendingInputs(inputTtlMs, now);
  const confirms = new Map<number, { nonce: string; actionId: string; arg: string | undefined; at: number }>();
  const actions = new Map(m.actions.map((a) => [a.id, a]));
  const menus = new Map(m.menus.map((x) => [x.id, x]));
  const byCommand = new Map(m.actions.flatMap((a) => (a.command ? [[a.command, a] as const] : [])));
  // Enum values an action may take: only those its menu items offer.
  const allowedArgs = new Map<string, Set<string>>();
  for (const menu of m.menus) {
    for (const item of menu.items) {
      if ('action' in item && item.args) {
        const set = allowedArgs.get(item.action) ?? new Set<string>();
        for (const a of item.args) set.add(a);
        allowedArgs.set(item.action, set);
      }
    }
  }

  const failure = (err: unknown, context: object): string => {
    const code = errorCode(now);
    log.error({ code, err: String(err), ...context }, 'telegram action failed');
    return t('core.failed', { code });
  };
  const settings = m.settings && o.config
    ? new SettingsUi(m.settings, o.config, t, codec, pending, (err) => failure(err, { where: 'settings' }))
    : null;

  const backRow = (): Button[] => [{ text: t('core.back'), data: codec.encode('m', 'main') }];
  const cancelRow = (): Button[] => [{ text: t('core.cancel'), data: codec.encode('x', 'cancel') }];
  const stale = (): Outgoing[] => [{ text: t('core.stale'), buttons: [[{ text: t(menus.get('main')?.title ?? 'core.cmd.start'), data: codec.encode('m', 'main') }]] }];
  const statusTitle = () => t(m.status?.title ?? 'core.status.title');
  const menuLabel = (id: string) =>
    id === 'settings' ? t('core.settings.title') : id === 'status' ? statusTitle() : t(menus.get(id)?.title ?? id);
  const actionTitle = (a: ActionSpec, arg?: string) => (arg === undefined ? t(a.label) : `${t(a.label)} (${arg})`);
  const argLabel = (a: ActionSpec, arg: string) => (t.has(`${a.label}.${arg}`) ? t(`${a.label}.${arg}`) : `${t(a.label)} · ${arg}`);

  async function statusScreen(): Promise<Outgoing> {
    const text = await renderStatus(statusTitle(), m.status?.fields ?? [], o.status ?? {}, t, (field, err) =>
      log.warn({ field, err: String(err) }, 'telegram status field failed'),
    );
    return { text, buttons: [backRow()] };
  }

  async function renderMenu(id: string): Promise<Outgoing[]> {
    if (id === 'settings' && settings) return [settings.home()];
    if (id === 'status' && m.status) return [await statusScreen()];
    const menu = menus.get(id);
    if (!menu) return stale();
    const rows: Button[][] = menu.items.map((item) => {
      if ('menu' in item) return [{ text: menuLabel(item.menu), data: codec.encode('m', item.menu) }];
      const a = actions.get(item.action) as ActionSpec;
      if (item.args?.length) return item.args.map((arg) => ({ text: argLabel(a, arg), data: codec.encode('a', a.id, arg) }));
      return [{ text: t(a.label), data: codec.encode('a', a.id) }];
    });
    if (id !== 'main') rows.push(backRow());
    return [{ text: t(menu.title), buttons: rows }];
  }

  async function run(a: ActionSpec, arg: string | undefined, chatId: number): Promise<Outgoing[]> {
    const audit = (outcome: AuditEvent['outcome']) => {
      if (a.risk !== 'danger') return;
      try {
        o.onAudit?.({ at: now(), chatId, actionId: a.id, arg, outcome });
      } catch (err) {
        log.warn({ err: String(err) }, 'telegram audit hook failed');
      }
    };
    try {
      const reply = await (o.actions[a.id] as ActionHandler)(arg, { chatId });
      audit('ok');
      return [{ text: typeof reply === 'string' && reply.length > 0 ? reply : t('core.done'), buttons: [backRow()] }];
    } catch (err) {
      audit('failed');
      return [{ text: failure(err, { actionId: a.id }), buttons: [backRow()] }];
    }
  }

  async function start(a: ActionSpec, arg: string | undefined, chatId: number): Promise<Outgoing[]> {
    if (a.arg?.kind === 'enum') {
      const allowed = allowedArgs.get(a.id) ?? new Set<string>();
      if (arg === undefined || !allowed.has(arg)) {
        return [{
          text: t('core.choose', { action: t(a.label) }),
          buttons: [...[...allowed].map((v) => [{ text: argLabel(a, v), data: codec.encode('a', a.id, v) }]), backRow()],
        }];
      }
    } else if (a.arg && arg === undefined) {
      pending.set(chatId, { kind: 'arg', actionId: a.id });
      return [{ text: t(a.arg.prompt ?? 'core.input.ask'), buttons: [cancelRow()] }];
    }
    if (a.arg?.kind === 'number' && !Number.isFinite(Number(arg))) {
      pending.set(chatId, { kind: 'arg', actionId: a.id });
      return [{ text: t('core.input.number'), buttons: [cancelRow()] }];
    }
    const decision = guardDecision(a);
    if (decision === 'run') return run(a, arg, chatId);
    if (decision === 'confirm') {
      // The button carries a one-shot nonce, not the argument: a double tap, an old confirm
      // or forged data cannot run the action again or with a value no menu offered.
      const nonce = randomBytes(6).toString('base64url');
      confirms.set(chatId, { nonce, actionId: a.id, arg, at: now() });
      return [{
        text: t('core.confirm.ask', { action: actionTitle(a, arg) }),
        buttons: [[{ text: t('core.confirm.yes'), data: codec.encode('c', a.id, nonce) }], cancelRow()],
      }];
    }
    pending.set(chatId, { kind: 'danger', actionId: a.id, arg });
    return [{ text: t('core.danger.ask', { action: actionTitle(a, arg), phrase: a.confirmPhrase ?? '' }), buttons: [cancelRow()] }];
  }

  async function onCallback(chatId: number, data: string): Promise<Outgoing[]> {
    const decoded = codec.decode(data);
    if (!decoded.ok) return stale();
    const { kind, id, arg } = decoded.value;
    // Any tap abandons a pending input; a settings "enter value" tap sets its own right after.
    pending.cancel(chatId);
    if (kind === 'm') return renderMenu(id);
    if (kind === 'x') return [{ text: t('core.cancelled'), buttons: [backRow()] }];
    if (kind === 's') return settings ? settings.onCallback(chatId, id, arg) : stale();
    const a = actions.get(id);
    if (!a) return stale();
    // A confirm button only ever runs a write action: danger needs the typed phrase, whatever the button says.
    if (kind === 'c') {
      const c = confirms.get(chatId);
      if (a.risk !== 'write' || !c || c.nonce !== arg || c.actionId !== a.id) return stale();
      confirms.delete(chatId);
      if (now() - c.at > inputTtlMs) return [{ text: t('core.input.expired'), buttons: [backRow()] }];
      return run(a, c.arg, chatId);
    }
    return start(a, arg, chatId);
  }

  async function onCommand(chatId: number, text: string): Promise<Outgoing[]> {
    const [head = '', ...rest] = text.slice(1).split(/\s+/);
    const command = (head.split('@')[0] ?? '').toLowerCase();
    const arg = rest.join(' ').trim() || undefined;
    const a = byCommand.get(command);
    if (a) return start(a, arg, chatId);
    if (command === 'settings' && settings) return [settings.home()];
    if (command === 'status' && m.status) return [await statusScreen()];
    if ((command === 'pause' || command === 'resume') && m.alerts.length > 0) {
      o.onPause?.(command === 'pause');
      return [{ text: t(command === 'pause' ? 'core.alerts.paused' : 'core.alerts.resumed') }];
    }
    return renderMenu('main');
  }

  async function onText(chatId: number, text: string): Promise<Outgoing[]> {
    const taken = pending.take(chatId);
    if (taken === null) return renderMenu('main');
    if ('expired' in taken) return [{ text: t('core.input.expired'), buttons: [backRow()] }];
    const p = taken.pending;
    if (p.kind === 'setting') return settings ? settings.onInput(chatId, p.fieldId, text) : stale();
    const a = actions.get(p.actionId);
    if (!a) return stale();
    if (p.kind === 'arg') return start(a, text, chatId);
    if (!phraseMatches(a.confirmPhrase ?? '', text)) return [{ text: t('core.danger.wrong'), buttons: [backRow()] }];
    return run(a, p.arg, chatId);
  }

  return {
    manifest: m,
    t,
    decode: (data) => codec.decode(data),
    async handle(input) {
      if ((input.userId ?? input.chatId) !== o.ownerChatId) {
        log.warn({ chatId: input.chatId, userId: input.userId }, 'telegram: ignored someone who is not the owner');
        return [];
      }
      if (input.callback !== undefined) return onCallback(input.chatId, input.callback);
      const text = (input.text ?? '').trim();
      if (text.startsWith('/')) {
        // A new command abandons whatever input was pending, so its text is never taken as an argument.
        pending.cancel(input.chatId);
        return onCommand(input.chatId, text);
      }
      return onText(input.chatId, text);
    },
    commands() {
      return [
        { command: 'start', description: t('core.cmd.start') },
        ...m.actions.flatMap((a) => (a.command ? [{ command: a.command, description: t(a.label) }] : [])),
        ...(settings && !byCommand.has('settings') ? [{ command: 'settings', description: t('core.settings.title') }] : []),
        ...(m.status && !byCommand.has('status') ? [{ command: 'status', description: statusTitle() }] : []),
        ...(m.alerts.length > 0
          ? [{ command: 'pause', description: t('core.cmd.pause') }, { command: 'resume', description: t('core.cmd.resume') }]
          : []),
      ];
    },
  };
}
