import { createHash } from 'node:crypto';

/** a = action, m = menu, s = settings, c = confirm a write action, x = cancel. */
export type CallbackKind = 'a' | 'm' | 's' | 'c' | 'x';
export interface Decoded {
  kind: CallbackKind;
  id: string;
  arg?: string;
}
export type DecodeResult = { ok: true; value: Decoded } | { ok: false; reason: 'stale' | 'unknown' };

/** Telegram's limit on callback_data. */
export const MAX_CALLBACK_BYTES = 64;
/** Hashed buttons kept in memory; typed setting values each add one, so the oldest go first. */
export const MAX_HASHED = 1000;

/**
 * Buttons carry the item's id, never its position, so reordering a menu cannot
 * make an open button run a different action. The manifest revision rides along:
 * a button from an older menu is answered as stale instead of guessed at.
 */
export class CallbackCodec {
  // Hashes live in memory: after a restart an old hashed button reads as stale, which is the honest answer.
  private readonly hashed = new Map<string, Decoded>();

  constructor(private readonly rev: number) {}

  encode(kind: CallbackKind, id: string, arg?: string): string {
    const raw = `${this.rev}|${kind}:${id}${arg === undefined ? '' : `:${arg}`}`;
    if (Buffer.byteLength(raw, 'utf8') <= MAX_CALLBACK_BYTES) return raw;
    const hash = createHash('sha1').update(raw).digest('base64url').slice(0, 16);
    this.hashed.delete(hash);
    this.hashed.set(hash, { kind, id, arg });
    // Map keeps insertion order, so the first key is the oldest.
    if (this.hashed.size > MAX_HASHED) this.hashed.delete(this.hashed.keys().next().value as string);
    return `${this.rev}|h:${hash}`;
  }

  decode(data: string): DecodeResult {
    const bar = data.indexOf('|');
    if (bar < 0) return { ok: false, reason: 'unknown' };
    if (Number(data.slice(0, bar)) !== this.rev) return { ok: false, reason: 'stale' };
    const body = data.slice(bar + 1);
    if (body.startsWith('h:')) {
      const known = this.hashed.get(body.slice(2));
      return known ? { ok: true, value: known } : { ok: false, reason: 'stale' };
    }
    const m = /^([amscx]):([^:]+)(?::([\s\S]*))?$/.exec(body);
    if (!m) return { ok: false, reason: 'unknown' };
    return { ok: true, value: { kind: m[1] as CallbackKind, id: m[2] as string, arg: m[3] } };
  }
}
