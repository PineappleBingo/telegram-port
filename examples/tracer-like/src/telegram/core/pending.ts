/** What the next plain-text message from a chat will be taken as. */
export type Pending =
  | { kind: 'arg'; actionId: string }
  | { kind: 'danger'; actionId: string; arg?: string }
  | { kind: 'setting'; fieldId: string };

/** Long enough to look a value up; short enough that a stale wait cannot swallow a later message. */
export const INPUT_TTL_MS = 5 * 60_000;

export class PendingInputs {
  private readonly byChat = new Map<number, { pending: Pending; at: number }>();

  constructor(
    private readonly ttlMs = INPUT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  set(chatId: number, pending: Pending): void {
    this.byChat.set(chatId, { pending, at: this.now() });
  }

  cancel(chatId: number): void {
    this.byChat.delete(chatId);
  }

  /** One-shot: the wait is gone after this, answered or expired. */
  take(chatId: number): { pending: Pending } | { expired: true } | null {
    const entry = this.byChat.get(chatId);
    if (!entry) return null;
    this.byChat.delete(chatId);
    return this.now() - entry.at > this.ttlMs ? { expired: true } : { pending: entry.pending };
  }
}
