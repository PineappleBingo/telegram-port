import type { Manifest } from './manifest.js';
import type { Translate } from './text.js';

export interface EngineLog {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * Alerts are fire-and-forget for the app: a send that fails is logged, never
 * thrown, so a Telegram outage cannot fail the work that raised the alert.
 */
export class Alerts {
  private isPaused = false;

  constructor(
    private readonly o: { manifest: Manifest; t: Translate; send: (text: string) => Promise<void>; log?: EngineLog },
  ) {}

  get paused(): boolean {
    return this.isPaused;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  async send(id: string, vars: Record<string, string | number> = {}): Promise<boolean> {
    const spec = this.o.manifest.alerts.find((a) => a.id === id);
    if (!spec) {
      this.o.log?.warn({ id }, 'unknown telegram alert');
      return false;
    }
    // `mutable: false` marks alerts that must get through even while paused (failures, stops).
    if (this.isPaused && spec.mutable) return false;
    try {
      await this.o.send(this.o.t(spec.template, vars));
      return true;
    } catch (err) {
      this.o.log?.warn({ id, err: String(err) }, 'telegram alert not sent');
      return false;
    }
  }
}
