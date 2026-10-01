/** Engine version; the skill compares it with the plugin's before replacing a project's copy. Keep in step with ./VERSION. */
export const CORE_VERSION = '0.1.0';

export { startTelegram, deliver, type StartOptions, type TelegramHandle, type BotLike, type TelegramApiLike } from './bot.js';
export {
  createEngine,
  type ActionHandler, type ActionResult, type AuditEvent, type Bindings, type Button, type ConfigAdapter,
  type Engine, type EngineLog, type EngineOptions, type Incoming, type Outgoing, type StatusFn,
} from './engine.js';
export {
  validateManifest, ManifestError, ManifestSchema, DEFAULT_SECRET_PATTERNS,
  type Manifest, type ManifestLike, type ActionId, type StatusField, type AlertId,
} from './manifest.js';
export { Alerts } from './alerts.js';
export { CORE_MESSAGES } from './messages.core.js';
export { simulate, type SimReport, type SimProblem } from './testing/simulate.js';
export type { Messages } from './text.js';
