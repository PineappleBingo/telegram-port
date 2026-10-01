import type { CallbackCodec } from './callback.js';
import type { SettingField, SettingsSpec } from './manifest.js';
import type { PendingInputs } from './pending.js';
import type { Translate } from './text.js';

export interface Button {
  text: string;
  data: string;
}
export interface Outgoing {
  text: string;
  buttons?: Button[][];
}

/** How the engine reads and writes the project's own config; the project decides where it lives. */
export interface ConfigAdapter {
  get(path: string): unknown;
  set(path: string, value: unknown): Promise<void> | void;
}

type Parsed = { ok: true; value: unknown } | { ok: false };

export class SettingsUi {
  private readonly fields: Map<string, SettingField>;

  constructor(
    private readonly spec: SettingsSpec,
    private readonly config: ConfigAdapter,
    private readonly t: Translate,
    private readonly codec: CallbackCodec,
    private readonly pending: PendingInputs,
    private readonly onError: (err: unknown) => string,
  ) {
    this.fields = new Map(spec.fields.map((f) => [f.id, f]));
  }

  home(): Outgoing {
    return {
      text: this.t('core.settings.title'),
      buttons: [
        ...this.spec.categories.map((c) => [{ text: this.t(c.title), data: this.codec.encode('s', `c.${c.id}`) }]),
        [{ text: this.t('core.back'), data: this.codec.encode('m', 'main') }],
      ],
    };
  }

  async onCallback(chatId: number, id: string, arg: string | undefined): Promise<Outgoing[]> {
    const dot = id.indexOf('.');
    const op = dot < 0 ? id : id.slice(0, dot);
    const target = dot < 0 ? '' : id.slice(dot + 1);
    if (op === 'c') return [this.category(target)];
    const field = this.fields.get(target);
    if (op === 'home' || !field) return [this.home()];
    if (op === 'f') return [this.editor(field)];
    if (op === 'i') {
      this.pending.set(chatId, { kind: 'setting', fieldId: field.id });
      return [{ text: this.t('core.settings.enter', { range: this.range(field), value: this.current(field) }), buttons: [this.cancelRow()] }];
    }
    const parsed = this.parse(field, arg ?? '', false);
    if (!parsed.ok) return [this.editor(field)];
    if (op === 'v') return [this.confirm(field, parsed.value)];
    if (op === 'y') return [await this.save(field, parsed.value)];
    return [this.home()];
  }

  async onInput(chatId: number, fieldId: string, text: string): Promise<Outgoing[]> {
    const field = this.fields.get(fieldId);
    if (!field) return [this.home()];
    const parsed = this.parse(field, text.trim().replace(/%$/, '').trim(), true);
    if (!parsed.ok) {
      // Ask again rather than drop the user back at the menu after one typo.
      this.pending.set(chatId, { kind: 'setting', fieldId });
      return [{ text: this.t('core.settings.invalid', { range: this.range(field) }), buttons: [this.cancelRow()] }];
    }
    return [this.confirm(field, parsed.value)];
  }

  private category(catId: string): Outgoing {
    const cat = this.spec.categories.find((c) => c.id === catId);
    if (!cat) return this.home();
    return {
      text: this.t(cat.title),
      buttons: [
        ...this.spec.fields
          .filter((f) => f.category === catId)
          .map((f) => [{ text: `${this.t(f.label)}: ${this.current(f)}`, data: this.codec.encode('s', `f.${f.id}`) }]),
        [{ text: this.t('core.back'), data: this.codec.encode('s', 'home') }],
      ],
    };
  }

  private editor(f: SettingField): Outgoing {
    const pick = (value: string, text: string) => ({ text, data: this.codec.encode('s', `v.${f.id}`, value) });
    let rows: Button[][];
    if (f.kind === 'boolean') {
      rows = [[pick('true', this.t('core.settings.on')), pick('false', this.t('core.settings.off'))]];
    } else if (f.kind === 'enum') {
      rows = (f.options ?? []).map((o) => [pick(o, this.t.has(`${f.label}.${o}`) ? this.t(`${f.label}.${o}`) : o)]);
    } else {
      rows = [[{ text: this.t('core.settings.enterBtn'), data: this.codec.encode('s', `i.${f.id}`) }]];
    }
    rows.push([{ text: this.t('core.back'), data: this.codec.encode('s', `c.${f.category}`) }]);
    return { text: `${this.t(f.label)}: ${this.current(f)}`, buttons: rows };
  }

  private confirm(f: SettingField, value: unknown): Outgoing {
    return {
      text: this.t('core.settings.confirm', { field: this.t(f.label), from: this.current(f), to: this.format(f, value) }),
      buttons: [
        [{ text: this.t('core.confirm.yes'), data: this.codec.encode('s', `y.${f.id}`, String(value)) }],
        this.cancelRow(),
      ],
    };
  }

  private async save(f: SettingField, value: unknown): Promise<Outgoing> {
    const back = [[{ text: this.t('core.back'), data: this.codec.encode('s', `c.${f.category}`) }]];
    try {
      await this.config.set(f.path, value);
    } catch (err) {
      return { text: this.onError(err), buttons: back };
    }
    const key = f.apply === 'restart' ? 'core.settings.restart' : 'core.settings.saved';
    return { text: this.t(key, { field: this.t(f.label), value: this.format(f, value) }), buttons: back };
  }

  /** `fromInput`: a ratio typed by a person is a percentage; one from a button is already a fraction. */
  private parse(f: SettingField, raw: string, fromInput: boolean): Parsed {
    if (f.kind === 'boolean') return raw === 'true' || raw === 'false' ? { ok: true, value: raw === 'true' } : { ok: false };
    if (f.kind === 'enum') return f.options?.includes(raw) ? { ok: true, value: raw } : { ok: false };
    if (raw === '') return { ok: false };
    let n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false };
    if (f.kind === 'int' && !Number.isInteger(n)) return { ok: false };
    if (f.ratio && fromInput) n = Math.round(n * 1e6) / 1e8;
    const min = f.min ?? (f.ratio ? 0 : -Infinity);
    const max = f.max ?? (f.ratio ? 1 : Infinity);
    return n >= min && n <= max ? { ok: true, value: n } : { ok: false };
  }

  private current(f: SettingField): string {
    return this.format(f, this.config.get(f.path));
  }

  private format(f: SettingField, v: unknown): string {
    if (v === undefined || v === null) return '—';
    if (f.kind === 'boolean') return this.t(v ? 'core.settings.on' : 'core.settings.off');
    if (f.ratio && typeof v === 'number') return `${Math.round(v * 1000) / 10}%`;
    return String(v);
  }

  private range(f: SettingField): string {
    if (f.ratio) return `${Math.round((f.min ?? 0) * 100)}–${Math.round((f.max ?? 1) * 100)}%`;
    return `${f.min ?? '−∞'}–${f.max ?? '∞'}`;
  }

  private cancelRow(): Button[] {
    return [{ text: this.t('core.cancel'), data: this.codec.encode('x', 'cancel') }];
  }
}
